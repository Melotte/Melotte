import {deflate, inflate} from "./zlib";
import CID from "cids";


export default class Encoder {
	async encode(data: Buffer): Promise<Buffer> {
		return await deflate(data);
	}


	async decode(data: Buffer): Promise<Buffer> {
		return await inflate(data);
	}


	async verify(data: Buffer, cid: CID): Promise<boolean> {
		return true;
	}
}