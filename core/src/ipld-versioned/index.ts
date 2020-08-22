import {IPLDFormat} from "../block/ipld-format"
import {cid} from "./genCid"
import {VersionedBlock as IVersionedBlock} from "../codegen/tsproto/ipld-versioned/versioned"
import CID from "cids"
import {codec, defaultHashAlg} from "./genCid"
import {VersionedBlock} from "./versionedBlock"

class IPLDVersionedBlock implements IPLDFormat<VersionedBlock> {
	resolver = {
		resolve(buf: Buffer, path: string) {
			let node = VersionedBlockFormat.util.deserialize(buf)
			const parts = path.split('/').filter(Boolean)
			while(parts.length) {
				const key = parts.shift()
				if(!key)
					continue
				if(node[key] === undefined) {
					throw new Error(`Object has no property '${key}'`)
				}
				node = node[key]
				if(CID.isCID(node)) {
					return {
						value: node,
						remainderPath: parts.join('/')
					}
				}
			}

			return {
				value: node,
				remainderPath: ''
			}
		},
		async *tree(binaryBlob: Buffer): AsyncGenerator<string> {
			const node = VersionedBlockFormat.util.deserialize(binaryBlob)
			yield* VersionedBlockFormat.resolver.traverse(node)
		},
		*traverse(obj: Object, path?: string) {
			if(obj instanceof Uint8Array || CID.isCID(obj) || typeof obj === 'string' || obj === null) {
				return
			}
			for(const item of Object.keys(obj)) {
				const nextpath = path === undefined ? item : path + '/' + item
				yield nextpath
				yield* VersionedBlockFormat.resolver.traverse(obj[item], nextpath)
			}
		}
	};
	util = {
		serialize(node: VersionedBlock): Buffer {
			const n = node.toProtoBuf()
			return Buffer.from(IVersionedBlock.encode(n).finish())
		},
		deserialize(buf: Buffer): VersionedBlock {
			return new VersionedBlock(IVersionedBlock.decode(buf))
		},
		async cid(buf, options): Promise<CID> {
			return cid(buf, options)
		}
	};
	codec = codec;
	defaultHashAlg = defaultHashAlg;
}

const VersionedBlockFormat = new IPLDVersionedBlock()

export = VersionedBlockFormat