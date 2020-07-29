import Libp2p from "libp2p";
import Multiaddr from "multiaddr";

// Transports
import TCP from "libp2p-tcp";
import TLS from "./libp2p-tls"
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
import PeerId from "peer-id";


interface PeerOptions {
	peerId?: PeerId,
	listen?: string[],
	bootstrap?: string[]
}


export default async function createLibp2p(options?: PeerOptions): Promise<Libp2p> {
	options = options || {};
	options.peerId = options.peerId || await PeerId.create();
	options.bootstrap = options.bootstrap || [];

	return new Libp2p({
		peerId: options.peerId,
		addresses: {
			listen: options.listen
		},
		modules: {
			transport: [TLS, WebSockets, TCP],
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
						// "/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ",
						// "/ip4/104.236.176.52/tcp/4001/p2p/QmSoLnSGccFuZQJzRadHn95W2CrSFmZuTdDWP8HXaHca9z",
						// "/ip4/104.236.179.241/tcp/4001/p2p/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM",
						// "/ip4/162.243.248.213/tcp/4001/p2p/QmSoLueR4xBeUbY9WZ9xGUUxunbKWcrNFTDAadQJmocnWm",
						// "/ip4/128.199.219.111/tcp/4001/p2p/QmSoLSafTMBsPKadTEgaXctDQVcqN88CNLHXMkTNwMKPnu",
						// "/ip4/104.236.76.40/tcp/4001/p2p/QmSoLV4Bbm51jM9C4gDYZQ9Cy3U6aXMJDAbzgu2fzaDs64",
						// "/ip4/178.62.158.247/tcp/4001/p2p/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd",
						// "/ip4/178.62.61.185/tcp/4001/p2p/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3",
						// "/ip4/104.236.151.122/tcp/4001/p2p/QmSoLju6m7xTh3DuokvT3886QRYqxAzb1kShaanJgW36yx"
						// "/dns4/ams-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd",
						...options.bootstrap
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
	})
} 