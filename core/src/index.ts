import {createNode} from "./node";

(async () => {
	const node = await createNode();

	node.on("peer:discovery", peer => {
		console.log("Discovered %s", peer.id.toB58String()) // Log discovered peer
	});

	node.on("peer:connect", peer => {
		console.log("Connected to %s", peer.id.toB58String()) // Log connected peer
	});

	await node.start();
	console.log("libp2p has started");
	const listenAddrs = node.transportManager.getAddrs();
	console.log("libp2p is listening on the following addresses:", listenAddrs);
	const advertiseAddrs = node.multiaddrs;
	console.log("libp2p is advertising the following addresses:", advertiseAddrs);
	//await node.stop();
	//console.log("libp2p has stopped");
})();