import Libp2p from "libp2p";
import Multiaddr from "multiaddr";

// Transports
import TCP from "libp2p-tcp";
// import WebRTCStar from "libp2p-webrtc-star";
// import WebRTCDirect from "libp2p-webrtc-direct";
import WebSockets from "libp2p-websockets";
// import UTP from "libp2p-utp";

// Muxers
import Mplex from "libp2p-mplex";
import Spdy from "libp2p-spdy";

// Encryption
import SecIO from "libp2p-secio";
import {NOISE} from "libp2p-noise";

// Discovery
import MulticastDNS from "libp2p-mdns";
import Bootstrap from "libp2p-bootstrap";

// Content routing
import KadDHT from "libp2p-kad-dht";


export async function createNode() {
	return await Libp2p.create({
		addresses: {
			listen: ["/ip4/0.0.0.0/tcp/0", "/ip6/::/tcp/0"]
		},
		modules: {
			transport: [TCP, WebSockets],
			streamMuxer: [Mplex, Spdy],
			connEncryption: [SecIO, NOISE],
			peerDiscovery: [MulticastDNS, Bootstrap],
			contentRouting: [KadDHT],
			peerRouting: [KadDHT],
			dht: KadDHT
			// pubsub:
		},
		config: {
			peerDiscovery: {
				autoDial: true,
				mdns: {
					enabled: true,
					list: []
				},
				bootstrap: {
					enabled: true,
					list: [
						"/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ",
						"/ip4/104.131.131.82/udp/4001/quic/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ"
					].map(addr => Multiaddr(addr))
				}
			},
			dht: {
				enabledDiscovery: true
			}
		}
	});
}