import {tryToPrimitive, Primitive} from "../../util";
import metering from "wasm-metering";
import debug from "debug";


const PAGE_SIZE = 65536;
const TOTAL_MEMORY = 4 * PAGE_SIZE;


class CallError extends Error {
}

export class CPtr<T = unknown> {
	private _distinguisher: T;

	constructor(private type: string | ({prototype: T} & Function), public value: number) {
	}

	toString(): string {
		const typeStr = (
			typeof this.type === "string"
				? this.type
				: this.type.name
		);
		return `(${typeStr}*)${this.value}`;
	}
}

type Argument = number | CPtr;


export default class WASM {
	public memory: Uint8Array;
	private usedGas = 0;
	private debug: debug.Debugger;

	private static id: number = 1;


	private constructor(private instance: WebAssembly.Instance, id: number, memory: WebAssembly.Memory) {
		this.debug = debug(`planet:wasm:runner${id}`);
		this.memory = new Uint8Array(memory.buffer)
	}


	copy(from: Buffer, to: CPtr): void {
		this.memory.set(from, to.value);
	}


	private useGas(gas: number): void {
		this.usedGas += gas;
		// console.log(this.usedGas);
	}


	static async create(code: Buffer): Promise<WASM> {
		const timeStart = Date.now();

		const meteredCode = metering.meterWASM(code, {
			meterType: "i32"
		})

		const waModule = await WebAssembly.compile(meteredCode);

		for(const exported of WebAssembly.Module.exports(waModule)) {
			if(exported.kind === "memory") {
				throw new Error("Modules are not allowed to export memory");
			}
		}

		let minimumMemory: number | undefined = undefined;
		for(const imported of WebAssembly.Module.imports(waModule)) {
			if(imported.module === "env" && imported.name === "memory" && imported.kind === "memory") {
				if(!("type" in imported)) {
					throw new Error("V8 was run without --experimental-wasm-type-reflection flag");
				}
				minimumMemory = (<{type: {minimum: number}}>imported).type.minimum;
			}
		}

		const imports: {
			env: {[key: string]: any},
			metering: {[key: string]: any}
		} = {
			env: {},
			metering: {
				usegas(gas) {
					wasm.useGas(gas);
				}
			}
		};

		if(minimumMemory !== undefined) {
			const maximumMemory = TOTAL_MEMORY / PAGE_SIZE;
			if(minimumMemory > maximumMemory) {
				throw new Error("Too much memory requested");
			}
			imports.env.memory = new WebAssembly.Memory({
				initial: minimumMemory,
				maximum: maximumMemory
			});
		}

		const instance = await WebAssembly.instantiate(waModule, imports);
		const wasm = new WASM(instance, WASM.id++, imports.env.memory);
		wasm.debug(`Initialized in ${Date.now() - timeStart}ms`);
		return wasm;
	}


	get(name: string): unknown {
		return this.instance.exports[name];
	}

	// returnCtor: return constructor
	private call<T extends Number | undefined>(retTypeStr: string, returnCtor: undefined | {new(): T}, funcName: string, ...args: Argument[]): Primitive<T> {
		const loadedFunc = this.get(funcName);
		if(typeof loadedFunc !== "function") {
			throw new CallError(`'${funcName}' is not exported`);
		}
		if(loadedFunc.length !== args.length) {
			throw new CallError(`'${funcName}' has invalid signature: ${args.length} argument(s) passed, ${loadedFunc.length} argument(s) exported`);
		}
		const func = <(...args: number[]) => unknown>loadedFunc;

		const prevUsedGas = this.usedGas;
		const ret = func(...args.map(arg => arg instanceof CPtr ? arg.value : arg));
		const value = tryToPrimitive(returnCtor, ret);

		this.debug(
			`${funcName}(${args.join(", ")}) -> ` +
			(value === undefined ? "void" : `(${retTypeStr})${value}`) +
			`: ${this.usedGas - prevUsedGas} gas`
		);
		return value;
	}

	callVoid(funcName: string, ...args: Argument[]): void {
		return this.call<undefined>("void", undefined, funcName, ...args);
	}

	callNumber(funcName: string, ...args: Argument[]): number {
		return this.call("int", Number, funcName, ...args);
	}

	callCPtr<T>(type: string | ({prototype: T} & Function), funcName: string, ...args: Argument[]): CPtr<T> {
		const typeStr = (typeof type === "string" ? type : type.name) + "*";
		return new CPtr<T>(type, this.call(typeStr, Number, funcName, ...args));
	}
}