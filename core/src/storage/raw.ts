import CID from "cids";


export class NotFoundError extends Error {
}


export default interface IRawStorage {
	add(data: Buffer, cid: CID): Promise<void>;
	get(cid: CID): Promise<Buffer>;
}