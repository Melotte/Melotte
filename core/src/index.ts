import {createNode} from "./node";
import Multiaddr from "multiaddr";

(async () => {
	const node = await createNode();

	node.on("peer:discovery", peer => {
		console.log("Discovered %s", peer.toB58String()); // Log discovered peer
	});

	node.connectionManager.on("peer:connect", connection => {
		console.log("Connected to %s", connection.remotePeer.toB58String());
	});

	node.handle("/chat/1.0.0", async ({stream}) => {
		for await(const data of stream.source) {
			console.log(data.toString());
		}
	});


	await node.start();

	console.log("Node multiaddrs:", node.multiaddrs.map(addr => {
		return `${addr}/p2p/${node.peerId.toB58String()}`;
	}));

	if(process.argv.length >= 3) {
		const ma = Multiaddr(process.argv[2]);

		const {stream} = await node.dialProtocol(ma, "/chat/1.0.0");

		function sleep(ms) {
			return new Promise(resolve => setTimeout(resolve, ms));
		}
		async function* gen() {
			for(let i = 1; ; i++) {
				yield `Hello, world! ${i}\n`;
				await sleep(1000);
			}
		}
		stream.sink(gen());
	}

	//await node.stop();
	//console.log("libp2p has stopped");
})();