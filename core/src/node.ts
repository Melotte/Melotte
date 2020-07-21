import Libp2p from "libp2p";

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
			listen: ["/ip4/127.0.0.1/tcp/0", "/ip6/127.0.0.1/tcp/0"]
		},
		modules: {
			transport: [TCP, WebSockets],
			streamMuxer: [Mplex, Spdy],
			connEncryption: [SecIO, NOISE],
			peerDiscovery: [MulticastDNS, Bootstrap, KadDHT],
			// contentRouting: [KadDHT],
			// peerRouting: [KadDHT],
			dht: KadDHT
			// pubsub:
		},
		config: {
			peerDiscovery: {
				autoDial: true,
				[MulticastDNS.tag]: {
					enabled: true,
					list: []
				},
				[Bootstrap.tag]: {
					enabled: true,
					list: [
						"/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
						"/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
						"/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
						"/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt",
						"/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ",
						"/ip4/104.131.131.82/udp/4001/quic/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ"
					]
				}
			},
			dht: {
				enabledDiscovery: true
			}
		}
	});
}