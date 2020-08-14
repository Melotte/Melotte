import {Script as IScript} from "../../codegen/tsproto/site/management/chain";
import {tryToPrimitive, Primitive, mapTuple} from "../../util";
import WASM, {CPtr} from "./wasm";
import debug from "debug";


export enum Language {
	// This enum values must be equal to C API values
	wasm = 1
}

// Constructable in wasm
export interface IConstructable<T> {
	constructInWasm(wasm: WASM): CPtr<T>;
	deconstructInWasm(wasm: WASM, ptr: CPtr<T>): void;
}

type Constructable<T = unknown> = number | IConstructable<T>;


export class InvalidScriptError extends Error {
}


export default class Script<FuncName extends string = string, Args extends Constructable[] = Constructable[], R = unknown> {
	private debug: debug.Debugger;


	constructor(
		private funcName: FuncName,
		private returnCtor: new() => R,
		public language: Language,
		public code: Buffer
	) {
		this.debug = debug(`planet:script:${funcName}`);
	}


	private async runWasm(...args: Args): Promise<Primitive<R>> {
		this.debug(`Run ${this.funcName}(${args.join(", ")})`);

		const wasm = await WASM.create(this.code);

		// Allocate memory for arguments
		type AllocatedArg = (
			{arg: number, ptr: undefined} |
			{arg: IConstructable<unknown>, ptr: CPtr<unknown>}
		);

		const toFree: AllocatedArg[] = args.map((arg: Constructable): AllocatedArg => {
			if(typeof arg === "number") {
				return {
					arg,
					ptr: undefined
				};
			} else {
				return {
					arg,
					ptr: arg.constructInWasm(wasm)
				};
			}
		});

		const callArgs = toFree.map((val: AllocatedArg): CPtr<unknown> | number => {
			return val.ptr === undefined ? val.arg : val.ptr;
		});

		// Convert primitives to wrapped types and back to primitives.
		// This allows simple return type check
		let result: unknown = wasm.callNumber(this.funcName, ...callArgs);

		this.debug(`Result: ${result}`);

		// Free memory
		for(const obj of toFree) {
			if(obj.ptr !== undefined) {
				obj.arg.deconstructInWasm(wasm, obj.ptr);
			}
		}

		// TypeScript knows that there *exists* R such that 'new () => R' and
		// 'BooleanConstructor' have no overlap; the wording is wrong, as well
		// as the error itself.
		//   This condition will always return 'false' since the types
		//   'new () => R' and 'BooleanConstructor' have no overlap.
		// @ts-expect-error
		if(this.returnCtor === Boolean && typeof result === "number") {
			// Special case: WebAssembly returns an integer instead of a boolean
			if(result === 0) {
				result = false;
			} else if(result === 1) {
				result = true;
			}
		}

		return tryToPrimitive(this.returnCtor, result);
	}


	async run(...args: Args): Promise<Primitive<R>> {
		switch(this.language) {
			case Language.wasm:
				return await this.runWasm(...args);

			default:
				throw new Error(`Unknown script language: ${this.language}`);
		}
	}


	static fromInterface<Args extends Constructable[]>() {
		return function<FuncNameT extends string, T>(funcName: FuncNameT, returnCtor: new() => T, script: IScript) {
			return new Script<FuncNameT, Args, T>(funcName, returnCtor, script.language, script.code);
		};
	}
}