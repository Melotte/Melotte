// https://github.com/ipld/interface-ipld-format

import CID from "cids"

export interface IPLDFormat<T> {
	codec: number;
	defaultHashAlg: number;
	util: {
		serialize(node: T): Buffer;
		deserialize(buffer: Buffer): T;
		cid(binaryBlob: Buffer, options?: formatOptions): Promise<CID>;
	},
	resolver: {
		resolve(binaryBlob: Buffer, path: string): {value: CID | string | T, remainderPath: string},
		tree(binaryBlob: Buffer): AsyncGenerator<string>
	}
}

export interface formatOptions {
	cidVersion?: number,
	hashAlg?: number,
	onlyHash?: boolean,
	signal?: AbortSignal
}

export function getDefaultFormatOptions(format: IPLDFormat<any>): formatOptions {
	return {
		hashAlg: format.defaultHashAlg,
		cidVersion: 1,
		onlyHash: false
	}
}