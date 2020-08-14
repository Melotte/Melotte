import {IPLDFormat} from "../block/ipld-format"
import {cid} from "./genCid"
import {VersionedBlock as IVersionedBlock} from "../codegen/tsproto/ipld-versioned/versioned"
import CID from "cids"
import {codec, defaultHashAlg} from "./genCid"

class IPLDVersionedBlock implements IPLDFormat<IVersionedBlock> {
	resolver = {
		resolve(buf: Buffer, path: string) {
			const node = VersionedBlock.util.deserialize(buf)
			const parts = path.split('/').filter(Boolean)
			while(parts.length) {
				const key = parts.shift()
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
		*tree() {
			const node = VersionedBlock.util.deserialize(binaryBlob)
			yield* VersionedBlock.resolver.traverse(node)
		},
		*traverse(obj: Object, path: string) {
			if(obj instanceof Uint8Array || CID.isCID(obj) || typeof obj === 'string' || obj === null) {
				return
			}
			for(const item of Object.keys(obj)) {
				const nextpath = path === undefined ? item : path + '/' + item
				yield nextpath
				yield* traverse(obj[item], nextpath)
			}
		}
	};
	util = {
		serialize(node: IVersionedBlock): Buffer {
			return Buffer.from(IVersionedBlock.encode(node).finish())
		},
		deserialize(buf: Buffer): IVersionedBlock {
			return IVersionedBlock.decode(buf)
		},
		async cid(buf, options): Promise<CID> {
			return cid(buf, options)
		}
	};
	codec = codec;
	defaultHashAlg = defaultHashAlg;
}

const VersionedBlock = new IPLDVersionedBlock()

export {VersionedBlock}