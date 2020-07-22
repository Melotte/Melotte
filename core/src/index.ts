import Peer from "./peer";
import Storage from "./storage";
import Multiaddr from "multiaddr";
import PeerId from "peer-id";
import path from "path";
import CID from "cids";
import RawMemoryStorage from "./storage/rawmemory";


function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}


(async () => {
	const peer1 = new Peer(await PeerId.create());
	const peer2 = new Peer(await PeerId.create());

	await Promise.all([peer1.start(), peer2.start()]);

	/* peer.on("peer:discovery", peer => {
		console.log("Discovered %s", peer.toB58String()); // Log discovered peer
	});

	peer.connectionManager.on("peer:connect", connection => {
		console.log("Connected to %s", connection.remotePeer.toB58String());
	}); */

	const storage1 = new Storage(peer1, new RawMemoryStorage(), "storage1");
	const storage2 = new Storage(peer2, new RawMemoryStorage(), "storage2");

	const cid = new CID("zb2rhYSxw4ZjuzgCnWSt19Q94ERaeFhu9uSqRgjSdx9bsgM6f");
	await storage1.add(Buffer.from([1, 2, 3]), cid);
	await sleep(5000);
	console.log(await storage2.get(cid));
	console.log(await storage2.get(cid));


	/* await peer.start();

	console.log("Node multiaddrs:", peer.multiaddrs.map(addr => {
		return `${addr}/p2p/${peer.peerId.toB58String()}`;
	}));

	if(process.argv.length >= 3) {
		const ma = Multiaddr(process.argv[2]);

		const {stream} = await peer.dialProtocol(ma, "/chat/1.0.0");

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

	//await peer.stop();
	//console.log("libp2p has stopped"); */
})();