import Libp2p from "libp2p";
import debug from "debug";
import {getShortPeerIdStr} from "../util";

import ChannelProtocol from ".";


export default class PubsubChannel implements ChannelProtocol {
	private debug: debug.Debugger;


	constructor(private libp2p: Libp2p, private topic: string) {
		this.debug = debug(`planet:pubsub:${getShortPeerIdStr(libp2p.peerId)}:${topic}`);
		libp2p.pubsub.subscribe([topic], this.handler.bind(this));
		this.debug("Subscribed");
	}


	destroy(): void {
		this.libp2p.pubsub.unsubscribe([this.topic]);
		this.debug("Unsubscribed");
	}


	async send(message: Buffer): Promise<void> {
		this.debug(`Sending 0x${message.toString("hex")}`);
		this.libp2p.pubsub.publish([this.topic], message);
	}


	private handler(message: {data: Buffer}): void {
		this.debug(`Received 0x${message.data.toString("hex")}`);
	}
}