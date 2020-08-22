import Libp2p from "libp2p";
import BlockProtocol from "./blockProtocol";
import CID from "cids"
import IPLDBlock from "ipld-block"
import {type} from "os";
import Repo from "ipfs-repo"
import mergeOptions from "merge-options"
import {IPLDFormat, formatOptions, getDefaultFormatOptions} from "./ipld-format"
import multicodec from "multicodec"
import {extendIterator} from "../util"
import typical from "typical"

// Rewritten ipfs-block-service to support more block protocols
// Both block and dag are called block here

class BlockManager {
	public blockProtocols = new Map<string, BlockProtocol>();
	public defaultOptions: options;
	private formats = new Map<number, IPLDFormat<any>>();
	constructor(public libp2p: Libp2p, public repo: Repo) {}
	private mergeOptions(options: options = {}) {
		return mergeOptions(this.defaultOptions, options)
	}
	async init(protocols: BlockProtocol[], formats: IPLDFormat<any>[], options?: options) {
		for(const proto of protocols)
			this.blockProtocols.set(proto.protocolName, proto)
		for(const [name, proto] of this.blockProtocols)
			await proto.init()
		this.defaultOptions = {include: Array.from(this.blockProtocols.keys()), repoOnly: false, noExternal: false, ...options}
		const mergedOptions = this.mergeOptions(options)
		if(mergedOptions.noExternal)
			this.defaultOptions.include = ["bitswap"]
		for(const format of formats)
			this.addFormat(format)
	}
	async getBlock(cid: CID, options?: options): Promise<IPLDBlock> {
		const mergedOptions = this.mergeOptions(options)
		const protos = this.filterProtocols(mergedOptions),
			filtered = protos.map(([k, p]) => p.get(cid, mergedOptions))
		if(this.hasBitswap(protos))
			filtered.push(this.blockProtocols.get("bitswap")!.get(cid, mergedOptions))
		else
			filtered.push(this.repo.blocks.get(cid))
		if(filtered.length > 0) {
			const block: IPLDBlock = await Promise.race(filtered)
			const format: IPLDFormat<any> = this.getFormat(block.cid.codec)
			return format.util.deserialize(block.data)
		} else
			throw new BlockError("No protocol available")
	}
	async getNode(cid: CID, options?: options): Promise<any> {
		const block = await this.getBlock(cid, options),
			format = await this.getFormat(block.cid.codec)
		return format.util.deserialize(block.data)
	}
	async *getBlocks(cids: CID[], options?: options): AsyncGenerator<IPLDBlock> {
		const mergedOptions = this.mergeOptions(options)
		const protocols = this.filterProtocols(mergedOptions)
		if(protocols.length > 0)
			for(const cid of cids) {
				const ps = protocols.map(([k, p]) => p.get(cid, mergedOptions))
				if(this.hasBitswap(protocols))
					ps.push(this.blockProtocols.get("bitswap")!.get(cid, mergedOptions))
				else
					ps.push(this.repo.blocks.get(cid))
				const block: IPLDBlock = await Promise.race(ps)
				const format: IPLDFormat<any> = this.getFormat(block.cid.codec)
				yield format.util.deserialize(block.data)
			}
		else
			throw new BlockError("No protocol available")
	}
	getNodes(cids: CID[], options?: options) {
		if(!typical.isIterable(cids) || typeof cids === 'string' || Buffer.isBuffer(cids))
			throw new BlockError('`cids` must be an iterable of CIDs')
		const generator = async function* () {
			for await(const cid of cids)
				yield this.get(cid, options)
		}.bind(this)
		return extendIterator(generator())
	}
	async putBlock(block: IPLDBlock, options?: options): Promise<IPLDBlock | void> {
		const mergedOptions = this.mergeOptions(options)
		const protos = this.filterProtocols(mergedOptions),
			filtered = protos.map(([k, p]) => p.put(block, mergedOptions))
		if(this.hasBitswap(protos))
			filtered.push(this.blockProtocols.get("bitswap")!.put(block))
		else
			filtered.push(this.repo.blocks.put(block))
		if(filtered.length > 0)
			return await Promise.race(filtered)
		else
			throw new BlockError("No protocol available")
	}
	async putNode<N>(node: N, codec: number, options?: formatOptions & options): Promise<CID> {
		const format: IPLDFormat<N> = this.getFormat(codec)
		const buf: Buffer = format.util.serialize(node)
		const cid: CID = await format.util.cid(buf, mergeOptions(getDefaultFormatOptions(format), options))
		if(!options?.onlyHash) {
			const block = new IPLDBlock(buf, cid)
			await this.putNode(block, codec, options)
		}
		return cid
	}
	async *putBlocks(blocks: IPLDBlock[], options?: options): AsyncGenerator<IPLDBlock> {
		options = this.mergeOptions(options)
		const protocols = this.filterProtocols(options)
		if(protocols.length > 0)
			for(const block of blocks) {
				const ps = protocols.map(([k, p]) => p.put(block, options))
				if(this.hasBitswap(protocols))
					ps.push(this.blockProtocols.get("bitswap")!.put(block))
				else
					ps.push(this.repo.blocks.put(block))
				yield Promise.race(ps)
			}
		else
			throw new BlockError("No protocol available")
	}
	putNodes<N>(nodes: Iterable<N>, format: number, options?: formatOptions & options): Iterator<Promise<CID>> {
		if(!typical.isIterable(nodes) || typeof nodes === 'string' || Buffer.isBuffer(nodes))
			throw new BlockError('`nodes` must be an iterable')
		const gen = async function* () {
			for await(const node of nodes) {
				yield this.putNode(node, format, options)
			}
		}.bind(this)
		return extendIterator(gen())
	}
	filterProtocols(options?: options) {
		if(!options)
			options = this.defaultOptions
		return Array.from(this.blockProtocols.entries())
			.filter(([k, p]) => options!.include!.includes(k) && options!.exclude !== k)
	}
	async delete(cid: CID, options?) {
		return this.repo.blocks.delete(cid)
	}
	async has(cid: CID) {
		return await this.repo.blocks.has(cid)
	}
	private hasBitswap(protocols: [string, BlockProtocol][]): boolean { // Bitswap is special. It can get block from local
		return protocols.find(e => e[0] === "bitswap") != undefined
	}
	addFormat(format: IPLDFormat<any>): void {
		if(this.formats.has(format.codec))
			throw new BlockError("Format already exists")
		this.formats.set(format.codec, format)
	}
	removeFormat(codec: number): void {
		if(this.formats.has(codec))
			this.formats.delete(codec)
		else
			throw new BlockError("Format doesn't exist")
	}
	private getFormat(codec: number | string): IPLDFormat<any> {
		if(typeof codec === 'string') {
			const constantName = codec.toUpperCase().replace(/-/g, '_')
			codec = multicodec[constantName]
		}
		if(this.formats.has(<number>codec))
			return this.formats.get(<number>codec) as IPLDFormat<any>
		throw new BlockError("Format not supported or loaded")
	}

	resolve(cid: CID | null, path: string, options?: options): Iterator<Promise<{remainderPath: string, value: CID | null}>> {
		const generator = async function* () {
			// End iteration if there isn't a CID to follow anymore
			while(cid !== null) {
				const format = await this.getFormat(cid.codec)

				// get block
				// use local resolver
				// update path value
				const block = await this.getBlock(cid, options)
				const result = format.resolver.resolve(block.data, path)

				// Prepare for the next iteration if there is a `remainderPath`
				path = result.remainderPath
				let value = result.value
				// NOTE vmx 2018-11-29: Not all IPLD Formats return links as
				// CIDs yet. Hence try to convert old style links to CIDs
				if(Object.keys(value).length === 1 && '/' in value) {
					try {
						value = new CID(value['/'])
					} catch(_error) {
						value = null
					}
				}
				cid = CID.isCID(value) ? value : null

				yield {
					remainderPath: path,
					value
				}
			}
		}.bind(this)

		return extendIterator(generator())
	}
	tree(cid: CID | null, offsetPath: string, userOptions?: {recursive: boolean}): Iterator<Promise<CID>> {
		const defaultOptions = {
			recursive: false
		}
		const options = mergeOptions(defaultOptions, userOptions)

		// If a path is a link then follow it and return its CID
		const maybeRecurse = async (block, treePath) => {
			// A treepath we might want to follow recursively
			const format = await this.getFormat(block.cid.codec)
			const result = format.resolver.resolve(block.data, treePath)
			// Something to follow recusively, hence push it into the queue
			if(CID.isCID(result.value)) {
				return result.value
			} else {
				return null
			}
		}

		const generator = async function* () {
			// The list of paths that will get returned
			const treePaths: string[] = []
			// The current block, needed to call `isLink()` on every interation
			let block
			// The list of items we want to follow recursively. The items are
			// an object consisting of the CID and the currently already resolved
			// path
			const queue = [{cid, basePath: ''}]
			// The path that was already traversed
			let basePath

			// End of iteration if there aren't any paths left to return or
			// if we don't want to traverse recursively and have already
			// returne the first level
			while(treePaths.length > 0 || queue.length > 0) {
				// There aren't any paths left, get them from the given CID
				if(treePaths.length === 0 && queue.length > 0) {
					({cid, basePath} = queue.shift() as {cid: CID, basePath: string})
					const format = await this.getFormat(cid.codec)
					block = await this.getBlock(cid, options)

					const paths = format.resolver.tree(block.data)
					treePaths.push(...paths)
				}

				const treePath = treePaths.shift()
				let fullPath = basePath + treePath

				// Only follow links if recursion is intended
				if(options.recursive) {
					cid = await maybeRecurse(block, treePath)
					if(cid !== null) {
						queue.push({cid, basePath: fullPath + '/'})
					}
				}

				// Return it if it matches the given offset path, but is not the
				// offset path itself
				if(fullPath.startsWith(offsetPath) &&
					fullPath.length > offsetPath.length) {
					if(offsetPath.length > 0) {
						fullPath = fullPath.slice(offsetPath.length + 1)
					}

					yield fullPath
				}
			}
		}.bind(this)

		return extendIterator(generator())
	}
}

interface options {
	noExternal?: boolean; // Only bitswap
	exclude?: string; // Protocol to exclude from include
	include?: string[];
	repoOnly?: boolean; // Get from repo only
}

class BlockError extends Error {
	constructor(msg?: string, public internal?: Error) {
		super(msg)
		Object.setPrototypeOf(this, BlockError.prototype)
	}
}

export {IPLDBlock, BlockProtocol, BlockManager, options as BlockOptions, BlockError}
export * from "./bitswap"