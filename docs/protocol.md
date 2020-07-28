# Planet Protocol

Planet is a decentralized application platform and framework, based on libp2p. In contrast to recent novel decentralized networks, Planet focuses on the original purpose of P2P, to bring privacy and anonymity. As a result, to maximize the censorship-resistence achieved by decentralization, blockchains are not built-in, yet as applications.

An overview of the whole protocol stack (bottom-up):

- Libp2p
  - More transports, e.g. kcp, tor
  - Obfuscation protocol, to replace multistream protocol
- Block protocols
  - Bitswap
  - Compatibility protocols (possible): Bittorrent, Dat, ZeroNet (files only)
  - Planet bitswap (planned)
- Channel protocols
  - Pubsub (gossipsub/floodsub)
  - Planet protocol (custom protocol over libp2p)
- Graph data structure
  - Management chain
  - Data graph
- Backend procedure
  - Web of trust
  - Wasm block encryption script
  - eWasm metadata validation script
  - eWasm graph validation
  - Wasm application backend
- Interface server
- Application Frontend


## Obfsucation protocols [unfinished]

Pattern recognition is a popular censorship method, yet most p2p protocols have obvious protocol characteristics. Encryption protocols can't solve this problem, because the protocol handshake (multistream) for encryption can be recognized by GFW.

libp2p supports protocol negotiation. Unfortunately, it was proven to be easily detectable by DPI methods. Instead of using protocol negotiation, we use multiaddr-level protocol specification. For instance, the following protocols are supported, except libp2p defaults:

- Websockets with obfuscated multistream handshake
- A hand-written wrapper on top of TLS [unfinished]
- *Other candidates are possible and welcome*


## Channel and block protocols

Planet uses the following two protocols under the hood:

- *Channel protocol*, which is inefficient for long-term storage and unreliable. However, it has very low latency. The realtime protocol can be compared to UDP in clearnet. The primary usecases for the realtime protocol are:
  - Instant messaging.
  - Video streaming.
- *Block protocol*, which supports compression and delta-encoding, old data pruning, etc., however has high latency. The data protocol is like TCP in clearnet. The primary usecases for the data protocol are:
  - Git hosting.
  - Collaborative wiki.
  - Video hosting.

Applications often use these two protocols together:

- Instant messaging. Messages arrive in channels first. In case the receiver isn't online, messages are also stored temporarily by every peer on this site until the receiver downloads them or the messages die.


## Block protocol

Block protocol uses *data blocks* as packets. Data blocks are used to transfer *objects*, which is a collective term for all raw data.

Data blocks contain object content in a compressed and encoded format. Say, instead of sending raw version content, one would encode the data, put it into a data block and send the block.

For instance, the following formats could be or are supported:

- *Delta-encoding*: a block is compared with its historical blocks and other related blocks, and instead of raw block content, two values are stored:
  - A list of *bases*, i.e. references to some older blocks
  - *Delta*, one of the codecs is:
    - *Copy* action allows copying a part of some base to the current block
    - *Insert* action allows adding arbitrary new data
    - For instance, if the base contents are `ABCDEFGHIJ` and `QRSTUVWXYZ`, then the whole English alphabet can be efficiently represented as:
      - *Copy* bytes 0..10 from the first base
      - *Insert* letters `KLMNOP`
      - *Copy* bytes 0..10 from the second base
- *Compression*: object data is gzip-compressed

Additionally, the formats can be stacked on top of each other. Notice that order matters: i.e. first delta-encoding and then compressing data is more efficient than first compressing it and then delta-encoding. The first way is known as stacking compression *on top of* delta-encoding, the second way is stacking delta-encoding *on top of* compression.

The CID that is announced on the DHT is a hash of the actual non-encoded data, not the hash of a data block. This allows changing the base blocks, for example, when old base blocks die, more efficient bases are found or a more efficient compression algorithm is supported.

> `Die` means being archived

Data blocks can be sent to other peers in the following two ways:

- *Per-connection*, or *dynamic block* mode. This allows using a different codec or different data for each peer. This method may be slow but it is way better for network connectivity: a peer which doesn't support a new codec may still receive new content, while others peers which support it will receive it compressed even better. This method, however, requires developing a new protocol.
- *Compatibility*, or *Static block* mode. In this mode, the same data block is used for all peers who request a specific object. This allows using the Bitswap protocol to transfer data blocks and allows using old IPFS storage. However, static block protocol is inefficient in some cases. When the compression methods are updated, the majority serve the content using new codec, so the blocks of old codec are rarely served, splitting the network, which decreases overall performance. Besides compatibility and consistency, static method is rigid, for it can't encode the data dynamically based on the circumstances of the receiver.

A data block has a slightly different meaning for these two modes. In static block mode, a data block is effectively a valid IPFS block on its own. In dynamic block mode, a data block is temporary and abstract, and it doesn't have to be stored directly in the filesystem; however this caching may still be done for optimization.

> 'Verify' means verification of signature of publickey encryption, but 'validate' has a broader meaning.

In both cases, due to the nature of a data block, it is perfectly valid to make a new block and claim it is a newly encoded version of an object. Although the object content is signed by the content author and thus can be easily verified, a data block cannot be verified until it's decoded. This gives opportunities for DoS and allows exponential data size growth, even when the data block size is small: for instance, each block could duplicate to the previous one by performing the copy action on it twice.

A simple hotfix for this problem is that the object signer should also sign the data block; however, this fix breaks when either of the two conditions hold:

- A block author is not trusted. This is a common situation in multiuser sites.
- A block author may leave the network. This hotfix effectively rejects any updates to a data block after the author leaves the network.

Another solution is proposed instead. It is well-known that most if not all modern compression algorithms, and thus codecs, allow getting unpacked data length quickly. This allows checking if data length is not greater than the maximum allowed length before actually unpacking content.

```typescript
interface RawBlock { // Multicodec prefixed
}

interface EncodedBlock { // Multicodec prefixed
    codec: Codec;
    encodedData: Buffer;
}

enum DeltaType {
    none = 0,
    plaintext = 1,
    binary = 2
}

interface Codec {
    gzip: boolean;
    delta: DeltaType;
}

// One of the delta codecs

interface CopyAction {
    action: "copy";
    baseFrom: number;
    offset: number;
    count: number;
}

interface InsertAction {
    action: "insert";
    data: Buffer;
}

interface DeltaEncodedData {
    CID[] bases;
    (CopyAction | InsertAction)[] delta;
}
```


## Channel protocol

The channel protocol is used for two purposes:

- *Metadata*. When a site is updated, i.e. a new commit is published, the channel protocol is used to send new version CID to site seeders.
- *Realtime data*. This includes chat messages, etc.

Each packet sent over the channel protocol is signed with a public key.

```typescript
interface ChannelData {
    sender: PublicKey;
    signature: Buffer;
}

interface Metadata extends ChannelData {
    timestamp: Date; // TODO(ivanq): is this really needed?
    blocks: CID[];
    extraData: Buffer;  // Urgent data, size limited
}

interface RealTimeData extends ChannelData {  // Example: Instant messaging
    data: Buffer;
}
```


### Archiving and pruning

> `Archive` is to archive objects. `Prune` is about delta-encoding, on block level.

In dweb, archiving is a process to formally announce some of the data will no longer be seeded by the majority. Assuming no delta-encoding is used, archiving is to *unpin* some of the files or data in a site, and when the storage exceeds the maximum size limit configured by the peer, the files are deleted on that peer.

> Delta-encoding and delta-codec are interchangeably used.

Consider the following graph, which consists of blocks, not objects, and arrows represent block--base connection:

```
          H <- I
          |
          v
A <- C <- D <- F <- G
     |    |
     v    v
     B    E
```

Obviously, A and B are not encoded. C uses A and B as bases, D uses C and E as bases, and so on.

--- [the text below not merged with 2b19cbe yet] ---

When the history of C is pruned, the data of A and B is merged into C, and A and B remains unchanged. Of course, we can't change A and B, because they are immutable. The process of merging produces a completely new block. The references of A and B still persist in C in case anyone wants to get its pruned history. If we decided to archive D, only C and E would be stored as references.

```typescript
interface ArchivedDeltaBlock extends RawBlock {
    bases: CID[];  // Only CIDs
    archiveTime: Date;
}
```

## Denial of service

The cost of being DOSed depends on the protocol. In the worst case of the channel protocol, attackers generate a new publickey after every certain time period. Planet has different threshold for `Metadata` and `RealtimeData` , because the former is metadata only and is always size-limited. `Metadata` is processed as follows:

1. Decode protobuf
2. Filter off banned peers
3. Verify publickey and validate message *
4. Keep this data for later process *
5. Forward it to other peers

Only step three and four are vulnerable. However, with peer reputation system and conditional forward, spam on channels are efficiently suppressed.

When we have a CID of a `DataBlock` (The CID is from a trusted author)

1. Download datablock with block protocols *
2. Decode protobuf
3. Filter off this block if it's signed by a banned peer
4. Unpack block, eg. delta-codec *
5. Verify the hash of unpacked content
6. (Give the data to upper layers, eg. validate with dataScript)

## Graph Data

Encryption should be done before codec.

```typescript
interface EncryptedBlock extends EncodedBlock {
    scriptPath: any;
}
```

Planet retains the abstraction of 'site', while offering several cross-site reuse patterns.

Management chain is the core of a site, which is fully fetched and interpreted before any other operations. A site is addressed by the publickey of the genesis block of its management chain. All 'blocks' are encoded into `DataBlock` .

```typescript
interface MgmtBlock { // It's the encoded data, so not extending DataBlock
    prevBlock: CID; // CID to the DataBlock that carries the preceding block
    compiledScript: Buffer; // Validation script for the chain itself
    dataScript?: Buffer; // One site has only one data script. Specifying field datascript to update the datascript for the site.
    encryptionScript?: Buffer; // The same
    metaDataScript?: Buffer
}
```

Each succeeding block is validated by its predecessor. In case of branches, decisions are also made by the common predecessor.

## Web of trust [unfinished]

The idea of web of trust is that, the only trustworhy person is yourself. Let the count peers you directly trust be N1, and the count of peers trusted by each peer you trust be respectively M[1], M[2], ... , M[N1]. So, in the third layer, the trustworhiness of the first peer is 1/N1/M[1].

The list of trusted peers are derived from

- User specified peers
- Peer reputation (builtin in go-ipfs)

Announcing a trust record is similar to normal site content, but the validation is handled by Planet.

```typescript
interface TrustRecord { // Encoded data on datablock
    trusted: {key: Pubkey, weight: number}[];
}
```
