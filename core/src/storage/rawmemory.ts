import CID from "cids";
import IRawStorage, {NotFoundError} from "./raw";


export default class RawMemoryStorage implements IRawStorage {
	private blobList: Record<string, Buffer> = {};


	async add(data: Buffer, cid: CID): Promise<void> {
		const id = cid.toString("base58btc");
		this.blobList[id] = data;
	}


	async get(cid: CID): Promise<Buffer> {
		const id = cid.toString("base58btc");

		if(this.blobList.hasOwnProperty(id)) {
			return this.blobList[id];
		} else {
			throw new NotFoundError("Object is not available in local store");
		}
	}
}