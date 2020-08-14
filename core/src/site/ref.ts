import CID from "cids";
import {getShortCidStr} from "../util";


export default class Ref<T> {
	constructor(public cid: CID, public object: boolean = false) {
	}

	toString(): string {
		return getShortCidStr(this.cid);
	}
}