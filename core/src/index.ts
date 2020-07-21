import Libp2p from "libp2p";
import Libp2pWebSockets from "libp2p-websockets";
import {NOISE} from "libp2p-noise";

(async () => {
	console.log("booting");
	const node = await Libp2p.create({
		addresses: {
			listen: ["/ip4/127.0.0.1/tcp/8000/ws"]
		},
		modules: {
			transport: [Libp2pWebSockets],
			connEncryption: [NOISE]
		}
	});

	await node.start();
	console.log("libp2p has started");
	const listenAddrs = node.transportManager.getAddrs();
	console.log("libp2p is listening on the following addresses:", listenAddrs);
	const advertiseAddrs = node.multiaddrs;
	console.log("libp2p is advertising the following addresses:", advertiseAddrs);
	await node.stop();
	console.log("libp2p has stopped");
})();