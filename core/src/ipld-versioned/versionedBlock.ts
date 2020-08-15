import CID from "cids";
import {BlockType, VersionedBlock_Association, VersionedBlock_Dependency, VersionedBlock_Parent, VersionedBlock_Reference, VersionedBlock as IVersionedBlock} from "../codegen/tsproto/ipld-versioned/versioned"

export class VersionedBlock {
    #cids = new Map<number, CID>();
    // Fields that can be accessed with dag path notation
    /**
     *  Explicitly mark this version as a new branch
     */
    explicitBranch: boolean;
    /**
     *  Optional
     */
    branchName: string;
    /**
     *  To mark important versions
     */
    tagName: string;
    /**
     *  ID of the verifier for this block in mgmt chain
     */
    verifierId: number;
    block?: Buffer;
    // Instantiated types
    timestamp: Date;
    cid?: CID;
    // Links
    parents: Parent[];
    refs: Reference[];
    dependencies: Dependency[];
    associations: Association[];
    constructor(public originalBlock?: IVersionedBlock) {
        if(!originalBlock)
            return
        for(const key in originalBlock)
            if(key in ['explicitBranch', 'branchName', 'tagName', 'verifierId', 'block'])
                this[key] = originalBlock[key]
        this.timestamp = new Date(originalBlock.timestamp)
        for(const i in originalBlock.cids)
            this.#cids.set(parseInt(i), new CID(originalBlock.cids[i]))
        if(originalBlock.cid)
            this.cid = this.#cids.get(originalBlock.cid)
        this.parents = originalBlock.parents.map(v => <Parent>{...v, cid: this.#cids.get(v.cid)})
        this.refs = originalBlock.refs.map(v => <Reference>{...v, cid: this.#cids.get(v.cid)})
        this.dependencies = originalBlock.dependencies.map(v => <Dependency>{...v, cid: this.#cids.get(v.cid)})
        this.associations = originalBlock.associations.map(v => <Association>{...v, cid: this.#cids.get(v.cid)})
    }
    toProtoBuf(): IVersionedBlock {
        const cids = new Map<string, number>()
        let i = 0;
        const converted = {};
        for(const key of ['parents', 'refs', 'dependencies', 'associations']) {
            for(; i < this[key].length;) {
                const k = this[key][i].cid.toString()
                if(cids.has(k))
                    continue;
                cids.set(k, i)
                i++
            }
            converted[key] = this[key].map(v => ({...v, cid: cids.get(v.cid.toString())}))
        }
        const inverted: {[key: number]: Buffer} = {}
        for(const [k, v] of cids)
            inverted[v] = new CID(k).buffer

        // @ts-expect-error
        const encoded: IVersionedBlock = <VersionedBlock>{
            ...this,
            ...converted,
            timestamp: this.timestamp.getTime(),
            cids: inverted
        }
        return encoded
    }
}

export class Parent {
    cid: CID;
    blockType: BlockType;
    size: number;
    type: string;
}

export class Dependency {
    /**
     *  CID of a block
     */
    cid: CID;
    optional: boolean;
    /**
     *  Application-specific
     */
    name: string;
    type: string;
}

export class Association {
    cid: CID;
    /**
     *  Arbitrary type defined by application
     */
    type: string;
}

export class Reference {
    /**
     *  One of the versions of the target object
     */
    cid: CID;
    /**
     *  As a new branch of this object
     */
    branchName: string;
    /**
     *  master branch by default
     */
    referenceBranch: string;
}