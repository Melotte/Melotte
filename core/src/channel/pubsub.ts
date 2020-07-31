import Libp2p from "libp2p";
import debug from "debug";
import {getShortPeerIdStr} from "../util";

import {ChannelProtocol} from ".";


export default class PubsubChannel implements ChannelProtocol {
	private debug: debug.Debugger;

	protocolName = "pubsub"
	constructor(private libp2p: Libp2p) {
		this.debug = debug(`planet:pubsub:${getShortPeerIdStr(libp2p.peerId)}`);
	}


	on(topic: string, handler: (Buffer) => void): void {
		this.libp2p.pubsub.subscribe([topic], msg => this.handler(topic, msg, handler));
		this.debug(`Subscribed to ${topic}`);
	}


	unsubscribe(topic: string): void {
		this.libp2p.pubsub.unsubscribe([topic]);
		this.debug(`Unsubscribed from ${topic}`);
	}


	async send(topic: string, message: Buffer): Promise<void> {
		this.debug(`Sending 0x${message.toString("hex")} to ${topic}`);
		this.libp2p.pubsub.publish([topic], message);
	}


	private handler(topic: string, message: {data: Buffer}, callback: (Buffer) => void): void {
		this.debug(`Received 0x${message.data.toString("hex")} from ${topic}`);
		callback(message.data);
	}
}