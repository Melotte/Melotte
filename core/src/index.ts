import Peer from "./peer";
import Storage from "./storage";
import PeerId from "peer-id";
import RawMemoryStorage from "./storage/rawmemory";
import ManagementChain from "./site/management/chain";
import Script, {Language} from "./site/management/script";
import {promises as fs} from "fs";
import WASM from "./site/management/wasm";


function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}


(async () => {
	try {
		const wasm = await fs.readFile("scripts/single-owner/management-verifier.wasm");

		const peer = new Peer(await PeerId.create());
		await peer.start();
		const storage = new Storage(peer, new RawMemoryStorage());

		const genesisData = {
			managementVerifier: new Script("verify", Boolean, Language.wasm, wasm),
			metadata: {}
		};
		const chain = await ManagementChain.create(storage, genesisData);
		const genesisBlock = await chain.getGenesisBlock();
		const secondBlock = await genesisBlock.branchOff({
			managementVerifier: new Script("verify", Boolean, Language.wasm, Buffer.concat([wasm, Buffer.from([1, 2, 3])])),
			metadata: {
				1: Buffer.from([1, 2, 3, 4])
			}
		});

		console.log(await genesisBlock.verifySuccessor(secondBlock));

		/*
		const peer1 = new Peer(await PeerId.create());
		const peer2 = new Peer(await PeerId.create());
		await Promise.all([peer1.start(), peer2.start()]);
		const storage1 = new Storage(peer1, new RawMemoryStorage(), "storage1");
		const storage2 = new Storage(peer2, new RawMemoryStorage(), "storage2");

		const genesisData = {
			managementVerifier: new Script("verify", Boolean, Language.wasm, wasm),
			metadata: {}
		};
		const chain = await ManagementChain.create(storage1, genesisData);
		const genesisBlock = await chain.getGenesisBlock();
		const secondBlock = await genesisBlock.branchOff({
			managementVerifier: new Script("verify", Boolean, Language.wasm, wasm),
			metadata: {
				1: Buffer.from([1, 2])
			}
		});
		const thirdBlock = await secondBlock.branchOff({
			managementVerifier: new Script("verify", Boolean, Language.wasm, Buffer.concat([wasm, Buffer.from([0])])),
			metadata: {
				1: Buffer.from([1, 2, 3, 4])
			}
		});

		await sleep(3000);

		const chainDup = await ManagementChain.fromGenesisBlock(storage2, genesisBlock.ref);
		console.log(await chainDup.loadDiscoveredBlock(thirdBlock.ref));
		*/

		/* peer.on("peer:discovery", peer => {
			console.log("Discovered %s", peer.toB58String()); // Log discovered peer
		});

		peer.connectionManager.on("peer:connect", connection => {
			console.log("Connected to %s", connection.remotePeer.toB58String());
		}); */
	} catch(e) {
		console.log(e.stack);
	}
})();