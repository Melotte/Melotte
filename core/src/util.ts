import CID from "cids";


export async function sleep(time: number): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, time));
}


export async function raceOrNull<T>(data: Promise<T>[]): Promise<T | null> {
	if(data.length === 0) {
		return null;
	} else {
		return await Promise.race(data);
	}
}


export function getShortCidStr(cid: CID): string {
	const cidStr = cid.toString("base58btc");
	return `${cidStr.substr(0, 5)}...${cidStr.slice(-2)}`;
}


export type WrappedPrimitive = String | Number | Boolean | Symbol | BigInt | undefined;

export type Primitive<T> = (
	(T extends String ? string : never) |
	(T extends Number ? number : never) |
	(T extends Boolean ? boolean : never) |
	(T extends Symbol ? symbol : never) |
	(T extends BigInt ? bigint : never) |
	(T extends undefined ? undefined : never) |
	(T extends WrappedPrimitive ? never : Object)
);


// Unsound code is tested below for extra safety
export function toPrimitive<T>(object: T): Primitive<T>;
export function toPrimitive<T>(object: T): Primitive<WrappedPrimitive> | Object {
	if(
		object instanceof String ||
		object instanceof Number ||
		object instanceof Boolean ||
		object instanceof Symbol ||
		object instanceof BigInt
	) {
		return object.valueOf();
	} else {
		return object;
	}
}


export function assertType<T>(object: T) {
}


assertType<number>(toPrimitive(new Number(123)));
assertType<string>(toPrimitive(new String("abc")));
assertType<boolean>(toPrimitive(new Boolean(false)));
assertType<symbol>(toPrimitive(<Symbol>new Object(Symbol())));
assertType<bigint>(toPrimitive(<BigInt>new Object(BigInt(123))));

assertType<number>(toPrimitive(123));
assertType<string>(toPrimitive("abc"));
assertType<boolean>(toPrimitive(false));
assertType<symbol>(toPrimitive(Symbol()));
assertType<bigint>(toPrimitive(BigInt(123)));

{
	class A {
	}
	assertType<A>(toPrimitive(new A()));
}


export function tryToPrimitive<T>(ctor: { new(): T } | undefined, value: unknown): Primitive<T>;
export function tryToPrimitive<T>(ctor: { new(): T } | undefined, value: unknown): Primitive<WrappedPrimitive> | Object {
	if(ctor === undefined) {
		if(value !== undefined) {
			throw new TypeError(`Invalid type: expected undefined, got ${typeof value}`);
		}
		return undefined;
	} else {
		const boxed = Object(value);
		if(!(boxed instanceof ctor)) {
			throw new TypeError(`Invalid type: expected ${ctor.name}, got ${typeof value}`);
		}
		return toPrimitive<T>(boxed);
	}
}


export function mapTuple<
	Tuple extends [...unknown[]],
	Callback extends (arg: Tuple[number]) => unknown
>(
	tuple: Tuple, callback: Callback
): {
	[I in keyof Tuple]: Callback extends (arg: Tuple[I]) => infer R ? R : never
} {
	return <any>tuple.map(callback);
}

assertType<[string, string]>(mapTuple([1, 2], n => n.toString()));
assertType<[number, number]>(mapTuple([1, 2], n => n));