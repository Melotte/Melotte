import {BlockManager} from "../../block";
import Repo from "../../repo";
import {VersionedBlock} from "../../ipld-versioned/versionedBlock"

// An object makes sense only when its site is present
// It can be anything, including an IPFS block, since it's an interface to operate objects, or create objects.
// To unify the operations, a site normally use objects, not blocks.
export class SiteObject {
    public branch = new Branch(this); // An object is also a branch, in some senses.
    constructor(public block: BlockManager, public repo: Repo, private arbitraryVersion: VersionedBlock) {
        // Locate an object with an abitrary version it has
    }
    async archiveSince(time: Date) {}
    async archiveBefore(target: Branch | VersionedBlock) {}
    async archiveAny(targets: (Branch | VersionedBlock)[]) {}
    async append() {}
    async previous() {}
    async next() {}
}

export class Branch {
    constructor(public siteObj: SiteObject, private arbitraryVersion?: VersionedBlock, private depth?: number) {}
    async *branches(stopAt?: VersionedBlock) {
        // List known branches of this branch
    }
}