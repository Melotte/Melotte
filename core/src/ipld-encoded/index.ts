import {formatOptions, IPLDFormat} from "../block/ipld-format"
import {cid} from "./genCid"
import {EncodedBlock as IEncodedBlock, EncodedBlock_Action, Link} from "../codegen/tsproto/ipld-encoded/encoded"
import CID from "cids"
import {codec, defaultHashAlg} from "./genCid"
import Block from "ipld-block"

class IPLDEncodedBlock implements IPLDFormat<EncodedBlock> {
	resolver = {
		resolve(buf: Buffer, path: string) {
			let node = EncodedBlockFormat.util.deserialize(buf)
			const parts = path.split("/").filter(Boolean)
			while(parts.length) {
				const key = parts.shift()
				if(!key)
					continue
				if(node[key] === undefined) {
					// Directly access links of this node
					for(const link of node.links) {
						if(link.name === key) {
							return {
								value: link.cid,
								remainderPath: parts.join('/')
							}
						}
					}
					if(typeof key === "number" && node?.links[key]) { // Access with index
						return {
							value: node.links[key].cid,
							remainderPath: parts.join('/')
						}
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
			return {
				value: node,
				remainderPath: ''
			}
		},
		async *tree(binaryBlob: Buffer): AsyncGenerator<string> {
			const node = EncodedBlockFormat.util.deserialize(binaryBlob)
			for(const item of Object.keys(this))
				yield item
			for(let ii = 0; ii < node.links.length; ii++) {
				yield `links/${ii}`
				yield `links/${ii}/name`
				yield `links/${ii}/size`
				yield `links/${ii}/cid`
			}
		}
	};
	util = {
		serialize(node: EncodedBlock): Buffer {
			return Buffer.from(IEncodedBlock.encode(node.toProtobuf()).finish())
		},
		deserialize(buf: Buffer): EncodedBlock {
			const decoded = IEncodedBlock.decode(buf)
			return new EncodedBlock(decoded)
		},
		async cid(buf: Buffer, options?: formatOptions): Promise<CID> {
			return cid(buf, options)
		}
	};
	codec = codec;
	defaultHashAlg = defaultHashAlg;
	EncodedBlock = EncodedBlock;
	EncodedBlockLink = EncodedBlockLink;
}

class EncodedBlock {
	#cids = new Map<number, CID>();
	#originalBlock?: IEncodedBlock; // Hidden from dag
	links: EncodedBlockLink[];
	encrypted: boolean;
	encryptionAlg: number;
	constructor(originalBlock?: IEncodedBlock) {
		if(!originalBlock)	// Creating a new EncodedBlock
			return
		this.#originalBlock = originalBlock
		for(const i in originalBlock.cids)
			this.#cids.set(parseInt(i), new CID(originalBlock.cids[i]))
		this.links = originalBlock.links.map(l => new EncodedBlockLink(this.#cids[l.cid], l.name, l.size))
		this.encrypted = originalBlock.encrypted;
		this.encryptionAlg = originalBlock.encryptionAlg;
	}
	async decode(getBlock: (cid: CID) => Promise<Block>, evaluatedSize: number): Promise<Buffer> {
		const bytes = new Uint8Array(evaluatedSize)
		if(!this.#originalBlock?.actions || !this.#cids)
			return Buffer.alloc(0)
		let start = 0;
		for(const a of this.#originalBlock.actions) {
			let copied = 0;
			if(a.copy) {
				if(!this.#cids.has(a.copy.base))
					throw new Error(`Expected to have CID for ${a.copy.base}`)
				const buf: Buffer = (await getBlock(<CID>this.#cids.get(a.copy.base))).data
				copied = buf.copy(bytes, start, a.copy.offset, a.copy.offset + a.copy.length)
				if(copied !== a.copy.length)
					throw new Error("Delta-encoding data length mismatch")
			} else if(a.insert) {
				copied = a.insert.data.copy(bytes)
				if(copied !== a.insert.data.length)
					throw new Error("Delta-encoding data length mismatch")
			}
			start += copied
		}
		return Buffer.from(bytes)
	}
	// Evaluate deltaSize, and limit for various metrics, 
	async evaluate(): Promise<number> {
		if(!this.#originalBlock?.actions)
			throw new Error("expected delta-encoding actions")
		let t = 0;
		this.#originalBlock.actions.forEach(val => {
			if(val.copy) {
				if(val.copy.length === 0) // Non-sense action with length of zero
					throw new Error("Invalid block, copying zero length data from delta base")
				t += val.copy.length
			} else if(val.insert)
				t += val.insert.data.length
		})
		return t
	}
	toProtobuf(actions?: EncodedBlock_Action[]): IEncodedBlock {
		const cids = new Map<string, number>()
		if(!actions)
			actions = this.#originalBlock?.actions
		if(!actions)
			throw new Error("expected delta-encoding actions")
		let i = 0;
		for(; i < this.links.length; i++)
			cids.set(this.links[i].cid.toString(), i)
		const inverted = {}
		for(const [k, v] of cids)
			inverted[v] = new CID(k).buffer
		const encoded: IEncodedBlock = {
			cids: inverted,
			actions,
			links: <Link[]>this.links.map(v => ({cid: cids.get(v.cid.toString()), name: v.name, size: v.size})),
			encrypted: this.encrypted,
			encryptionAlg: this.encryptionAlg
		}
		return encoded
	}
}

class EncodedBlockLink {
	constructor(public cid: CID, public name: string, public size: number) {}
}

const EncodedBlockFormat = new IPLDEncodedBlock()

export = EncodedBlockFormat