# Planet Protocol

Planet is a decentralized application platform and framework, based on libp2p. In contrast to recent novel decentralized networks, Planet focuses on the originial purpose of P2P, to bring privacy and anonymity. As a result, to maximize the censorship-resistence achieved by decentralization, blockchains are not built-in, yet as applications.

An overview of the whole protocol stack (bottom-up):

* Libp2p
  + More transports, e.g. kcp, tor
  + Obfuscation protocol, to replace multistream protocol
* Block protocols
  + Bitswap
  + Compatibility protocols (possible): Bittorrent, Dat, ZeroNet (files only)
  + Planet bitswap
* Channel protocols
  + Pubsub (gossipsub/floodsub)
  + Planet protocol (custom protocol over libp2p)
* Graph data structure
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

Pattern recognition is a popular censorship method, yet most P2P protocols have obvious protocol characteristics.

libp2p supports protocol negotiation. Unfortunately, it was proven to be easily detectable by DPI methods. Instead of using protocol negotiation, we use multiaddr-level protocol specification. For instance:

- `/ip/1.2.3.4/tcp/8080/p2p/Qmhash` is an old compatibility protocol. This is used for communication with non-Planet nodes.
- `/ip/1.2.3.4/tcp/8080/obfs` is a new obfuscation protocol.

How the new protocol should look or behave like is not fixed yet. There are several candidates:

- Websockets with obfuscated multistream handshake
- A hand-written wrapper on top of TLS:
  - Requests with obfuscated Planet signature are passed through
  - Requests without a signature are mirrored to HTTP sites
- *Other candidates are possible and welcome*



## Realtime data vs permanent storage

Planet uses the following two protocols under the hood:

- *Realtime protocol*, which is inefficient for long-term storage and unreliable. However, it has very low latency. The realtime protocol can be compared to UDP in clearnet. The primary usecases for the realtime protocol are:
  - Instant messaging.
  - Video streaming.
- *Data protocol*, which supports compression and delta-encoding, old data pruning, etc., however has high latency. The data protocol is like TCP in clearnet. The primary usecases for the data protocol are:
  - Instant messaging. Notice that using both realtime and data protocols is fine: the first one is used if fast direct connection is available, while the second one is used for chat history.
  - Video hosting. Converted and packed streamed video may be saved to permanent storage.
  - Wiki, blogs, etc.


## Data protocol

In this section, the data protocol is described. Data protocol uses *data blocks* as protocol packets. Data blocks are used to transfer *objects*, which is a collective term for all raw data, such as:
- Topics and versions.
- Arbitrary application-level content.
- External content, e.g. IPFS files and directories.


### Transferring data over the network

Data blocks contain object content in a compressed and encoded format. Say, instead of sending raw version content, one would encode the data, put it into a data block and send the block.

For instance, the following formats could be or are supported:

- *Delta-encoding*: a block is compared with its historical blocks and other related blocks, and instead of raw block content, two values are stored:
  - A list of *bases*, i.e. references to some older blocks
  - *Delta*, a list of actions:
    - *Copy* action allows copying a part of some base to the current block
    - *Insert* action allows adding arbitrary new data
    - For instance, if the base contents are `ABCDEFGHIJ` and `QRSTUVWXYZ`, then the whole English alphabet can be efficiently represented as:
      - *Copy* bytes 0..10 from the first base
      - *Insert* letters `KLMNOP`
      - *Copy* bytes 0..10 from the second base
- *Compression*: object data is gzip-compressed

Additionally, the formats can be stacked on top of each other. Notice that order matters: i.e. first delta-encoding and then compressing data is more efficient than first compressing it and then delta-encoding. The first way is known as stacking compression *on top of* delta-encoding, the second way is stacking delta-encoding *on top of* compression.

The CID that is announced on the DHT is a hash fo the actual non-encoded data, not the hash of a data block. This allows changing the base blocks, for example, when old base blocks die, more efficient bases are found or a more efficient compression algorithm is supported.

Data blocks can be sent to other peers in the following two ways:

- *Per-connection*, or *dynamic block* mode. This allows using a different codec or different data for each peer. This method may be slow but it is way better for network connectivity: a peer which doesn't support a new codec may still receive new content, while others peers which support it will receive it compressed even better. This method, however, requires developing a new protocol.
- *Compatibility*, or *static block* mode. In this mode, the same data block is used for all peers who request a specific object. This allows using the old Bitswap protocol to transfer data blocks and allows using old IPFS storage. However, this effectively drops compatibility with old implementations.

A data block has a slightly different meaning for these two modes. In static block mode, a data block is effectively a valid IPFS block on its own. In dynamic block mode, a data block is a protocol detail, and it is not required to directly in the filesystem; however this may still be done for optimization.

In both cases, due to the nature of a data block, it is perfectly valid to make a new block and claim it is a encoded version of an object. Although the object content is signed by the content author and thus can be easily verified, a data block cannot be verified until it's decoded. This gives opportunities for DoS and allows exponential data size growth, even when the data block size is small: for instance, each block could duplicate to the previous one by performing the copy action on it twice.

A simple hotfix for this problem is that the object signer should also sign the data block, however, this fix breaks when either of the two conditions hold:

- A block author is not trusted. This is a common situation in multiuser sites.
- A block author may leave the network. This hotfix effectively rejects any updates to a data block after the author leaves the network.

Another solution is proposed instead. It is well-known that most if not all modern compression algorithms, and thus codecs, allow getting unpacked data length quickly. This allows checking if data length is not greater than the maximum allowed length before actually unpacking content.

```ts
interface DataBlock {
    codec: Codec;
    encodedData: Buffer; // Format depends on codec
}

interface Codec {
    // delta=0, gzip=0 is raw data
    // delta=1, gzip=0 is delta-encoded data
    // delta=0, gzip=1 is gzip-compressed data
    // delta=1, gzip=1 is gzip on top of delta-encoding

    delta: boolean;
    gzip: boolean;
}


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


### Waterline pushing

Each object may have a particular dying configuration. The network is expected not to lose any data from alive objects when old objects are completely pruned, i.e. deleted from all nodes.

This condition is by definition satisfied for non-encoded blocks. In this case, all data blocks are completely independent from each other, so removing one of them does not make another one invalid. Notice that this does not imply that all *objects* are independent: objects may have dependencies, parents and associations. If object A depends on object B, object B is not allowed to die until object A dies; however, this is enforced on another level: block pruning will not be activated until an object is actually allowed to die.

Block pruning deserves a separate paragraph because of delta-encoding. If block A uses block B as a delta base, and block B dies, then A content becomes invalid and inaccessible. This means that, when a block's base is pruned, the block has to be recalculated not to include the pruned base. This process is known as *waterline pushing*.

Consider the following example:

```
          H
          |
          v
A <- C <- D <- F <- G
     |    |
     v    v
     B    E
```

In this example, blocks A and B don't use delta-encoding, block C uses A and B as bases, block D uses C and E as bases and so on.

Below, we'll describe what happens when block D is pruned. Notice that the pruned block does not have to be a leaf: in this examle, it definitely isn't. While on version level, a child is required to loosely outlive its parent, this is not enforced on block level. For instanace, consider the following timeline:

- First, A, B, C and E were published, referencing each other in an arbitrary way.
- Then D was published, without any parents or dependencies. It was found that the shortest compression format of D is reached when it uses C and E as bases.
- Finally, F, G and H were published, with arbitrary references to other objects.

In other words: while D doesn't have any dependencies, it may have bases.

While the above may sound complex, waterline pushing easily implemented: when a block is pruned, all blocks that use it as a base have to be recalculated:

```
A <-
    \
B <- C

E

F' <- G

H'
```

It may seem that this effectively disallows any archiving, however, this is false. *Object* G still contains a reference to its parent, object F. Object F uses D as parent. If someone still serves D for archiving purposes, it can be downloaded. Thus, saving any archiving information in the new block is useless, because the previous object is referenced to by object content.


## Realtime protocol

The realtime protocol are used for two purposes:

- *Update propagation*. When a site is updated, i.e. a new version is published, the realtime protocol is used to send new version ID to site visitors.
- *Realtime data*. This includes chat messages, etc.


### Avoiding DoS

Allowing anyone to send messages via the realtime protocol opens the door for DoS attacks. To efficiently block spam flooding over the realtime protocol, each message has to be signed by a public key, and then is verified by a *message verification* script.

```typescript
interface Message {
    sender: PublicKey;
    metadata: Map<number, Buffer>; // Signatures, etc.
}

interface UpdatePropagation extends Message {
    blocks: CID[];
}

interface RealtimeData extends Message {
    realtimeData: Buffer;
}
```

Notice that different messages may be merged together, e.g. a message can contain both a site update and urgent realtime data.


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