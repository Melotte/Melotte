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


export default class Peer extends Libp2p {
	constructor(peerId) {
		super({
			peerId,
			addresses: {
				listen: ["/ip4/0.0.0.0/tcp/0", "/ip6/::/tcp/0"]
			},
			modules: {
				transport: [TCP, WebSockets],
				streamMuxer: [Mplex, Spdy],
				connEncryption: [SecIO, NOISE],
				peerDiscovery: [MulticastDNS, Bootstrap],
				contentRouting: [],
				peerRouting: [],
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
							"/ip4/104.236.176.52/tcp/4001/p2p/QmSoLnSGccFuZQJzRadHn95W2CrSFmZuTdDWP8HXaHca9z",
							"/ip4/104.236.179.241/tcp/4001/p2p/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM",
							"/ip4/162.243.248.213/tcp/4001/p2p/QmSoLueR4xBeUbY9WZ9xGUUxunbKWcrNFTDAadQJmocnWm",
							"/ip4/128.199.219.111/tcp/4001/p2p/QmSoLSafTMBsPKadTEgaXctDQVcqN88CNLHXMkTNwMKPnu",
							"/ip4/104.236.76.40/tcp/4001/p2p/QmSoLV4Bbm51jM9C4gDYZQ9Cy3U6aXMJDAbzgu2fzaDs64",
							"/ip4/178.62.158.247/tcp/4001/p2p/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd",
							"/ip4/178.62.61.185/tcp/4001/p2p/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3",
							"/ip4/104.236.151.122/tcp/4001/p2p/QmSoLju6m7xTh3DuokvT3886QRYqxAzb1kShaanJgW36yx"
						].map(addr => Multiaddr(addr))
					}
				},
				dht: {
					enabled: true,
					enabledDiscovery: true,
					randomWalk: {
						enabled: true,
						interval: 300e3,
						timeout: 10e3
					}
				}
			}
		});
	}
}