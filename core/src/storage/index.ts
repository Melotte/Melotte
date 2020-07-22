import multihashing from "multihashing-async";
import CID from "cids";
import PeerId from "peer-id";
import Multiaddr from "multiaddr";
import {Connection} from "libp2p-interfaces/src/connection";

import IRawStorage, {NotFoundError} from "./raw";
import Encoder from "./encoder";
import Peer from "../peer";
import {sleep, raceOrNull} from "../util";
import {handleStream, getTransport} from "../transport";
import debug from "debug";


const LIST_DIAL_INTERVAL = 300;


export default class Storage {
	private encoder: Encoder;
	private debug: debug.Debugger;

	constructor(public peer: Peer, private rawStorage: IRawStorage, public id: string = "storage") {
		this.debug = debug(`planet:${id}`);

		this.encoder = new Encoder();

		peer.handle("/planet/storage/1.0.0", ({stream}) => {
			handleStream(stream, this.streamHandler.bind(this));
		});
	}


	private async streamHandler(request: Buffer): Promise<Buffer> {
		try {
			const cid = new CID(request);
			const data = await this.rawStorage.get(cid);
			return await this.encoder.encode(data);
		} catch(e) {
			this.debug(`Could not share object 0x${request.toString("hex")}: ${e.message}`);
			return Buffer.alloc(0);
		}
	}


	private async* findProviders(cid: CID): AsyncIterable<{id: PeerId, multiaddrs: Multiaddr[]}> {
		yield* this.peer.contentRouting.findProviders(cid, {
			timeout: 5000
		});
	}


	private async peekFromConnection(connection: typeof Connection, cid: CID): Promise<Buffer> {
		const transport = await getTransport(connection, "/planet/storage/1.0.0");
		const encodedData = await transport.query(cid.buffer);
		if(encodedData.length === 0) {
			throw new Error("remote: Unknown object");
		}
		const data = await this.encoder.decode(encodedData);
		if(!await this.encoder.verify(data, cid)) {
			throw new Error("Invalid object hash");
		}
		return data;
	}


	private async peek(cid: CID): Promise<Buffer> {
		const cidStr = cid.toString("base58btc");
		const log = debug(`planet:${this.id}:${cidStr.substr(0, 5)}...${cidStr.slice(-2)}`);

		log("Peeking");

		const providers: {id: PeerId, multiaddrs: Multiaddr[]}[] = [];
		for await(const provider of this.findProviders(cid)) {
			providers.push(provider);
		}


		// Try downloading from connected peers first
		log("1. Downloading from connected peers");
		let result = await raceOrNull(
			providers
				.map(provider => this.peer.connectionManager.get(provider.id))
				.filter(connection => connection)
				.map(async (connection, i) => {
					// Only connect if the previous peer didn't answer in time
					await sleep(i * LIST_DIAL_INTERVAL);

					log(`1.${i + 1}. Peeking from connection ${connection.id}`);
					try {
						return await this.peekFromConnection(connection, cid);
					} catch(e) {
						if(e.code) {
							log(`1.${i + 1}. Failed: ${e}`);
							return null;
						} else {
							// Fail fast
							throw e;
						}
					}
				})
		);
		if(result !== null) {
			return result;
		}

		// Download from disconnected peers with known multiaddrs
		log("2. Downloading from disconnected peers with known multiaddrs");
		result = await raceOrNull(
			providers
				.filter(provider => !this.peer.connectionManager.get(provider.id))
				.filter(provider => provider.multiaddrs)
				.map(async (provider, i) => {
					// Only connect if the previous peer didn't answer in time
					await sleep(i * 100);

					log(`2.${i + 1}. Peeking from provider ${provider.id}`);
					try {
						const connection = await this.peer.dial(provider.id);
						return await this.peekFromConnection(connection, cid);
					} catch(e) {
						if(e.code) {
							log(`2.${i + 1}. Failed: ${e}`);
							return null;
						} else {
							// Fail fast
							throw e;
						}
					}
				})
		);
		if(result !== null) {
			return result;
		}

		// Download from disconnected unknown peers
		log("3. Downloading from disconnected unknown peers");
		result = await raceOrNull(
			providers
				.filter(provider => !provider.multiaddrs)
				.map(async (provider, i) => {
					// Only connect if the previous peer didn't answer in time
					await sleep(i * 100);

					log(`3.${i + 1}. Peeking from provider ${provider.id}`);
					try {
						await this.peer.peerRouting.findPeer(provider.id);
						const connection = await this.peer.dial(provider.id);
						return await this.peekFromConnection(connection, cid);
					} catch(e) {
						if(e.code) {
							log(`3.${i + 1}. Failed: ${e}`);
							return null;
						} else {
							// Fail fast
							throw e;
						}
					}
				})
		);
		if(result !== null) {
			return result;
		}

		log("Failed to download block");
		throw new Error(`Could not download object ${cid} from network`);
	}


	async add(data: Buffer, cid: CID): Promise<void> {
		await this.rawStorage.add(data, cid);
		await this.peer.contentRouting.provide(cid);
	}


	async get(cid: CID): Promise<Buffer> {
		try {
			return await this.rawStorage.get(cid);
		} catch(e) {
			if(!(e instanceof NotFoundError)) {
				throw e;
			}
		}

		const data = await this.peek(cid);
		await this.add(data, cid);
		return data;
	}
}