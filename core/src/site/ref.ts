import CID from "cids";
import {getShortCidStr} from "../util";


export default class Ref<T> {
	constructor(public cid: CID) {
	}

	toString(): string {
		return getShortCidStr(this.cid);
	}
}