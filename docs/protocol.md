# Melotte Protocol

Melotte is a decentralized application platform and framework, based on libp2p. In contrast to recent novel decentralized networks, Melotte focuses on the original purpose of P2P, to bring privacy and anonymity.

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
- Propagtion protocols
  - Channel propagation
  - DHT
- Graph data structure
  - Management chain
  - Site content (object-version)
- Backend procedure
  - Web of trust
    - Naming
    - Filter
  - eWasm validation script
  - Wasm application backend
- Interface server
- Application Frontend

## Obfsucation protocols

Pattern recognition is a popular censorship method, yet most p2p protocols have obvious protocol characteristics. Encryption protocols can't solve this problem, because the protocol handshake (multistream) for encryption can be recognized by GFW.

libp2p supports protocol negotiation. Unfortunately, it was proven to be easily detectable by DPI methods. Instead of using protocol negotiation, we use multiaddr-level protocol specification. For instance, the following protocols are supported, except libp2p defaults:

- TLS
- Websockets with obfuscated multistream handshake [TODO]
- *Other candidates are possible and welcome*

## Channel and block protocols

Planet uses the following two protocols under the hood:

- *Channel protocol*, which is inefficient for long-term storage and unreliable. However, it has very low latency. The realtime protocol can be compared to UDP in clearnet. The primary usecases for the realtime protocol are:
  - Instant messaging.
  - Video streaming.
- *Block protocol*, which is optimized for transmitting blocks; however it has high latency. Block protocol is like TCP in clearnet. Compatiblity with protocols other than IPFS is the main purpose of *block protocol* abstraction. We built one more layer over block protocol, encodedBlock, which supports delta-encoding and compression. The primary usecases for the encodedBlock are:
  - Git hosting.
  - Collaborative wiki.
  - Video hosting.

Applications often use these two protocols together:

- Instant messaging. Messages arrive in channels first. In case the receiver isn't online, messages are also stored temporarily by every peer on this site until the receiver downloads them or the messages die.

Both *IPFS blocks and dag* are a part of *block protocol*.

> The abstraction of block and channel protocols are based on existing implementations. Channel is only one of the propagtion protocols.

## Channel protocol

The channel protocol are used for two purposes:

- _Metadata_. When a site is updated, i.e. a new version is published, the channel protocols are used to send new version CID to site seeders.
- _Realtime data_. This includes chat messages, etc.

Each `ChannelData` MUST be signed with a publickey.

```protobuf
syntax = "proto3";

message ChannelData {
  bytes sender = 1; // Publickey
  bytes signature = 2;
  bytes payload = 3; // Can be another channel data
  uint32 timestamp = 4;
  bool repropagate = 5;
  uint32 encryptionAlg = 6;
}

// Only CID. As the payload field of channeldata
message PropagationPayload {
  repeated bytes metadata = 1;
  bytes packed = 2;
}
```

### Propagation protocol

Due to the nature of block protocol that it is optimized for transfering blocks, which is usually not capable of 'propagating', we proposed propagation protocol that turns **static sites** into **dynamic sites**. There's also another type of site called **mutable site**, a term from IPFS. In the context of IPFS, they use IPNS to run mutable sites. IPNS mainly uses DHT to 'propagate' updates, by associating a peerId with a CID that points to the latest version of the site. That doesn't actually propagate, and it is always single-usered. The difference between dynamic sites and mutable sites is that dynamic sites allow more than one authors on a single site. For a mutable site, DHT is apparently the optimal propagation protocol, since there is only one author. Another issue is how the peers of the site can be notified when an update is released. DHT doesn't flood the network. Not involving other protocols, the simplest approach is to set a TTL, and let the peer to re-query DHT periodically.

Dynamic sites require a broadcasting protocol, such as pubsub. That's 'N to N', if we treat mutable sites as '1 to N'. The latter is solved because DHT can always map a key to *one* value. The whole propagation process consists of two steps, visiting a new site, and receiving the updates. When visiting a new site, it downloads the management chain first which is technically a mutable site at this moment. After that, it collects user data, which is truly a dynamic site now. Therefore step one can be optimized using the IPNS way, while step two can't. A basic way to solve dynamic propagation is to use a request-response protocol on channels. Each peer stores a set of values(metadata) for key K, which is normally a site address, and listens on the topic K. When a request is sent, all peers respond with the set of values that have not been sent on the channel. The requester collects as many values as possible. An obvious flaw is that metadata is also broadcasted to peers who already have it. So we don't send metadata on the channel direcly. Instead, the CIDs of metadata are sent. To avoid the use of DHT, the sender peers are supplied to block protocols, so that the metadata are immediately fetched after getting the responses. Note that DHT can also be used here, especially for packed payload (see section site).

The CID here has two purposes, to let inform the requester the new data, and to remind other peers what have been sent. Suppose we pack all CIDs of metadata into a single block, which is totally feasible, but other replier peers have to download the block, or they won't know what have been sent, and might send repeated metadata.

#### Optimization: Packed payload

Assuming there are CIDs of metadata, `M1`, `M2` and `M3`, sender A packs all into payload `P1(M1,M2,M3)`, which is also a CID. Sender B could download the content of CID `P1(M1,M2,M3)`, or he can look up in the cached entries if there is. Assuming `M1` is a very old metadata, most peers naturally won't include it into the packed payload. When a new metadata `M4` is released, the packed payload has to be updated. Let's call that cached/packed payload, and payload caching. The basic rules are that new packed payload are generated by the network periodically. Old metadata are excluded from packed payload. New metadata are included after a reasonable time, when it is fully broadcasted and accepted.
This protocol looks like a sliding window:

```js
M1 M2 [M3 M4 M5] M6
```

Packed payload is for peers visiting it as a new site. Both packed payload and non-packed CIDs (`M6`) of metadata are sent over channels, in fact.

#### Optimization: DHT

![](./net.drawio.svg)

As shown in the graph, a site usually has only a subgraph of nodes, while all nodes in IPFS support DHT. Obviously, the more nodes, the more censorship-resistance. For all data, including management chain and user data, it's possible to use DHT for update resolution, not publishing. Management chain is resolved recursively by all known pulickeys. An object might have multiple intended branches. If there are multiple users working on that object, the pubkey should resolve to a branch that hasn't been mapped to any pubkey. An abitrary branch is chosen if one user has multiple branches. The shortcoming of DHT is that it can only map a publickey to one CID (Actually PeerId in IPFS's implementation), and it can't check whether the mapping is valid according the site defined rules. Hence channel update resolution will be performed soon after that.

A `propagation` field is added in management chain, so the network works even without channel protocol. However, it is unsafe to use a site without channel protocol, because the site is incomplete. For example, the site owner has withdrown the permission of a pubkey in the chain. Due to the single-mapping characteristics of DHT, when the owner is not known before the block that adds the new pubkey and all other owners are already withdrown, the withdrawal branch is invisible by performing only DHT update resolution. So, the pubkeys specified in the genesis block can't be all replaced with other keys. Otherwise the site might be hijacked during initial DHT resolution. This optimzation would work well for small sites, often single-usered, with only a few peers.

## EncodedBlock

EncodedBlocks are used to transfer _objects_, which is a collective term for all raw data.

> The reference that a block uses for delta-codec is called `base`

EncodedBlocks contain object content in a compressed and encoded format.

> Encodedblock, also known as, block.

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

In dynamic block mode, the CID that is announced on the DHT is a hash of the actual non-encoded data, ie. **versions**, not the hash of a datablock.

EncodedBlocks can be sent to other peers in the following two ways:

- *Per-connection*, or *dynamic block* mode. This allows using a different codec or different data for each peer. This method may be slow but it is way better for network connectivity: a peer which doesn't support a new codec may still receive new content, while others peers which support it will receive it compressed even better. This method, however, requires developing a new protocol.
- *Compatiblity*, or *Static block* mode. In this mode, the same datablock is used for all peers who request a specific object. The CID announced is of the datablock, rather than its actual data. This allows using the Bitswap protocol to transfer EncodedBlocks. However, static block protocol is inefficient in some cases. When the compression methods are updated, the majority serve the content using new codec, so the blocks of old codec are rarely served, splitting the network, which decreases overall performance. Besides compatibility and consistency, static method is rigid, for it can't encode the data dynamically based on the circumstances of the receiver.

A datablock has a slightly different meaning for these two modes. In static block mode, a datablock is effectively a valid IPFS block on its own. In dynamic block mode, a datablock is temporary and abstract, and it doesn't have to be stored directly in the filesystem; however this caching may still be done for optimization.

In both cases, due to the nature of a datablock, it is perfectly valid to make a new block and claim it is a newly encoded version of an object. Although the object content is signed by the content author and thus can be easily verified, a datablock cannot be verified until it's decoded. This gives opportunities for DoS and allows exponential data size growth, even when the datablock size is small: for instance, each block could duplicate to the previous one by performing the copy action on it twice.

A simple hotfix for this problem is that the object signer should also sign the datablock; however, this fix breaks when either of the two conditions hold:

- A block author is not trusted. This is a common situation in multiuser sites.
- A block author may leave the network. This hotfix effectively rejects any updates to a datablock after the author leaves the network.

Another solution is proposed instead. It is well-known that most if not all modern compression algorithms, and thus codecs, allow getting unpacked data length quickly. This allows checking if data length is not greater than the maximum allowed length before actually unpacking content.

```protobuf
syntax = "proto3";

message EncodedBlock {
  message codec {
    DeltaType delta = 1;
    CompressionType compression = 2;
  }
  message Action {
    oneof action {
      CopyAction copy = 1;
      InsertAction insert = 2;
    }
  }
  map<uint32, bytes> cids = 1;
  repeated Action actions = 2;
  repeated Link links = 3;
  bool encrypted = 4;
  uint32 encryptionAlg = 5;
}

message Link {
  uint32 cid = 1; // CID, not multihash
  string name = 2;
  uint64 size = 3; // Tree size
}

enum DeltaType {
  plaintext = 0;
  binary = 1;
}

message CopyAction {
  uint32 base = 1;
  uint32 offset = 2;
  uint32 length = 3;
}

message InsertAction { bytes data = 1; }

enum CompressionType { zlib = 0; }
```

### Delta-encoding

What can be bases ? All types of versions, whether the version is a raw block, or delta-encoded. Objects can't be bases. However, referencing objects from another site might be useful.

Typically, the bases selected to encode a new version of an object are the older versions, unless the new version is considerably different from all its *parents*. So, can we use bases outside the site ? How they select the bases for a datablock can potentially cause undesired seeding. Once we visit a site, we trust the site and seed its content implicitly. The problem is that a site can have many users. You may want to seed only the content of the owner. Imagine a blog author posted an article containing a clip of a video that is 10 GB. Assuming there is an insane 10 GB block, which is not sharded, you have to download the whole block before processing that clip. In reality, the video is splitted into tens of thousands of blocks. It is not impossible to have a 10GB raw block, however. In such case, we *trust* the site author, so we actually choose to download the 10GB video. If a random blog commenter uses such a clip with 10GB base block, we probably won't do the same. Firstly, we need a system to manage what can be implicitly seeded, and what can be used as bases in what scopes for what kind of users. Then, it should ask user if existing rules can't decide.

How to encode with optimal performance ? There are multiple factors for choosing bases. How much extra data we need to encode using some bases, whether the bases are seeded by the majority, and whether the bases are seeded by the majority of the visitors of a site. For example, d-stackoverflow users usually have d-stackexchange seeded, so we can use resources from one another. When encoding a datablock, melotte search from its the parents of the version, and from the scope of same site. It doesn't download new sites automatically. Non-downloaded blocks can't be compared and used. Encoding from another site requires the help from the user. Application assisted delta-encoding is preferred. A site can specify bases when a user comments with quotes from other comments. Melotte would offer an interface for users to choose bases, and the scopes to search bases. The size of a blog comment is usually size-limited. To get more 'real' comment space, users are encouraged to use good bases. Quoting or linking is also a good practice. This is the natural ranking system. Most quoted content gets more seeders, and quotes can be traced (what site a comment belongs to) if it is not quoting low-level blocks. Quotes are authenticated, moreover.

> How should size-limit be done ? Two different limits, one for actual datablock size, another for decoded data size.

Factors concerned

- Encoding cost, time of searching, and space of downloading new blocks if melotte is configured to download new blocks for encoding, which is disabled by default.
- Decoding cost, **time of querying DHT** and **space of fetching extra data** that is not included in this datablock
  - First datablock cost, when the datablock is the first block a peer wants to download
  - First datablock of the site cost, when it is the first block downloaded in site content.
  - First block of a scope, the same as above, but for a scope, which can include multiple sites.
  - Extra cost, when there is a existing alternative base on that peer, but per-connection delta-encoding is not available.

A datablock might include many layers of CID reference to other EncodedBlocks of current site. When this block is downloaded, the whole site is almost completely downloaded too. Though you can get other blocks quickly after that, the time to download this block as the first block is significant. The cost of querying DHT is mainly about the time. Actually the downloading would be fast if there are enough peers. The time of querying is much more different. It involves network latency, and varies depending on the network circumstances. Extra data is the data not really required by current datablock, but can be useful later for other blocks in the same site, scope, or for that user.

#### Compression

Compression can also be done on transport layer, which needs re-computing every connection while the data stored is not compressed. The compression on this layer gives the user to save the space of storage, for some specific objects or sites. Since it is per-object compression, only some of the blocks are compressed, allowing frequently used blocks to be not compressed.

#### Per-connection delta-encoding

Instead of encoding objects at publish time, this can encode for each receiver peer. The above requires the content author to choose bases for his audience, which favors the majority, and might be inefficient in some cases. This mode allows to change the datablock and the encoding for an object as time passes. It doesn't mean it encodes for each peer, but it can. Through a *delta-codec negotiation* process, the sender finds out what blocks the peer already have, and the bases are chosen based on that peer.

This mode is not compatible with bitswap, as it uses the actual CID of the payload, ie. decoded data, as the announced key.

## VersionedBlock

```protobuf
message VersionedBlock {
  uint32 timestamp = 1;
  map<uint32, bytes> cids = 6; // Reused cids
  message Parent {
    uint32 cid = 1;
    BlockType blockType = 2;
    uint32 size = 3;
    string type = 4;
  }
  repeated Parent parents = 2; // Previous versions of this object
  message Reference {
    uint32 cid = 1;             // One of the versions of the target object
    string branchName = 2;      // As a new branch of this object
    string referenceBranch = 3; // master branch by default
  }
  repeated Reference refs = 3;
  oneof data {       // Data of this version
    uint32 cid = 4;  // Cid of the encodedBlock, compatible with bitswap
    bytes block = 5; // Can't be archived if using this field
  }
  uint32 cidData = 13;     // Cid of the actual data (which will be used in the
                           // future as the default DHT key). Also for archiving
  bool explicitBranch = 7; // Explicitly mark this version as a new branch
  string branchName = 8;   // Optional
  string tagName = 9;      // To mark important versions
  uint32 verifierId = 10;  // ID of the verifier for this block in mgmt chain

  // This can be viewed as important associations, which will be downloaded by
  // melotte
  // Non-optional deps will be downloaded automatically for optimization
  message Dependency {
    uint32 cid = 1; // CID of a block
    bool optional = 2;
    string name = 3; // Application-specific
    string type = 4;
  }
  // Association is a preview of all the links this block has
  message Association {
    uint32 cid = 1;
    string type = 2; // Arbitrary type defined by application
  }
  repeated Dependency dependencies = 11;
  repeated Association associations = 12;
}

enum BlockType {
  raw = 0;       // Any blocks from IPLD
  versioned = 1; // VersionedBlock
}
```

VersionedBlock is mostly what a version of an object is. The versionedBlock architecture is a git-like version control system optimized for the decentralized web. The notable difference is that it tracks objects individually, rather than treating the repository as a whole. Besides regular links in IPLD DAG, we introduced some special links, parents, dependencies, and associations. Those are common things a site would probably use. Parents stand for the older versions. Dependencies describe the logical hierarchy designated by the site. And finally, association is the what that block links to. This is called **semantic linking**, which makes it possible to analyze what links and what type of links a site has without actually downloading the content. Association is different from Base. A base is about data, while an association is about content. Any block can be a version, so a static site from IPFS can be transformed to a melotte site. On a higher level, Reference is used to mirror objects from another site, like git submodules (see next section).

There are two types of branch in the terms of melotte, explicit branch and actual branch. Obviously, actual branch is literally what you see, which is similar the 'branch' in blockchain. Explicit branch is the 'branch' in version control systems, which is marked by `explicitBranch` here.

If we use git structure directly on IPFS, there will be hundreds of unintended actual branches and conflicts for a large project where many people work at the same time. The decentralized web doesn't guarantee every `pull` one gets the latest version of that repository. Melotte splits the repository or a site into smaller units, so a confilct on a file doesn't change every hash of every node on that merkle tree. In fact, CIDs of all those objects are still assembled into a metadata for propagtion. The difference is that ipfs-git has to propagate the root hash of a repository, which has unnecessary overhead. Melotte can propagte one single object of a site, because the metadata is 'flattened'. In other words, the separation of update propagation and content structure.

Normally, the folder of a file isn't its dependency. The folder isn't needed to be downloaded to make that file meaningful. It's a structure, about how filesystem organizes, so we use the links within EncodedBlock for such purpose.

## Site

A site consists of a management chain, and its data. Site data is a collection of objects from any users permitted by the management chain. An object is the basic unit a site operate on, which is made up of one or more versions. An object is denoted by one of its versions, of any branch belonging to this object, that has a same initial version. Metadata is used to propagte new versions of site objects, mostly in a 'flattened' manner. Objects are connected in the form of parent, dependency or association. Such connection is different from IPLD, since objects are mutable.

Publishing new versions of a site or its user content can only take place on channels, because you can't put a link pointing to the new version in the block of the previous version. Given a genesis management block of a site, it's impossible to get its sucessors without channel protocol. Another aspect is user/site content, which is basically aggregating based on some rules, ie. data script. In addition to the graph, when the author signs and publishes the metadata of his blocks, other peers listening on the channel *cache* the received metadata in the repo, as if they are blocks, and *re-propagate* the metadata when other peers request it. For each version of an `object`, the signer generates a new metadata. The dafult behaviour (well-behaving) of a peer is to re-propagate the *newest* version of an object, since new blocks normally link to old blocks. To identify which block you got is the successor of an arbitrary block, the successor block (or its metadata) should contain a link to its previous version. Each block of an object is called a commit or a version, which can have bases if it is a EncodedBlock.

> Commit is the action of publishing a new version

A user publishes a request on channel, and other peers response with all related data. This doesn't guarantee the user gets all data of a site, including site data and user data, in the network. Furthermore, it is even not possible in theory, because there can peers hold data privately and never publishes its content. The user can always get the newest versions and considerably complete data, as long as at least a single peer publishes the newest or missing data. For the content owner, publish failure is more often than this, due to network issues, such as censorship. To mitigate spam, a time interval disallowing duplicating request is introduced, which is also known as *request window*. For each request window, only one request is allowed, and thus no duplicating response would be sent. The size of request window determines how fast we can download a site from scratch.
Once there has been a single peer responded the request, other peers won't send the same metadata again. At most, in one request window, there can be one request, and metadata of site and user data.

An improvement is to put metadata on DHT using the publickey of the site as the key and the site metadata as the value. More precisely, the publickey of the genesis block and when the management chain is downloaded, the publickeys of all other known signers. Each publickey maps to the latest metadata signed by it. You still can't use DHT to replace channel protocol, because there's no way to notify peers that something has updated. So, IPNS uses a [polling](https://github.com/ipfs/specs/blob/master/IPNS.md) method. This way is only useful at the first time visiting a site. After the first visit, we'll use channel instead. That'll be twice delay if we use both DHT and channel.

The hierarchy looks like this

- Site
  - Object
    - Versions
      - Bases
        - Blocks

> Branches are separate versions

> Don't confuse melotte block/object and ipfs block/object.

![](./dag.drawio.svg)

You can also treat each folder as an object. That depends on your need. The benefit of tracking files individually is that you can have different permission settings for each file. If the whole folder is treated as an object, any modification to any file inside produces a new version. In this case, to set different permissions, the site has to do version control manually.

How sites are created, and organized with other sites:

- **Template**. A site can be created from another site, called base site.
    Base site can contain a constructor fuction to create the new site. The new site can have all objects the base site have, and the objects use the objects from the base site as bases. A site can also be created without constructor, by selecting data manually.
- **Reference**. *Objects* from a site can be linked to another site. The objects linked to that site update when the source update, which is different from Template.
- **Component**. One site can call another site via melotte. That site, as the callee, is called component. A name provider is a component site, which is completely independent, but requires other sites to be fully functioning.

Normally, a site has several parts of data

- Management chain
  - **Management script**, usually compiled WASM binary, inside the management chain, for verifying the chain itself and the data.
  - **Data script**, also WASM binary, for validating the site content, including both owner content and user content.
- Data
  - **Backend**, where site data is read and written, and it interacts with frontend through melotte.
  - **Frontend**, pages served by melotte interface server.
  - **Site content**, also known as *site data*.

Case one, you want to add a commenting section to your blog. A real world example is disqus, but you probably don't want to use that. The common way is to add some code on one's own, or use a package manager like npm, to install a package. That acutally works, but you have to update the package when a bug is fixed or new features are released. A complete commenting system has management interface, that requires a backend. Integrating so much things into a blog isn't a good idea, so, we introduced component. If you don't want to obfuscate management chain and data script, a component shouldn't be allowed to write into the site. Instead, the commenting component should have a feature to download only a part of the comment data, which is only related to your blog. The request of downloading is, of course, all sent by the data script or backend. Melotte doesn't download anything except for the chain and the data of owners specified in management chain.

Case two, creating a new d-stackexchange. There are many ways to do this, copying the code from base d-stackexchange and pasting to a new site, or referencing the code of base site in the new site. Before creating a new site, we should check our requirements. Will we do changes to the code base, or we only need an identical copy of the original site. Generally, we'd solve that by using *references*, which are like git submodules, but operate on the level of objects. Suppose we don't do any modification, the references get updates automatically without owner's confirmation as there are no conflict. The problem is we always need to do something to the code base, which causes conflicts. When we commit the changes, we actually have two branches, one is our commit, another is the object from referenced site. We have to merge these branches, or use one of them, through some process.

### Management Chain

Management chain is the core of a site. It determines what data is allowed and not allowed for that regarding a specific user, and what new blocks are accepted for the chain itself, etc. Each succeeding block is verified by its predecessor. A typical
multi-owner site requires a beginning signer to create an address for the site. And then the permission of that privatekey is withdrawn to prevent any possible attacks.

![](./mgmtm.drawio.svg)

This is how multi-owner site is done in melotte. Owners in a site are equal, in this manner. It is still prossible the 'destroyed' privatekey is stolen, and is used to sign a block that conflicts with that withdrawal block. At this moment, there are three types of peers:

- Peers who know only malicious block.
- Peers who have withdrawal block.
- Peers who got both.

Optimistically, all peers tend to get all branches of management chain, because they are encouraged to do so. Then the solution is straightforward, the first block of the earlier branch validates the first block of the later block, as the time is always guaranteed: the attacker isn't allowed to add a branch that is 'older' than a known branch. One of the propagtion optimization uses IPNS way, the publisher of a name, ie. that publickey, is always valid, so the site could have been resolved to that malicious block. Modifying DHT to reject malicious changes to a IPNS mapping isn't possible, because a management chain belongs to the site, not DHT. There's no way to fix this optimization, except disabling it. The only way to keep site safe is to destroy the privatekey completely.

Another way is to use the CID of the genesis block, containing a list of granted publickeys, as the address of a site. That way works if we're creating a new site.

The DHT based site propagation protocol queries publickeys defined in management chain recursively: firstly pubkey A, then B and C, in this example. Accidental branches are usually tolerated, depending on the rules of verification script. Since every publickey has only one 'pointer' to the latest block it acknowledges, branches are not guaranteed to be known by peers. A block is allowed to have multiple parents, to avoid losing branches. Now management chain is more like a single special object.

Some common site management methods:

- Single-owner
  - Most censorship-resistant, because this kind of site can be resolved without channel.
- Multi-owner, with no limitation
- Voting based multi-owner
  -
- Blockchain based multi-owner

### Objects

An object is a series of versions which are VersionedBlocks. It is meaningful only when its site is present. Objects need a site as the topic name of the channel to receive further versions, so there shouldn't be isolated objects. Object can have *references*, which mirrors some branch of the target object as a single branch. This is not git reference. Reference is marked by some fields in a version of an object, including the address of the target site, and the CID of one of the versions of the object. The virtual branch is created using that version as the common parent. Git-like branching system can be implemented via data script, which decides the current value of an object. Reference is always about a specific branch of an object, as there could be other branches parallel to the referenced branch, having common ancestors.

Version-object structure is similar to git, but not exactly. We aim to offer versioning feature while keeping maximum flexibility. A default data script is provided to deal with branching issue.

There is no concept of merging in a decentralized network. All branches are kept. A site can either keep both branches or select one of them, or anything. That's the responsibility of the site, not us. All versions are kept for data script. One can still commit a version that uses several branches as parents, creating a new branch that merges two branches. Accepting this attempt of merge is also determined by the script. Branches are immediately created when someone commits a version with more than one parents, or more than one versions use a same parent, which is different from git.

Anyone accepted by data script is allowed to commit on an object. If two persons commit to an object at the same time *accidentally*, there will be two branches. For a wiki site, we may show the version with *latest* timestamp to users. In this example, order doesn't matter, but the latest version is preferred, because the latest version means it is more 'accurate'. Suppose we don't use the latest version for a wiki, a false wiki page can't be corrected immediately. For the code base of a site, we can't simply use both branches, which might break the site. Based on time, we can choose one of the branches with *earliest* timestamp. If someone commits to that object and use two branches as parents later, we can simply switch to this branch. Such a branch is called a *merge*, which has multiple parents. A merge that use all existing branches, *for a specific peer*, as parents is called a *complete merge*. Conversely, a merge that only solves some of the conflicts is called a *partial merge*.  In this case, we may only want a complete merge, and choose branches or merges with earliest timestamp if there isn't. Using the earliest branch is to keep the code base stable. We can't use longest branch here, but time gurantee works. It is possible the privatekey of one of the signers is stolen, and the attacker attempts to create a branch on a very early version. For a blockchain site, use the longest branch then.

> Timestamp is assumed to be accurate, see section time guarantee.

### Archiving and pruning

In dweb, archiving is a process to formally announce some of the data will no longer be seeded by the majority. An `Block` or `Object` has two states, by design. (state isn't and can't be a field in the block or object. It's the result of observation). This is yet another difference to git, as we have to care about the efficacy of seeding. We avoid keeping both archived and non-archived form of a same object at the same time, which splits peers into two groups if they don't seed both versions, greatly reducing censorship-resistance.

- **Living**, the data still being propagated on channel all the time.
- **Archived**, the data is no longer a must to be downloaded

This concept is proposed for it's a common requirement in sites. When we say `archive a block`, the block may be a raw block or an EncodedBlock. The meaning of archive can be archiving a **version** of an object, or a **base** of a version, or the entire **object** inluding all its versions. The method of archiving also varies. We can archive the bases or the blocks or objects that depend on the bases, ie. **dependencies**. It's ambiguous, on **what is being archived**

A random example of how complicated the relationship among blocks can be

![](./archive.drawio.svg)

One of the concerns is when you archive something, there can be side effects. For instance, assuming you are going to archive a base, to make the base itself no longer a requirement of any other blocks, you have to traverse through the merkle forest, because a base doesn't have links to its dependencies. You may propose to create reverse links when receiving data, but the choice of archiving bases is wrong in the first place. Now think about a base can be anything that other things depend on, not only a concept only of delta-encoding. So, we don't archive the dependents, but the dependencies of some data.

Note that there are always one or more versions regarding an object, whether it is delta-encoded or not.

There are numerous forms of archiving:

- Archive the historical versions. For `VER3`, it is `VER2` and `VER1`.
- Archive an object, `OBJ B`
- Archive a site, `Site 1`

When archiving preceeding versions of a version in an object, the payload of the EncodedBlock is simply replaced with the decoded data, whose CID is already written by the signer in the EncodedBlock. That actually removes all the bases, thus not depending on its older versions, and any other blocks. This might be inefficient when delta-encoding is efficient, without any previous versions as bases. A solution is to use dynamic delta-encoding described above.

Objects can also be archived, and is straightforward. Exclude the undesired objects from site metadata, since an site metadata always include all its objects. The archived objects are automatically cleared via garbage collection, when it reaches the size limit. Explicit archiving can be instructed by a version that has an archive field.

An extra process is needed to archive a site, that the owner needs to publish an `Archive Metadata` to let peers unseed that site.

## Metadata

Metadata is the connection between blocks and channels, which includes the basic information of the signer and some CIDs of the site. It tracks the current version of every object. The question is how much data is necessary to put into metadata, but not a reference in metadata. Block protocol is optimized for blocks, although DHT query might slow at first. Channel has lower latency, for small packets. It is considered faster, when the cost of DHT is more significant than the benefit of de-duplication.

> DHT takes up to 5 minutes in China.

If we use block protocol as much as possible, replacing metadata with the CID of it, we have to query DHT for metadata before everything. Obviously, we can't, as explained below. Metadata must contain authentication, identity and timestamp information. Another extreme case is to put everything into channel. That makes sense only if the data is single-use and is hard to do delta-encoding, such as random bytes. The previous metadata field isn't needed, in fact. A single metadata contains all the metadata information for its corresponding site. It is never delta-encoded. That field is used only for those who is willing to seed archived *objects*.

What if there is a giant site with one million objects ? Suppose we use SHA-256, and it is `31250` KiB, about `30` MiB, every metadata. According to [ipfs-unixfs](https://github.com/ipfs/js-ipfs-unixfs/tree/master/packages/ipfs-unixfs-importer), the minimum reasonable block size is `0.25MiB`, which is about `8192` hashes. Any metadata with the number of hashes above it is inefficient, in general. For such a giant site, we use field `subMetadata`, and each layer can contain up to 8192 block or subMetadata CIDs. In this example, it uses two layers, which has 8192 metadata blocks in the first layer, and each metadata block has 122 CIDs of objects.

> 8192 is not the actual number. The format has changed.

The download process is handled by data script, which decides when the metadata is received, what blocks to download, when to download, and the depth, the priority and so on. `Extradata` can store information for such conditional download. "Optional objects" is not managed by the network, but the script. Because 'optional' is ambiguous. Does 'optional' mean to download when needed ? However, what time it is needed, when requeting, or before requesting to improve user experience ? Those dirty tasks are handled by the data script. Of course, we provide a default script.

Metadata is always about a user, whether it belongs to site content or user content. There's no strict separation of site content and user content. The data script determines what is considered site content. Blocks from each author of the site form objects of the site. An object can have versions from multiple authors.

Only top-level objects or blocks are sent via metadata. Top-level blocks or objects are not referenced by other blocks or objects immutably, which are not accessible without metadata for the data script that downloads the site. Metadata script would inspect metadata each propagation, to filter out malicious unnecessary data like non-top-level CIDs, and archived blocks or objects that are not needed any more.

## Denial of service

The cost of being DoSed depends on the protocol. In the worst case for the channel protocol, attackers generate a new public key for every message. Planet has different threshold for `Metadata` and `RealtimeData`, because the former is metadata only and is always size-limited. `Metadata` is processed as follows:

1. Decode protobuf.
2. Filter off banned peers.
3. Verify public key and validate message. *
4. Keep this data for later processing. *
5. Forward it to other peers.

Only step three and four are vulnerable. However, with peer reputation system and conditional forwarding, channel spam is efficiently suppressed.

When we have a CID of a `DataBlock` which we received from a trusted peer, we do the following:

1. Download datablock via the block protocol. *
2. Decode protobuf.
3. Filter off this block if it's signed by a banned peer.
4. Unpack block, e.g. with delta-encoding. This step may require downloading other blocks. *
5. Verify the hash of unpacked content.
6. Proceed handling the data on upper layers, e.g. running validation scripts.

Note that low-level DDoS defense should not depend on WoT system.

## Web of trust

The idea of web of trust is that, the only trustworhy person is yourself. Web of trust is subjective, which forms a different directed graph for each peer. Let the count peers you directly trust be N1, and the count of peers trusted by each peer you trust be respectively M[1], M[2], ... , M[N1]. So, in the third layer, the trustworhiness of the first peer is 1/N1/M[1]. Peers trusting each other on the same layer are counted. A peer on a layer trusts several other peers. They get the same trustworhiness if they don't trust each other, or they trust all each other. The peers trusted by more peers on the same layer get a higher *share* of trustworhiness arranged for that layer. Peers on nearer layers can trust the peers on further layers, from that peer's perspective, which means the reverse trust is not counted. Such a cross-layer trust is actually about how we treat layers. In fact, one peer can be on multiple layers, and obviously the trustworthiness is calculated individually and added up afterwards.

The list of trusted peers are derived from

1. User specified peers
2. Peer reputation (the behaviour of a peer, mainly about download and upload)

Announcing a trust record is similar to normal site content, but the validation is handled by Planet.

```typescript
interface TrustRecord { // Encoded data on datablock
    trusted: {key: Pubkey, weight: number}[];
}
```

> There are *only* two options, either blockchain or WoT, to prevent sybil attack and offer a reasonable functionality.
> Blockchain is not censorship-resistant, however.

WoT is not a site, but part of the core.

### Naming

> Although the paragraphs below mainly talk about DNS, the solutions also apply to user name.

Existing naming solutions in decentralized networks include NameCoin, ENS. Like conventional centralized DNS, you have to buy names, but many names have already been kept by investors, who make money from nothing. Let's consider what the purpose of DNS is. It is definitely not about investing, and one shouldn't own large numbers of names. Obviously, DNS provides a convenience service, a mapping betwenn domain names and addresses *for its users*. Under the WoT, we have a solution, which gives the freedom back to users.

WoT based DNS.

- Each user can publish name records for their sites via channel protocol.
- Visitors resolve domain names based on WoT evaluation result, as follows
  - A user can choose one candidate from all competing sites regarding a domain name, and publish a *name preference record*
  - When resolving a name, the name evaluated by WoT with highest score are selected.

Unfortuately, we can't trust users completely. They might choose a phishing website for a domain name, or trust some dishonest people. However, trusting always exist. When you use a DApp registered on ENS, you implicitly trust ENS, which is an authority, although it is seemingly decentralized. Neither trusting users, nor authoriy only is applicable. A domain name may be resolved to different addresses in different parts of the network. This is actually inevitable, since if you allow multiple name resoltuion service, there is always inconsistency. In conclusion, WoT is natural and singular consensus is unnecessary and impractical.

In practice, we use sites as the main entities in name resolution system, called *name provider*. A name provider site can be a group of users, a blockchain, a static mapping table, or even only a script.

- Name provider site (from centralized to decentralized)
  1. Centralized, and personally issued, or by organization.
      - Blockchain, a variation of centralized name provider
  2. Group of selected users, from WoT.
  3. Static resolution table
  4. First-come-first-serve script based on WoT.
  5. Subjective WoT (not a site)

The form of user group name provider is a kind of delegated trust. The user can either trust all of the users specified in the site, or none of them, which unifies name resolution more than WoT only. First-come-first-serve pattern is only possible after sybil attack problem is eliminated, which requires WoT. It's one of the examples of using only script as a name provider, which processes WoT name results and accepts the very first records.

### Priority and Spam defense

> PoW is useless

WoT based spam defense are applied on higher layers, block protocol and site content. When exchanging blocks, peers with higher trustworhiness are prioritized, which is increased by user or automatically set according to the behaviour of the peer. Normally, user specified trust records have much higher weight. On application layer, the content shown to the user is based on WoT and site itself. Since the user implicitly trust the site when visiting it, the site has the right to ajust the ratio and influence of WoT evaluation result. The actual problem is about protocols, where you can't rely on human decision. WoT prioritizes known and trusted peers, while there might be DoS attack consuming limited bandwidth remaining for new comers.

One possible solution is to ask the requester peer for a captcha, or even user-specified challenge. If the peer passes the challenge, he gets the trust, less or more, from the challenger. In other words, he joined the Web of Trust, since the requester is also trusted by others. Depending on the difficulty of captcha and the circumstances of the challenger, or WoT, he may need to do one or multiple captchas.

Content what the user disliked and marked as spam are not shown later. The *perference record*, which states the opinion of the user about what blocks are spam and what are not. The target of a preference record can be an object, eg. a blog post comment, a user, or a site. Depending on the site, if it is possible to remove these blocks without breaking the site, these blocks are unseeded and future downloading attempts are warned. Another option is to keep the blocks, but no longer announced, which doesn't break the site locally. This is acutally non-sense, because when there're enough peers who stop seeding it, the site becomes broken automatically. A non-blacklisted comment quoting a comment of a blacklisted user. To not get a broken comment, we may download that block in this case.

The result of WoT evaluation is also applied on this.

### Distributed searching

Due to the efficiency of possible DoS on it, this may happen only within WoT. To search on a site, or all sites, the requester sends a search request on channel, and collects and sorts the search results sent by other peers. The ranking algorithm can be based on seeder count, which is a natural metric in dweb, or combined with other methods like PageRank.

### Private network

Melotte can be configured to connect only trusted peers, forming a private network, also known as F2F.
This mode is useful in case censorship becomes overwhelming.

### Decentralized anonymity network

The main purpose of WoT is to prevent sybil attack. A completely decentralized anonymity network becomes feasible when there is a large enough WoT, *without* the need of a blockchain.

## Time guarantee

This section describes a way to achieve an As Sound As Possible timestamp (ASAP) via an As Soon As Possible false timestamp rejection, for site content. A site is firstly signed on its content, blocks. When the signer decides to publish the site, he signs a metadata that links to the blocks of the site, and propagate the metadata via channel protocols. Typically, channel protocols need peers to forward the metadata. We call the peers that get the metadata from the site signer directly, the first layer, and the peers that get the metadata from these peers the second layer. In a channel protocol that doesn't require metadata forwarding, there are always offline peers which require forwading. Note that the metadata being forwarded is always that metadata signed by the original signer. Denote the time the author signs the blocks with `T(block)`, the timestamp he writes in the metadata as `T(meta)`, and the time the first layer receieves the metadata as `T(1)`, and the second layer as `T(2)`. Denote the time you receives the metadata as `T(you)` and the now as `Now`

When the metadata is published, if the timestamp is fake, by protocol, all well-behaved peers will reject and drop the false metadata. In case any peer in the first layer wrongly propagates the metadata into the second layer, the first layer fails and `Now` has increased. The peers can't trust other peers, so they can only trust their own clocks. Assume there are `N` *malicious* nodes evenly distributed and the connected peers are randomly selected, so the probability to connect to a *malicious* node is `N/totalNodes`. Denote it as `P`. Metadata without a timestamp field will be instantly dropped, probability `1-P`. The first layer fails to reject false metadata, `P`, and the second layer `P²`, and the layer n `Pⁿ`. On layer n , the probability that layer drops false metadata is `1 - Pⁿ`. For instance, P is `0.1`, on the layer two the probability of rejecting false timestamps is already `99%`, so that all timestamps pass through layers satisfy condition `T(meta) < T(2)` , at least. It is `T(2)`, but not `T(1)`. See paragraphs below.

Why a timestamp in metadata is necessary ? As we know, each layer verifies the timestamp before propagating to another layer, which prevents false information from spreading. If there is timestamp built in metadata, validating timestamp takes less then a second, and we can get the result, to propagate or not. Block protocols are always slow, however. Let the time to look up timestamp inside the block be `Tx`. In the first layer, the condition to check timestamp *inevitably* becomes `T(meta) < Tx + T(1)`, rather than `T(meta) < T(1)`. Intuitively, `Tx` can range from 30 seconds to five minutes. `Tx` has been added to `T(1)` in the condition, indicating we gave the metadata more *tolerance*, because the metadata can have a false timestamp `T(1) < T(meta) < Tx + T(1)` which is valid in this situation. You may say we have intended tolerance for the local time can't be accurate, but this tolerance accumulates. In the layer 2, for `T(2)` is approximately `Tx + T(1)`, it is `T(meta) < 2Tx + T(1)`. Besides this cost, every peer that propagates the metadata has to query DHT and download the block, which is very expensive and vulnerable to DoS attack. Through this process, the timestamp in the metadata can be thought as valid. When you get the timestamp and download the blocks, you check the blocks against condition `T(block) < T(meta)`, because `T(meta) < T(1)` is always true.

The purpose of checking `T(meta)` is to enforce the author to include a timestamp which statisfies `T < T(1)`(approximately). A timestamp is allowed to become valid although It was invalid. Suppose we have a timestamp `Now + 5 days`, it is invalid within following 5 days and is immediately dropped and not propagated in case anyone tries to publish it. After 5 days, the metadata can be published, so the publish time can be considered correct, though it was generated five days ago. The validation before propagation prevents any wrong publish time. In many cases, the scenario that the publish time of something is unclear, and something inside it suddenly becomes valid after a certain period, is undesired.

Will you get false timestamp ? It depends on your 'location' in the network, and whether you are the first time visiting a site. For `backward` false timestamp, any such attempt is prohibited by corresponding site validation script, as long as you have the original content that contains the 'true' timestamp (the first timestamp is considered true, see below). It's impossible to do time guarantee on site content, because this requires to download the new content. Regarding 'future' false timestamp, it is already suppressed by `T(block) < T(meta) < T(1)`. If you are next to the false timestamp sender, you can always detect and drop that metadata. It is still possible to have a false timestamp that `T(1) < T(meta) < T(you)`, when the delay on layers are significant, since `Now` constantly increases. Let's call this `delay timestamp`. The more layers, the more delay, hence more unwanted tolerance. Except for `delay timestamp`, the probability to recognize false future timestamp as valid is 0.

Can we prevent `backward` timestamps ? Yes, we can. We have multiple options, the one is to validate after propagation and downloading a site, the other one is to validate *during propagation*. The former has the risk of history being archived. In contrast, the latter prevents false timestamps in the first place, which is arguably better as it doesn't even acknowledge the existence of false timestamps.

A site that cares about the correctness of timestamps can use metadataScript to validate timestamps wtih one more condition against backward false timestamps before propagating metadata (on object level not block). This is the solution to `backward` timestamp. For backward timestamp, only peers with corresponding site downloaded and know the original timestamp can validate, unlike future timestamp validation where every peer knows the condition to validate, which is `T(meta) < Now`. Fortunately, the site propagation protocol has a channel for each site respectively. Only the content of that site can be published on that channel, so false timestamps won't be mistakenly propagated in any other channel which doesn't accept those timestamps at all. Notice that the timestamp in the metadata is still necessary, because the block referenced in metadata is always undownloaded at the moment you receive that metadata; but in backward timestamp validation, you already have the site content downloaded since you have subscribed to that channel. Also, there may be peers who don't have site downloaded, as new comers. The solution is simple, in that time-sensitive site, disallow the new comers to propagate metadata, although this may reduce connectivity. The mechanism to validate backward timestamp is basically the same to future timestamp. Denote the target timestamp is `T(back)`, and the 'correct' timestamp is `T(prev)`. We use condition `T(prev) == T(back)`, as published timestamps can't be changed. The probability of each layer of successful rejection is the same as future timestamp.

What if I am the new comer of a site ? This is the only possible scenario where you might get a false `backward` timestamp. You already have the awareness of `Now` in the condition of future timestamp validation; however, you don't have the knowledge of the original timestamps in a site. As a result, you won't get a false future timestamp. If the blocks are complete, ie. not archived or pruned, the data script can automatically detect any attempt to modify existing timestamps. The probability of getting false timestamp as a new comer is `P`, assuming all malicious nodes are united to give you false timestamps of that site. Possible solutions include requesting site metadata from multiple peers, and compare to check if they are identical. Download the history if the condition fails. As the N malicious nodes are distributed evenly, the probability reduces if we request from more nodes. For `k` times of metadata requests or answers, the probability of getting false timestamp is `P^k`. In fact, we already request from multiple peers, because there are always peers answering requests at the same time.

Sybil attack ? There can't be sybil attack, since creating massive identities don't help. This is not a reputation system. If there are enough layers, false timestamps eventually vanish. If not, the better, everyone can validate the timestamps on their own, as they know `Now` and original timestamps.

In conclusion, both `backward` and `future` timestamps are banned, in time sensitive sites which limit the metadata to be propagated only among peers who have downloaded that site.

## Cases

> Some examples

- Simple announcement board
  - Anyone can publish content with size limit less than 256 bytes
  - Not using mutable storage. The only block in mgmt chain is genesis block, that contains a data script allowing only a certain CID of backend and frontend, and user content is size limited. Backend and frontend are unixfs format, not delta-encoded. The mgmt script rejects all later updates. WoT is enabled by default.
> This kind of site is simple enough that can be immutable. Maybe we don't need that publickey, as the site address.
- Simple chat
  - Messages are immuatble. Each user has a editable bio. Code base is mutable for future versions
- Blockchain with smart contract
  - Mutable storage for wallet UI and broadcasted transactions, and immutable storage for the blockchain itself. Smart contracts are run by calling melotte API.
  - Other sites can call this blockchain via melotte.
- Chat
  - Rotating mutable message storage.
  - Two step message publishing, on channel firstly for lower delay, and then message object for long term storage. Each peer running this site has a overall size limit for all message objects served. When new message objects arrive, old objects are pruned, and no longer get distributed. WoT result is applied and different users have different limit. Since message object is for relaying when the party is not online, message objects temporarily stored in other peers are soon marked as prunable after the party is confirmed to be online. It is consider to be online when the party who was offline relplies.
- Forum
  - Object types: topic, comment, reaction, attachment, user, signal (for reporting and moderating)
  - A topic has topic name and body. A comment has a link to the topic. Orphaned topics are garbage-collected. A reaction is like a comment, but for upvote and downvote. An attachment is a wrapper for files that referenced in the topic or comment, which contains metadata of the target. Moderators can use signals to manage the site. Signals are also used to report spam, and inappropriate content. All things are editable. Only the owners specified in management chain have the rights to archive. Moderators are not registered in the management chain, but in the site data part.
- Wiki
  - Object types: page, index, user, comment, signal
  - A user has a username associated and some basic information stored in user object. A wiki page is an object that has many versions, publised by any user. A comment links to the related wiki page. Otherwise it will be garbage-collected. Maybe there should be a metadata page object that has the links to multiple pages in various languages. WoT is applied. Wiki page editions with low WoT score is hidden, until it gets enough approval, via signal, from trustworthy peers in WoT (subjective).

> The wiki should embed a forum, and that forum should embed a chat. Weird, right ?

- Live collaborative editing, google-docs like
  - Making use of NAT traversal ability of the network.
  - Integrate with IM.
- Git
  - Git has to be simulated on the top of the git-like object-version structure, because git treat the whole repository as an 'object' while we track objects individually, which is more suitable and efficient in dweb.
  - Root, metadata git repo object that links to other objects
    - Repo name, description, readme and owners, size-limited.
  - Only metadata objects are downloaded by all peers. When someone vistis a repo, the repo is seeded. Shallow seed can be applied automatically if a peer has limited storage, ie. archiving old commits.
  - Local search based on repo name, description and readme. A lightweight full-text indexer is needed.
  - Extended markdown without compromising security.
  - Stars are evaluated with the WoT score of users. Trending list is automatically generated with the data from local tracker that tracks the taste of the user. It is possible to get the data of 'rising', since timestamp is guaranteed.
  - Private repos are totally ok. Melotte can even be a private network.
  - Issues page is similar to a forum, but it can have better a integration with project kanban board.
- Social networks
  - Object types: user, post, comment, reaction, group
  - Sorting by time, popularity, preference, random, or any of these combined.
  - Posts from a group are only downloaded when requesting

How shall we rank and sort the content ? For different purposes, the method should differ. Websites like reddit, quora rank the content by populariry, which is not applicable in the case of stackoverflow. The point is popularity doesn't imply quality. Among the users, the standard of quality content varies. Common factors of ranking are time, popularity, *quality* and *preference*. For instance, social networks can adjust the algorithm to favor popularity. Quality is actually a vague word. It may stand for populariry sometimes. But popular opinion is not always true. A repository with more stars might be worse instead, because the people who rate the repository aren't necessarily familiar with the technology the repository is about, and popular repositories tend to get more stars. That's the flaws of current ranking systems. As a result, it takes a long time for a new project to be known to the others. To make things worse, some monopolistic search engines in some countries rank the sites by bidding. Now the definitions of the two terms are clear, *quality* is the preference of the WoT community/group you are in, plus some algorithm that counts citation/dependency/PageRank, and *preference* is about yourself. The spam articles I dislike might be the taste of some readers, on the other hand.

## Anonymity

Anonymity is an unavoidable topic towards a censorship-resistant network. However, apparently IPFS team aren't treating anonymity transport as a priority. Tor is quickest to deploy for the time being, as openbazar has written [go-onion-transport](https://github.com/OpenBazaar/go-onion-transport). You can't use tor in some censored countries, where melotte is needed. Alternative decentralized solutions have been proposed, such as I2P. Since I2P is written in java, we'd use Kovri, developed by Monero. It is proven vulnerable to sybil attacks for decentralized anonymity networks, which can be probably solved by WoT in the future.

## Philosophy of this project

Many p2p projects have been started in this decade, for different purposes and applications. No one has ever tried or wanted to build an infrastruture to replace centralized web. As the demand changes, people invent new protocols, and old networks are abandoned. A remarkable attempt is libp2p and IPFS. They aim to modularize the foundations of p2p protocols, eg. DHT. It's far from done, however. That's only a part of the dweb protocol stack. Following the trend of putting things into the web, we adopted WASM. Therefore, a site is self-hosted, sandboxed, and acts like a native application. Melotte is not a bittorrent video streamer, or a decentralized file synchronizer, or a distributed search engine. It's all of them.

In regard to compatibility, we add one more layer, inluding block protocol and channel protocol. Thus, both bitswap and bittorrent can be block protocols. That's flexibility, one of the features we aim to offer. Besides the concept of immuatble storage from IPFS, we also introduced object, site, and many more.

Blockchain can never replace the decentralized web, no matter how overwhelming the hype is. The nature of blockchain that it is validated and dominated by the minority, the rich, whether it's PoW, PoS or proof of anything, deciding that it is impossile to be censorship-resistant, which is contrary to the original purpose of p2p networks, while existing projects use blockchains nearly everywhere. Even worse, many blockchains still use wasteful and non-sense Proof of Work protocol, which could only centralize it more.  Hopefully there will be non-blockchain crypto-currencies in the near future.

Melotte is 'No-Database', one step beyond Nosql. In contrast to ZeroNet/Orbit-db/GUN, we don't invent an abstraction of database. Database, as a concept, only belongs to the centralized web.



## Miscellaneous

`Publickey` is a multiformat. `PeerId` is not used in most cases, because it is a format designed for IPFS, and it can always be calculated from `Publickey`.
