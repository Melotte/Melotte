import {Connection} from "libp2p-interfaces/src/connection";
import debug from "debug";
import BufferList from "bl";
import {AbortError} from "abortable-iterator";


class OutputStream {
	private sendQueue: Buffer[] = [];
	private flushSendQueue: (() => void) | undefined;


	constructor(stream) {
		stream.sink(this.outputGenerator());
	}


	private async* outputGenerator(): AsyncIterable<Buffer> {
		while(true) {
			while(this.sendQueue.length > 0) {
				yield <Buffer>this.sendQueue.shift();
			}

			await new Promise(resolve => {
				this.flushSendQueue = resolve;
			});
			this.flushSendQueue = undefined;
		}
	}


	send(data: Buffer): void {
		this.sendQueue.push(data);
		if(this.flushSendQueue) {
			this.flushSendQueue();
		}
	}
}


class Stream {
	private output: OutputStream;
	private seqId: bigint = 0n;
	private callbacks: Map<bigint, ((data: Buffer) => void)>;


	private constructor(stream) {
		this.output = new OutputStream(stream);
		this.callbacks = new Map();
		this.inputListener(stream.source);
	}


	static parseMessage(message: BufferList): {id: bigint, data: Buffer} {
		if(message.length < 8) {
			throw new RangeError("Message is too small");
		}
		return {
			id: message.slice(0, 8).readBigUInt64BE(0),
			data: message.slice(8)
		};
	}


	static prependId(id: bigint, data: Buffer): Buffer {
		const idBuf = Buffer.alloc(8);
		idBuf.writeBigUInt64BE(id, 0);
		return Buffer.concat([idBuf, data]);
	}


	private async inputListener(source: AsyncIterable<BufferList>): Promise<void> {
		try {
			for await(const message of source) {
				const {id, data} = Stream.parseMessage(message);
				const cb = this.callbacks.get(id);
				if(cb) {
					this.callbacks.delete(id);
					cb(data);
				}
			}
		} catch(e) {
			if(e instanceof AbortError) {
				return;
			}
			throw e;
		}
	}


	static async create(connection: typeof Connection, protocol: string): Promise<Stream> {
		const {stream} = await connection.newStream(protocol);
		return new Stream(stream);
	}


	async query(data: Buffer): Promise<Buffer> {
		const messageId = this.seqId++;
		this.output.send(Stream.prependId(messageId, data));
		return await new Promise<Buffer>(resolve => {
			this.callbacks.set(messageId, resolve);
		});
	}
}


export async function handleStream(stream, handler: (data: Buffer) => Promise<Buffer>) {
	const output = new OutputStream(stream);
	try {
		for await(const message of stream.source) {
			(async () => {
				const {id, data} = Stream.parseMessage(message);
				output.send(Stream.prependId(id, await handler(data)));
			})();
		}
	} catch(e) {
		if(e instanceof AbortError) {
			return;
		}
		throw e;
	}
}


const activeStreamsByProtocol: Record<string, WeakMap<typeof Connection, Stream>> = {};


export async function getTransport(connection: typeof Connection, protocol: string): Promise<Stream> {
	if(!activeStreamsByProtocol[protocol]) {
		activeStreamsByProtocol[protocol] = new WeakMap();
	}

	const streams = activeStreamsByProtocol[protocol];
	if(streams.has(connection)) {
		return <Stream>streams.get(connection);
	} else {
		const stream = await Stream.create(connection, protocol);
		streams.set(connection, stream);
		return stream;
	}
}