# Planet Protocol

Planet is a decentralized application platform and framework, based on libp2p. In contrast to recent novel decentralized networks, Planet foucuses on the originial purpose of P2P, to bring privacy and anonymity. As a result, to maximize the censorship-resistence achieved by decentralization, blockchains are not built-in, yet as applications.

An overview of the whole protocol stack (bottom-up):

* Libp2p
  + More transports, e.g. kcp, tor
  + Obfuscation protocol, to replace multistream protocol
* Block protocols
  + Bitswap (Modified)
  + Compatibility protocols(Possible): Bittorrent, Dat, IPFS, ZeroNet(files only)
* Channel protocols
  + Pubsub (gossipsub/floodsub)
  + Planet protocol (custom protocol over libp2p)
* Graph data structure
  + Preparation codec
  + Management chain
  + Data graph
* Backend procedure
  + Web of trust
  + Wasm block encryption script
  + eWasm metadata validation script
  + eWasm graph validation
  + Wasm application backend
* Interface server
* Application Frontend

## Obfsucation protocols

Pattern recognition is a popular censorship method, yet most p2p protocols have obvious protocol characteristics.

## Block/Channel protocols

Channel protocols are mainly for metadata propagation. Block protocols were separated from channel protocols, in order to provide an option for peers to download only desired data.

The CID announced on the DHT is the actual data (not encoded) in data block. One of the delta methods is to compare specified block with its historical blocks, and related blocks. Intuitively, decoded data blocks are snapshots among the entire history of that block.

``` typescript
interface DataBlock { 
	timestamp: Date;
	codec: Codec;
	dataCodec: Delta | any;
	authData: {publickey: Pubkey; signature: Sig, crypt: Crypt}; // Signature of decoded data
}
interface Delta {
	items: [Buffer, CID][];  // Delta based on other blocks, ie. base
}
enum Codec {
	raw,
	delta_plaintext,
	delta_binary
}
enum Crypt {
	rsa2048,
	rsa4096
}
```

Signing blocks with its actual data, rather than encoded data makes it possible to change the base blocks. There are two ways to encode, encoding for each connection, or creating 'static' blocks. A new protocol is required for per-connection codec. According to the format of DataBlock, it is valid to make a new block and claim it is a newly encoded block of the original data, giving oppurtunies for DOS, although the actual data is signed by the content author. Conventional solution is that the content author also signs the DataBlock, ie. encoded data. 

Once it reaches deathTime of a block, most peers(without configuration of keeping history) would unpin that block. If that block is encoded in delta format, a new archived block would be created, in a deterministic manner. Historical blocks remain unchanged. 

``` typescript
interface ArchiveBlock extends DataBlock {	// Codec is raw
	historyEntry: CID;  // The CID of the first block of the archived history before current block
	archiveTime: Date;
}
```

To efficiently block spam flooding over channel protocols, we introduced *eWasm metadata validation* procedure, while enforcing a peerID field. Since metadata precedes block data, peerID is not required for a block.

> eWasm is a deterministic subset of Wasm, developed by Ethereum.

``` typescript
interface ChannelData {
	sender: PeerID|Pubkey; // sender field can be either the ‘sender' or others. For example, a peer requests the data of a site with pubkey 
	authData: Buffer;  // Signature, size limited
}
interface Metadata extends ChannelData {
	timestamp: Date;
	blocks: CID[];
	extraData: Buffer;  // Urgent data, size limited
}
interface RealTimeData extends ChannelData {  // Example: Instant messaging
	data: Buffer;
}
```

## Graph Data

Encryption should be done before codec.

``` typescript
interface EncryptedBlock extends DataBlock {
	scriptPath: any; 
}
```

Planet retains the abstraction of 'site', while offering several cross-site reuse patterns.

Management chain is the core of a site, which is fully fetched and interpreted before any other operations. A site is addressed by the publickey of the genesis block of its management chain. All 'blocks' are encoded into `DataBlock` .

``` typescript
interface MgmtBlock { // It's the encoded data, so not extending DataBlock
	prevBlock: CID; // CID to the DataBlock that carries the preceding block
	compiledScript: Buffer; // Validation script for the chain itself
	dataScript?: Buffer; // One site has only one data script. Specifying field datascript to update the datascript for the site.
	encryptionScript?: Buffer; // The same
	metaDataScript?: Buffer
}
```

Each succeeding block is validated by its predecessor. In case of branches, decisions are also made by the common predecessor.

## Web of trust

The idea of web of trust is that, the only trustworhy one is yourself. Let the count peers you directly trust be N1, and the count of peers trusted by each peer you trust be respectively M1, M2, ... , M-N1. So, in the third layer, the trustworhiness of the first peer is 1/N1/M1.

The list of trusted peers are derived from

* User specify
* Peer reputation (builtin in  go-ipfs)

Announcing a trust record is simliar to normal site content, but the validation is handled by planet.

``` typescript
interface TrustRecord { // Encoded data on datablock
	trusted: {key: Pubkey, weight: number}[];
}
```
