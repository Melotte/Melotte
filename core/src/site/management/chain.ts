import Ref from "../ref";
import {ManagementBlock as IManagementBlock} from "../../codegen/tsproto/site/management/chain";
import Storage from "../../storage";
import debug from "debug";
import CID from "cids";
import {getShortCidStr} from "../../util";
import {ManagementBlock, IManagementBlockData, encodeGenesisBlock} from "./block";
import {ChannelProtocol} from "../../channel";


export default class ManagementChain {
	private debug: debug.Debugger;
	public channelTopic: string;


	private constructor(
		public storage: Storage,
		public channel: ChannelProtocol,
		private genesisRef: Ref<ManagementBlock>
	) {
		this.channelTopic = `/melotte/mgmtchain/${genesisRef.cid.toString("base58btc")}`;
		this.channel.on(this.channelTopic, this.channelHandler.bind(this));
		this.debug = debug(`planet:mgmtchain:${getShortCidStr(genesisRef.cid)}`);
	}


	channelHandler(cidBuffer: Buffer): void {
		const cid = new CID(cidBuffer);
		this.loadDiscoveredBlock(new Ref<ManagementBlock>(cid));
	}


	async getGenesisBlock(): Promise<ManagementBlock> {
		return await ManagementBlock.load(this, this.genesisRef);
	}


	async loadDiscoveredBlock(ref: Ref<ManagementBlock>): Promise<ManagementBlock> {
		const block = await ManagementBlock.load(this, ref);
		if(block.parent) {
			const parent = await this.loadDiscoveredBlock(block.parent);
			await parent.verifySuccessor(block);
		}
		return block;
	}


	static async fromGenesisBlock(
		storage: Storage,
		channel: ChannelProtocol,
		genesisRef: Ref<ManagementBlock>
	): Promise<ManagementChain> {
		return new ManagementChain(storage, channel, genesisRef);
	}


	static async create(
		storage: Storage,
		channel: ChannelProtocol,
		data: IManagementBlockData
	): Promise<ManagementChain> {
		const genesisBlock = encodeGenesisBlock(data);
		const genesisCid = await storage.add(genesisBlock);

		const chain = new ManagementChain(storage, channel, new Ref<ManagementBlock>(genesisCid));
		chain.debug(`Created new management chain from genesis block ${genesisCid}`);
		return chain;
	}
}