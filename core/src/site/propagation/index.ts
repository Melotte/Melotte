import {EventEmitter} from "events";
import {ChannelManager} from "../../channel"

export class Propagator extends EventEmitter {
    // Propagate updates for this site.
    constructor(private channel: ChannelManager) {
        super()
    }
}