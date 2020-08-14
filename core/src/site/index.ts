import {EventEmitter} from "events";
import {BlockManager} from "../block";
import {ChannelManager} from "../channel";
import Repo from "../repo";
import {Propagator} from "./propagation/"
import {SiteObject} from "./object"

export default class Site extends EventEmitter {
    public propagation: Propagator;
    public object: SiteObject;
    constructor(public block: BlockManager, public channel: ChannelManager, public repo: Repo) {
        super()
        this.propagation = new Propagator(channel)
        this.object = new SiteObject(block, repo)
    }
}