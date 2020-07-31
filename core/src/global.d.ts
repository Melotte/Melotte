declare module "ipfs-repo" {
	import CID from "cids";
	import Multiaddr from "multiaddr";
	import DataStore from "interface-datastore/src/adapter";
	import type {Query, Key as IKey} from "interface-datastore";
	import IPLDBlock from "ipld-block";


	type Key = Buffer | string | IKey;


	interface Stat {
		numObjects: number;
		repoPath: string;
		repoSize: number;
		version: number;
		storageMax: number;
	}


	interface Lock {
		lock(dir: string): Promise<{close: () => Promise<void>}>;
		locked(dir: string): Promise<boolean>;
	}


	class Repo {
		closed: boolean;
		path: string;

		constructor(path: string, options?: {
			autoMigrate?: boolean,
			lock?: Lock | "fs" | "memory",
			storageBackends?: {
				root?: DataStore,
				blocks?: DataStore,
				keys?: DataStore,
				datastore?: DataStore
			}
		});

		init(data: unknown): Promise<void>;
		open(): Promise<void>;
		close(): Promise<void>;

		exists(): Promise<boolean>;
		isInitialized(): Promise<boolean>;

		put(key: Key, value: Buffer): Promise<void>;
		get(key: Key): Promise<Buffer>;
		stat(): Promise<Stat>;

		blocks: {
			put(block: IPLDBlock): Promise<IPLDBlock>;
			putMany(source: AsyncIterable<IPLDBlock>): AsyncIterator<IPLDBlock>;
			get(cid: CID): Promise<IPLDBlock>;
			getMany(source: AsyncIterable<CID>): AsyncIterable<IPLDBlock>;
			has(cid: CID): Promise<boolean>;
			delete(cid: CID): Promise<boolean>;
			query<T>(query: Query<T>): AsyncIterator<IPLDBlock | CID>;
			delete(cid: CID): Promise<CID>;
			deleteMany(source: AsyncIterable<CID>): AsyncIterator<CID>;
		};

		// datastore: ???

		config: {
			set(key: string, value: unknown): Promise<void>;
			replace(value: unknown): Promise<void>;
			get(key: string): Promise<unknown>;
			getAll(): Promise<unknown>;
			exists(): Promise<boolean>;
		};

		version: {
			get(): Promise<number>;
			set(version: number): Promise<void>;
		};

		apiAddr: {
			get(): Promise<string>;
			set(value: Multiaddr | string): Promise<void>;
		};
	}

	export = Repo;
}