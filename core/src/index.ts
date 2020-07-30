import createPeer from "./node";
import Storage from "./storage";
import PeerId from "peer-id";
import RawMemoryStorage from "./storage/rawmemory";
import ManagementChain from "./site/management/chain";
import Script, {Language} from "./site/management/script";
import {promises as fs} from "fs";
import WASM from "./site/management/wasm";
import PubsubChannel from "./channel/pubsub";


function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}


(async () => {
	try {
		const wasm = await fs.readFile("scripts/single-owner/management-verifier.wasm");

		const peer1 = await createPeer({
			peerId: await PeerId.create(),
			listen: ["/ip4/0.0.0.0/tcp/2520/tls"],
			bootstrap: [""]
		});
		await peer1.start();

		const peer2 = await createPeer({
			peerId: await PeerId.create(),
			listen: ["/ip4/0.0.0.0/tcp/2521/tls"],
			bootstrap: [
				peer1.multiaddrs[0].toString() + "/p2p/" + peer1.peerId.toB58String()
			]
		});
		await peer2.start();

		await peer2.dial(peer1.peerId);

		const pubsub1 = new PubsubChannel(peer1);
		const pubsub2 = new PubsubChannel(peer2);

		/* pubsub1.subscribe("melotte-test");
		pubsub2.subscribe("melotte-test");

		await sleep(500);

		pubsub1.send("melotte-test", Buffer.from("Hello, world!"));

		await sleep(100);

		pubsub1.unsubscribe("melotte-test");
		pubsub2.unsubscribe("melotte-test"); */

		const storage1 = new Storage(peer1, new RawMemoryStorage(), "storage1");
		const storage2 = new Storage(peer2, new RawMemoryStorage(), "storage2");

		const genesisData = {
			managementVerifier: new Script("verify", Boolean, Language.wasm, wasm),
			metadata: {}
		};
		const chain = await ManagementChain.create(storage1, pubsub1, genesisData);
		const genesisBlock = await chain.getGenesisBlock();

		await sleep(3000);

		const chainDup = await ManagementChain.fromGenesisBlock(storage2, pubsub2, genesisBlock.ref);

		const secondBlock = await genesisBlock.branchOff({
			managementVerifier: new Script("verify", Boolean, Language.wasm, wasm),
			metadata: {
				1: Buffer.from([1, 2])
			}
		});

		const thirdBlock = await secondBlock.branchOff({
			managementVerifier: new Script("verify", Boolean, Language.wasm, wasm),
			metadata: {
				1: Buffer.from([1, 2, 3, 4])
			}
		});

		await sleep(2000);

		console.log("Request block");
		console.log(await chainDup.loadDiscoveredBlock(thirdBlock.ref));
	} catch(e) {
		console.log(e.stack);
	}
})();