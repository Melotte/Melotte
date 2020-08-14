import {EventEmitter} from "events";
import {ChannelManager} from "../../channel"

export class Propagator extends EventEmitter {
    constructor(private channel: ChannelManager) {
        super()
    }
}