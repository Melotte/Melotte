import CID from "cids"
import Block from "ipld-block"
import {Block as BlockManager} from "./index"

// Reference IPFS BlockService
// BlockProtocols should translate IPFS formats into corresponding formats

export default abstract class BlockProtocol {
	abstract protocolName: string;
	abstract init(): void;
	abstract put(block: Block, options?): Promise<Block>;
	abstract get(cid: CID, options?): Promise<Block>;
	async delete(cid: CID, options?): Promise<boolean> {
		return true
	}
}