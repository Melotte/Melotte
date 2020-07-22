import {deflate, inflate} from "./zlib";
import CID from "cids";
import multihashing from "multihashing-async";


export default class Encoder {
	async encode(data: Buffer): Promise<Buffer> {
		return await deflate(data);
	}


	async decode(encodedData: Buffer): Promise<Buffer> {
		return await inflate(encodedData);
	}


	async getCid(data: Buffer): Promise<CID> {
		const hash = await multihashing(data, "sha2-256");
		return new CID(1, "raw", hash, "base58btc");
	}


	async verify(data: Buffer, cid: CID): Promise<boolean> {
		return cid.equals(await this.getCid(data));
	}
}