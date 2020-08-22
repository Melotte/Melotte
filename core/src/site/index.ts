import {EventEmitter} from "events";
import {BlockManager} from "../block";
import {ChannelManager} from "../channel";
import Repo from "../repo";
import {Propagator} from "./propagation/"
import {SiteObject} from "./object"
import {VersionedBlock} from "../../ipld-versioned/versionedBlock"

export default class Site extends EventEmitter {
    public propagation: Propagator;
    constructor(public block: BlockManager, public channel: ChannelManager, public repo: Repo) {
        super()
        this.propagation = new Propagator(channel)
    }
    getObject(arbitraryVersion: VersionedBlock): SiteObject {
        return new SiteObject(this.block, this.repo, arbitraryVersion)
    }
}