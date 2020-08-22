import BlockProtocol from "./blockProtocol";
import {IPLDBlock} from "./index"
import Bitswap from "ipfs-bitswap"
import CID from "cids"

export default class BitswapProtocol extends BlockProtocol {
	public bitswap: Bitswap;
	public protocolName = "bitswap";
	constructor(private blockManager: IPLDBlock) {
		super()
		this.bitswap = new Bitswap(this.blockManager.libp2p, this.blockManager.repo.blocks, {statsEnabled: true})
	}
	async init(): void {
		await this.bitswap.start()
	}
	async put(block: IPLDBlock, options?): Promise<IPLDBlock> {
		return await this.bitswap.put(block, options)
	}
	async get(cid: CID, options?): Promise<IPLDBlock> {
		return await this.bitswap.get(cid, options)
	}
}