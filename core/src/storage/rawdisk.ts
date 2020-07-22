import CID from "cids";
import {promises as fs} from "fs";
import path from "path";
import {Mutex} from "async-mutex";
import IRawStorage, {NotFoundError} from "./raw";


export default class RawDiskStorage implements IRawStorage {
	private fileMutexes: Record<string, Mutex> = {};

	constructor(public storageRoot: string) {
	}


	async add(data: Buffer, cid: CID): Promise<void> {
		const id = cid.toString("base58btc");

		const directory = path.join(this.storageRoot, id.substr(0, 2));
		const filePath = path.join(directory, id.substr(2));
		await fs.mkdir(directory, {
			recursive: true
		});

		if(!this.fileMutexes[filePath]) {
			this.fileMutexes[filePath] = new Mutex();
		}

		const release = await this.fileMutexes[filePath].acquire();
		try {
			await fs.access(filePath);
		} catch(e) {
			if(e.code !== "ENOENT") {
				throw e;
			}

			// File was not added to the database yet, and we hold the lock
			const tmpPath = filePath + ".temp";
			const tmpFile = await fs.open(tmpPath, "w");
			await tmpFile.writeFile(data);
			await tmpFile.close();

			await fs.rename(tmpPath, filePath);
		} finally {
			release();
		}
	}


	async get(cid: CID): Promise<Buffer> {
		const id = cid.toString("base58btc");

		const filePath = path.join(this.storageRoot, id.substr(0, 2), id.substr(2));

		try {
			return await fs.readFile(filePath);
		} catch(e) {
			if(e.code !== "ENOENT") {
				throw e;
			}
			throw new NotFoundError("Object is not available in local store");
		}
	}
}