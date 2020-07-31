
import mergeOptions from "merge-options"

export class ChannelManager {
	defaultOptions: options = {onlyDefault: true, defaultChannel: "pubsub"};
	private protocols = new Map<string, ChannelProtocol>();
	constructor(protocols: ChannelProtocol[], options?: options) {
		this.defaultOptions = mergeOptions(this.defaultOptions, options)
		protocols.forEach(v => this.protocols.set(v.protocolName, v))
		if(this.defaultOptions.onlyDefault)
			if(!this.protocols.has(this.defaultOptions.defaultChannel))
				throw new ChannelError("Default protocol missing")
	}
	on(topic: string, handler: (Buffer) => void, options?: options): void {
		let opts = options ? options : this.defaultOptions
		if(opts.onlyDefault)
			this.protocols.get(opts.defaultChannel)!.on(topic, handler)
		else
			this.protocols.forEach(p => p.on(topic, handler))
	}
	unsubscribe(topic: string, options?: options): void {
		let opts = options ? options : this.defaultOptions
		if(opts.onlyDefault)
			this.protocols.get(opts.defaultChannel)!.unsubscribe(topic)
		else
			this.protocols.forEach(p => p.unsubscribe(topic))
	}
	async send(topic: string, message: Buffer, options?: options): Promise<void> {
		let opts = options ? options : this.defaultOptions
		if(opts.onlyDefault)
			this.protocols.get(opts.defaultChannel)!.send(topic, message)
		else
			await Promise.all(Array.from(this.protocols.values()).map(p => p.send(topic, message)))
	}
}

export interface ChannelProtocol {
	on(topic: string, handler: (Buffer) => void): void;
	unsubscribe(topic: string): void;

	send(topic: string, message: Buffer): Promise<void>;
	protocolName: string;
}

export class ChannelError extends Error {
	constructor(msg?: string, public internal?: Error) {
		super(msg)
		Object.setPrototypeOf(this, ChannelError.prototype)
	}
}

export interface options {
	onlyDefault: boolean;
	defaultChannel: string;
}