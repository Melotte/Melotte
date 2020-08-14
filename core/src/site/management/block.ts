import Ref from "../ref";
import Script, {IConstructable, InvalidScriptError} from "./script";
import {ManagementBlock as IManagementBlock} from "../../codegen/tsproto/site/management/chain";
import Storage from "../../storage";
import debug from "debug";
import crypto from "crypto";
import CID from "cids";
import {getShortCidStr} from "../../util";
import WASM, {CPtr} from "./wasm";
import ManagementChain from "./chain";


export class ManagementBlock implements IConstructable<ManagementBlock> {
	private constructor(
		private chain: ManagementChain,
		public ref: Ref<ManagementBlock>,
		public managementVerifier: Script<"verify", [ManagementBlock, ManagementBlock], Boolean>,
		public metadata: {[key: number]: Buffer},
		public parent?: Ref<ManagementBlock>
	) {
	}


	toString(): string {
		return `ManagementBlock{${this.ref}}`;
	}


	async verifySuccessor(child: ManagementBlock): Promise<void> {
		if(!(await this.managementVerifier.run(child, this))) {
			throw new Error(`Block ${child.ref} is an invalid successor for ${this.ref}`);
		}
	}


	async branchOff(childData: IManagementBlockData): Promise<ManagementBlock> {
		const childInfo = {
			...childData,
			distinguisher: Buffer.alloc(0),
			parent: this.ref.cid.buffer
		};
		const childBlock = Buffer.from(IManagementBlock.encode(childInfo).finish());
		const childCid = await this.chain.storage.add(childBlock);
		const child = new ManagementBlock(
			this.chain,
			new Ref<ManagementBlock>(childCid),
			childData.managementVerifier,
			childData.metadata,
			this.ref
		);
		await this.verifySuccessor(child);
		this.chain.channel.send(this.chain.channelTopic, childCid.buffer);
		return child;
	}


	constructInWasm(wasm: WASM): CPtr<ManagementBlock> {
		const block = wasm.callCPtr(ManagementBlock, "_mgmtscript_newManagementBlock");

		function fillScript<T extends Script>(ptr: CPtr<Script>, script: T) {
			wasm.callVoid("_mgmtscript_setScriptLanguage", ptr, script.language);
			const codePtr = wasm.callCPtr("char[]", "_mgmtscript_initializeScriptCode", ptr, script.code.length);
			wasm.copy(script.code, codePtr);
		}

		fillScript(
			wasm.callCPtr(Script, "_mgmtscript_getManagementVerifier", block),
			this.managementVerifier
		);

		return block;
	}

	deconstructInWasm(wasm: WASM, ptr: CPtr<ManagementBlock>): void {
		wasm.callVoid("_mgmtscript_deleteManagementBlock", ptr);
	}


	static async load(chain: ManagementChain, ref: Ref<ManagementBlock>): Promise<ManagementBlock> {
		const raw = await chain.storage.get(ref.cid);
		const block = IManagementBlock.decode(raw);

		if(!block.managementVerifier) {
			throw new Error("Management verification script is missing");
		}

		const managementVerifier = Script.fromInterface<[ManagementBlock]>()("verify", Boolean, block.managementVerifier);

		return new ManagementBlock(
			chain,
			ref,
			managementVerifier,
			block.metadata,
			block.parent.length === 0
				? undefined
				: new Ref<ManagementBlock>(new CID(block.parent))
		);
	}
}


export function encodeGenesisBlock(data: IManagementBlockData): Buffer {
	const object = {
		...data,
		distinguisher: crypto.randomBytes(32),
		parent: Buffer.alloc(0)
	};
	return Buffer.from(IManagementBlock.encode(object).finish());
}


export interface IManagementBlockData {
	managementVerifier: Script<"verify", [ManagementBlock], Boolean>;
	// topicVerifier: Script<"verify", [Topic], Boolean>;
	// versionVerifier: Script<"verify", [Topic, Version], Boolean>;
	metadata: {[key: number]: Buffer};
}