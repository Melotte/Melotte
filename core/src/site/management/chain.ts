import Ref from "../ref";
import {ManagementBlock as IManagementBlock} from "../../codegen/tsproto/site/management/chain";
import Storage from "../../storage";
import debug from "debug";
import CID from "cids";
import {getShortCidStr} from "../../util";
import {ManagementBlock, IManagementBlockData, encodeGenesisBlock} from "./block";


export default class ManagementChain {
	private debug: debug.Debugger;


	private constructor(private storage: Storage, private genesisRef: Ref<ManagementBlock>) {
		this.debug = debug(`planet:mgmtchain:${getShortCidStr(genesisRef.cid)}`);
	}


	async getGenesisBlock(): Promise<ManagementBlock> {
		return await ManagementBlock.load(this.storage, this.genesisRef);
	}


	async loadDiscoveredBlock(ref: Ref<ManagementBlock>): Promise<ManagementBlock> {
		const block = await ManagementBlock.load(this.storage, ref);
		if(block.parent) {
			const parent = await this.loadDiscoveredBlock(block.parent);
			if(!await parent.verifySuccessor(block)) {
				throw new Error(`Block ${block.ref} is an invalid successor for ${parent.ref}`);
			}
		}
		return block;
	}


	static async fromGenesisBlock(storage: Storage, genesisRef: Ref<ManagementBlock>): Promise<ManagementChain> {
		return new ManagementChain(storage, genesisRef);
	}


	static async create(storage: Storage, data: IManagementBlockData): Promise<ManagementChain> {
		const genesisBlock = encodeGenesisBlock(data);
		const genesisCid = await storage.add(genesisBlock);

		const chain = new ManagementChain(storage, new Ref<ManagementBlock>(genesisCid));
		chain.debug(`Created new management chain from genesis block ${genesisCid}`);
		return chain;
	}
}