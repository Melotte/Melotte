import createPeer from "./node";
import PeerId from "peer-id";


(async () => {
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
})();