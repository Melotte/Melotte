import {BlockManager} from "../../block";
import Repo from "../../repo";

export class SiteObject {
    constructor(public block: BlockManager, public repo: Repo) {
    }
}