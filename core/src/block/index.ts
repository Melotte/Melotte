import Libp2p from "libp2p";
import BlockProtocol from "./blockProtocol";
import CID from "cids"
import Block from "ipld-block"
import {type} from "os";
import Repo from "ipfs-repo"
import mergeOptions from "merge-options"

// Rewritten ipfs-block-service to support more block protocols

class Block {
	public blockProtocols = new Map<string, BlockProtocol>();
	public defaultOptions: options;
	constructor(public libp2p: Libp2p, public repo: Repo) {}
	private mergeOptions(options: options = {}) {
		return mergeOptions(this.defaultOptions, options)
	}
	async init(protocols: BlockProtocol[], options?: options) {
		for(const proto of protocols)
			this.blockProtocols.set(proto.protocolName, proto)
		for(let [name, proto] of this.blockProtocols)
			await proto.init()
		this.defaultOptions = {include: Array.from(this.blockProtocols.keys()), repoOnly: false, noExternal: false, ...options}
		if(options?.noExternal)
			this.defaultOptions.include = ["bitswap"]
	}
	async get(cid: CID, options?: options): Promise<Block> {
		options = this.mergeOptions(options)
		let protos = this.filterProtocols(options),
			filtered = protos.map(([k, p]) => p.get(cid, options))
		if(this.hasBitswap(protos))
			filtered.push(this.blockProtocols.get("bitswap")!.get(cid, options))
		else
			filtered.push(this.repo.blocks.get(cid))
		if(filtered.length > 0)
			return await Promise.race(filtered)
		else
			throw new BlockError("No protocol available")
	}
	async *getMany(cids: CID[], options?: options): AsyncGenerator<Block> {
		options = this.mergeOptions(options)
		let protocols = this.filterProtocols(options)
		if(protocols.length > 0)
			for(let cid of cids) {
				let ps = protocols.map(([k, p]) => p.get(cid, options))
				if(this.hasBitswap(protocols))
					ps.push(this.blockProtocols.get("bitswap")!.get(cid, options))
				else
					ps.push(this.repo.blocks.get(cid))
				yield Promise.race(ps)
			}
		else
			throw new BlockError("No protocol available")
	}
	async put(block: Block, options?: options) {
		options = this.mergeOptions(options)
		let protos = this.filterProtocols(options),
			filtered = protos.map(([k, p]) => p.put(block, options))
		if(this.hasBitswap(protos))
			filtered.push(this.blockProtocols.get("bitswap")!.put(block))
		else
			filtered.push(this.repo.blocks.put(block))
		if(filtered.length > 0)
			return await Promise.race(filtered)
		else
			throw new BlockError("No protocol available")
	}
	async *putMany(blocks: Block[], options?: options): AsyncGenerator<Block> {
		options = this.mergeOptions(options)
		let protocols = this.filterProtocols(options)
		if(protocols.length > 0)
			for(let block of blocks) {
				let ps = protocols.map(([k, p]) => p.put(block, options))
				if(this.hasBitswap(protocols))
					ps.push(this.blockProtocols.get("bitswap")!.put(block))
				else
					ps.push(this.repo.blocks.put(block))
				yield Promise.race(ps)
			}
		else
			throw new BlockError("No protocol available")
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

export {Block, BlockProtocol, options as BlockOptions, BlockError}
export * from "./bitswap"