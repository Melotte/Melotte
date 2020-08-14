import {IPLDFormat} from "../block/ipld-format"
import {cid} from "./genCid"
import {EncodedBlock as IEncodedBlock} from "../codegen/tsproto/ipld-encoded/encoded"
import CID from "cids"
import {codec, defaultHashAlg} from "./genCid"
import {type} from "os"

// Encoding is not done here
class IPLDEncodedBlock implements IPLDFormat<IEncodedBlock> {
	resolver = {
		resolve(buf: Buffer, path: string) {
			const node = EncodedBlock.util.deserialize(buf)
			const parts = path.split("/").filter(Boolean)
			while(parts.length) {
				const key = parts.shift()
				if(node[key] === undefined) {
					// Directly access links of this node
					for(const link of node.links) {
						if(link.Name === key) {
							return {
								value: link.Hash,
								remainderPath: parts.join('/')
							}
						}
					}
					if(typeof key === "number" && node?.links[key]) {
						return node.links[key]
					}

					throw new Error(`Object has no property '${key}'`)
				}
				// Link of this node itself
				node = node[key]
				if(CID.isCID(node)) {
					return {
						value: node,
						remainderPath: parts.join('/')
					}
				}
			}
		},
		*tree() {
			const node = EncodedBlock.util.deserialize(binaryBlob)
			yield 'data'
			yield 'links'
			for(let ii = 0; ii < node.links.length; ii++) {
				yield `links/${ii}`
				yield `links/${ii}/name`
				yield `links/${ii}/size`
				yield `links/${ii}/cid`
			}
		}
	};
	util = {
		serialize(node: EncodedIEncodedBlockBlock): Buffer {
			return Buffer.from(IEncodedBlock.encode(node).finish())
		},
		deserialize(buf: Buffer): IEncodedBlock {
			return IEncodedBlock.decode(buf)
		},
		async cid(buf, options): Promise<CID> {
			return cid(buf, options)
		}
	};
	codec = codec;
	defaultHashAlg = defaultHashAlg;
}

const EncodedBlock = new IPLDEncodedBlock()

export {EncodedBlock}