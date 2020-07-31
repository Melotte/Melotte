import CID from "cids"
import IPLDBlock from "ipld-block"

// Reference IPFS BlockService
// BlockProtocols should translate IPFS formats into corresponding formats

export default abstract class BlockProtocol {
	abstract protocolName: string;
	abstract init(): void;
	abstract put(block: IPLDBlock, options?): Promise<IPLDBlock>;
	abstract get(cid: CID, options?): Promise<IPLDBlock>;
	async delete(cid: CID, options?): Promise<boolean> {
		return true
	}
}