# Planet site design

The most important concept of a Planet site is a *topic*.


## Topic

A topic is versioned data and its history. For example, a blog post is a topic, a comment is a topic, a directory with pizza pictures may be a single topic too, and so on.

A topic contains:

- A *type*, which is an integer value. Types help to show difference between different topics. For example, "0" could be mapped to blog posts, "1" -- to comments, and so on. Several types are reserved, see below.
- Zero or more *dependencies*. Dependencies are an absolute must for the topic to be meaningful. For example, a blog comment is meaningless without its parent blog post.
- Zero or more *associations*. An association represents logical hierarchy. For example, a blog comment has a blog post as an association. Associations are split into chunks, grouped by type. The difference between an essociation and a dependency is that an association is optional to download while a dependency is required. However, a dependency can be an association too for site simplicity.
- A reference to a *verification script* (in the management chain, read below). The script will be used to verify data validity.
- Arbitrary metadata for the verification script.

```cpp
struct Topic {
	uint64_t type;

	std::vector<Ref<Topic>> dependencies;
	std::map<uint64_t, std::vector<Ref<Topic>>> associations;

	Ref<Node> management;
	std::vector<uint8_t> metadata;
};
```

A topic is referenced by its hash. A topic is considered valid if the topic verification script, contained in the management block, accepts it.

The atomic part of a topic is a *version*.


### Version

A version contains all data of the topic, at some point of time. For example, a version might include post or comment content, its author, its author's signature, or a reference to the pizza directory, and so on.

A version consists of the following items:

- Arbitrary value. Its meaning depends on the topic type: text content, pizza hash, etc.
- A reference to the topic.
- Zero or more *parents*. The new version is a logical continuation of all of its parents. The very first version has no parents. Every next version has the previous version as theparent. Merges are supported by specifying several parents.
- Zero or more *dependencies*. Dependencies are older versions of the same topic which have to be downloaded to check validity. Notice that some version may be both a parent and a dependency, in this case, it'll be downloaded, used for verification and then continued to a new version.
- A *continuation* flag and a *tag* flag, which are discussed later.
- Zero or more *links*. These don't have any logical value, they are just for network integrity to make sure that, given a single version hash, one can easily discover many other versions (even from different topics).
- A reference to a verification script (in the management chain, read below). The script will be used to verify data validity.
- Arbitrary metadata for the verification script.
- *Dying configuration*, which is discussed later.

```cpp
struct DyingConfiguration {
	time_t die_time;
	bool die_if_branch;
};


struct Version {
	std::vector<uint8_t> value;

	Ref<Topic> topic;
	std::vector<Ref<Version>> parents;
	std::vector<Ref<Version>> dependencies;
	bool is_continuation;
	bool is_tag;
	std::vector<Ref<Version>> links;

	Ref<ManagementBlock> management;
	std::vector<uint8_t> metadata;

	DyingConfiguration dying;
};
```

A version is considered valid if:

- Its topic is valid.
- Its dependencies are valid.
- The version verification script, contained in the management block, accepts it.
- A continuation version is required to loosely outlive its parents. A formal definition of this condition is given below.
- A tag version has to satisfy some other conditions defined below.

For parentless versions the continuation flag does not make sense, but no specific value is forced. The site is expected to choose a value and optionally force it via the verification script.


#### Reserved types

All types starting with `0x8000000000000000` are reserved. For now, the following types in the reserved range have a definition:

- `0x8000000000000000`: Site frontend. Version value contains the root directory.
- `0x8000000000000001`: Site backend. Version value contains the root directory.


### Branching

A *branch* is a version that has no continuation successors at a certain point of time from the view of a certain peer. If a new continuation version that has an old branch as a parent is published, that branch stops being a branch, and the new version becomes a branch instead. A branch is assumed to have *unique content*, which means that, for any two branches, each has content which the other one misses, i.e. the lowest common ancestor of the two branches is different from both of them.

In other words, the definition of branch is an adaptation of Git branch in decentralized systems.

For example, if we consider the following version graph with all versions being continuations and no dependencies:

```
A <- B <- C
     ^
     D <- E <- F
```

...then C and F are branches. Notice that if F is new and some peer hasn't received it yet, C and E would be branches from their point of view.

If C and F are merged into G, G becomes the only branch.

```
A <- B <- C <------\
     ^              G
     D <- E <- F <-/
```

If both B <- C and B <- D were non-continuation, B would be a branch as well.


### Dying

The process of "dying", or archiving, refers to the case when old versions which are no longer important are pruned.

A version is considered *immortal* if its die time is zero.

A version is considered *active* if its die time is in the future. An immortal version is always active. A branch with `die_if_branch = false` is always considered active; for immortal verions, `die_if_branch` value is meaningless. If nothing else, a version is active if it's a dependency of an active version.

Version A is considered to *loosely outlive* version B if:

- They are both immortal, or
- A is immortal while B is mortal, or
- A and B are both mortal, and A die time is at least as large as B die time, and
  - A and B have the same `die_if_branch` flags, or
  - A doesn't have `die_if_branch` flag while B has.

In other words, A loosely outlives B if, in any possible case, A is always active if B is active.

Example (dependencies are <=, parents are <-):

```
A [die time = -10 years] <- B <- C [die time = +5 years]
                            ^
                            D <- E <- F [die time = -1 day, die_if_branch = false]
                            ^    ^
                            |    G [die time = -1 day, die_if_branch = true]
                            |
H [die time = -10 years] <= I [die time = 0]
```

Some versions don't have die times or flags because they are not required for the sake of example.

- A is inactive.
- C is active because it's not dead yet.
- F is active because it's a branch, and `die_if_branch` flag is reset.
- F is inactive because, even though it's a branch, `die_if_branch` is set.
- H is active because it's a dependency of an active version.
- I is active because it's immortal.


### Storage optimization

All non-branch versions are kept just for history. Namely, the application is expected to work correctly if all non-branch versions except branch recursive dependencies become inaccessible.

Inactive versions are pruned, even though some clients with much storage may decide to always keep history. Version pruning allows more efficient data storage while not having lack of consensus problems. For instance, consider that we have the following state, with all blocks having small die time and reset `die_if_branch` flags:

```
A <- B <- C <- D <- E
```

Two people accidentally make changes to a topic at the same time:

```
A <- B <- C <- D <- E <- F <- G
                    ^
                    H <- I
```

If all blocks except G and I are pruned, the two versions become completely independent, but they are not pruned.

```
... <- G

... <- I
```

When the problem is found, one can merge the two versions:

```
... <- G <-\
            J
... <- I <-/
```

...which are later pruned to leave one final branch:

```
... <- J
```

In the world with a single branch, one half of the network would use G as head and the other half will use I as head, and merging would be impossible.

Notice that if a branch was errorneously created with `die_if_branch` flag, one can still keep it forever by issuing a new version with the following properties:

- Data is the same as what the old version has.
- Topic matches old version topic.
- The only parent is the old version.
- No dependencies.
- Continuation flag is not set.
- Tag flag is set.
- Management block is arbitrary.
- Metadata is arbitrary, possibly containing a signature.
- Die time is zero.

Such meta versions are called *tags*. Tag is called *stale* if its parent is inactive. Branching of a tag, both continuing it or not, is not allowed, so each tag is also a branch. Tags are expected to be used to mark release versions of products, important versions of posts, etc.

Notice that this definition is an application of Git tags to decentralized systems.


### Branch emerging

*Branch emerging* is a hypothetical situation when a non-branch version becomes a branch as time passes. Notice that it doesn't refer to the case when a non-branch version looks like a branch to a certain peer because they haven't downloaded a successor version. Instead, it refers to the situation when non-branch version successors are pruned and thus the version becomes a branch.

If branch emerging happened, old versions would spontaneously rise up next to new versions as branches with unique content, which is obviously wrong. Luckily, this situation is not possible in the current design because a child is always required to loosely outlive its parent.

Notice that this requirement does not actually limit dying configuration, it just makes things more reasonable. For instance, pretend you want to branch of an old version, but the new versions are temporary and shouldn't outlive the parent. This whole situation implies that you don't want to continue the parent branch, you want to make a new branch, so you reset the continuation flag. Notice that if you don't have the version itself, just a tag, you should use the tag's parent hash as your parent, even though you can't download it.


### Recommendations for dying configuration

The basic rules for die time assignment is:

- If the data stops being important somewhen, small die time and set `die_if_branch` flag are recommended.
- If the data is important while history isn't, small die time and reset `die_if_branch` flag are recommended.
- If the history is important, immortable versions are recommended.

Notice that, as explained above, if you make one version of a branch immortal, you either have to make all next versions immortal as well or make a new branch at some point. In the second case, it might be useful to tag the old branch, so that it doesn't show up as having unique content.


### Implementation

Downloading a topic from scratch is defined as follows:

- The download algorithm receives a single hash as the input. This hash is called *topic ID*.
- The topic object is downloaded using topic ID as hash.
- All topic dependencies are downloaded recursively.
- The topic management block is downloaded as defined below.
- The topic verification script is called to ensure topic validity.
- The topic pubsub is queried for a *base list of versions*. How this list is generated is defined below.
- Put all received versions to the download priority queue, ordered by the number of times they were mentioned.

For each version from the download priority queue:

- Download the version.
- The version is checked for activity. Inactive versions are rejected, unless the client is configured to save all history.
- All missing version dependencies are downloaded recursively by adding them to the top of the queue and restarting the loop.
- The version is checked for validity via its version verification script.
- The version is attempted to be added to the branch list, as defined below.
- Version parents are probed for download. For every parent:
  - If the download succeeded, check if it's active.
    - If it is, add the parent to the download queue.
    - If it's not, add the version hash to a small inactive version cache. This step is optional but recommended for speed.
  - If the download did not succeed, the parents are assumed to be pruned and thus unreachable.

Notice that the two algorithms above are happy-path. Download failures may be retried. Script rejections should not be rechecked.

Attempt to add a version to the branch list is defined as follows:

- Check if the version has any continuation successors in the local database. If yes, halt.
- If the version is a continuation, remove all its parents from branch list.
- Add the version to branch list.

Finally, a *base list of versions* is an optimized list of branches. In this context, "optimized" means that if a branch is included to the base list, branches that are referenced by its links (recursively) don't have to be included. However, in case the optimized list is small, it's recommended to also add more branches, e.g. the ones that are most far from the included ones.


## Management chain

The *management chain* is a tree of management blocks.

The parts of a management block are:

- An optional reference to the parent, missing for the genesis block.
- A management verification script, which checks other management blocks.
- A topic verification script, which checks if a topic is valid.
- A version verification script, which checks if a version is suitable for a topic.
- Metadata that is read by the parent management verification script.

```cpp
struct ManagementBlock {
	std::optional<Ref<ManagementBlock>> parent;
	Script<bool, ManagementBlock> management_verifier;
	Script<bool, Topic> topic_verifier;
	Script<bool, Topic, Version> version_verifier;
	std::map<uint64_t, std::vector<uint8_t>> metadata;
};
```


### Management verification script

A management block is considered valid if its parent is valid, and the parent's management verification script returns `true` for the child's contents. This allows controlling which parts of a management block can or cannot be changed.

A simple script could disallow any changes. If it was the genesis block, this would disallow any changes to the management chain at all. Notice that if it's not the genesis block, one may still branch of another block and thus bypass the rejection. Thus, any management verification script that could be used at some point of time will remain valid forever.

A more complex script would allow changing any scripts if the site owner's signature is in place. This is the recommended solution for single-owner sites.

```cpp
bool verify_management(const ManagementBlock& self, const ManagementBlock& block) {
	return verify_signature(block, block.metadata.at(1), self.metadata.at(0));
}
```

In this example, block metadata is expected to contain two values:

- At index 0, the owner public key is stored.
- At index 1, the signature is stored.

Notice that this script allows changing the owner if the previous owner agrees. However, the old owner will still be able to emit updates to the management chain because an old management block allowed that.


### Topic verification script

A topic verification script checks whether a topic is valid. The script may use a topic and all its dependencies as the input. Notice that its behavior may depend on topic type. For example, blog posts could be allowed from a specific group of people, while comments could be allowed from anyone. Additionally, for reserved topics (e.g. site code), only specific hashes are allowed:

```cpp
bool verify_topic(const ManagementBlock& self, const Topic& topic) {
	// There must be a single code topic, so we allow only specific hashes
	if(topic.type == 0x8000000000000000) {
		return topic._hash == "Qmhash1";
	} else if(topic.type == 0x8000000000000001) {
		return topic._hash == "Qmhash2";
	}

	// For posts, we allow topics only from owner and without dependencies
	if(topic.type == 0) {
		return topic.dependencies.empty() && verify_signature(topic, topic.metadata.at(0), self.metadata[0]);
	}

	// For comments, we allow topics from anyone as long as they include author public key and they're comments on posts
	if(topic.type == 1) {
		return topic.dependencies.size() == 1 && topic.dependencies[0]->type == 0 && topic.metadata.count(0);
	}

	// Unknown topics are forbidden
	return false;
}
```


### Version verification script

A version verification script checks whether a version of a topic is valid. As always, its behavior may depend on topic type. For example, comment edits by the original author and the site owner may be allowed. Comment edits may be expected to die in 2 years. Additionally, reserved topics (e.g. site code) may be changed by the owner only:

```cpp
using std::chrono::system_clock::time_point;
using std::chrono::system_clock::now;
using namespace std::literals::chrono_literals;

bool verify_version(const ManagementBlock& self, const Topic& topic, const Version& version) {
	// For code, we allow versions only from owner
	if(topic.type >= 0x8000000000000000) {
		return verify_signature(version, version.metadata.at(0), self.metadata[0]);
	}

	// For posts, we allow versions only from owner too
	if(topic.type == 0) {
		return verify_signature(version, version.metadata.at(0), self.metadata[0]);
	}

	// For comments, we allow versions from owner and author
	if(topic.type == 1) {
		// Force die in 2 years
		if(version.die_time == 0 || time_point::from_time_t(version.die_time) > now() + 2y) {
			return false;
		}

		// Force continuation and no dependencies
		if(!version.is_continuation || !version.dependencies.empty()) {
			return false;
		}

		return (
			verify_signature(version, version.metadata.at(0), topic.metadata[0]) ||
			verify_signature(version, version.metadata.at(0), self.metadata[0])
		);
	}

	// Unknown topics are forbidden
	return false;
}
```

Notice that version check cannot depend on previous versions, which may be pruned by this time. For example, you can't check that nothing was removed from the previous versions. Instead, you'd use new topic per each append, and use associations instead of parents.


## Design examples

### Single-owner blog with comments

The topics are a post and a comment. Each post or comment edit is a version. Posts are immortal, comments have to be dead in a year. Owner can make comments they like alive forever by adding tags to them.


### Multi-owner blog

A post is the only topic. A post version can be added by any owner, versions with "release" flag can only be added by topic author. Several branches may be used at once as temporaries. When other owners want to propose a change, they branch of without "release" flag and ask the blog author to merge the branch. Additionally, if at least 2/3 of the owners accept the change, the "release" flag is allowed, though the owners have to be careful not to make several release branches in the latter case.


### Multi-owner file storage

A file is the only topic. A file topic can be added by any owner, file versions are only allowed from file uploader. No modifications are permitted.


### Chess club

A game is the only topic. A game topic is valid if it's signed by two people who are both members of the club, membership is stored in the management chain. A move is a version of a game: each move contains new field state and the move itself in text format. Each move has the previous move as both the only dependency and the only parent, the first move has no dependencies or parents. A move is valid if its dependencies are valid, which is checked implicitly, if it's from one of the game players and if the move is correct in chess. Each move has die time of "now + 1 day" at the time of publishing. A finish version is allowed to be immortal. This allows pruning old never finished games while saving finished games. If a player notices that the game has two branches, cheating is detected; a new tag is added which has both branches as dependencies to prove that, if it's required. Additionally, sane players may compress their games into a single version by creating a tag that has the final version as a continuated parent, game moves and the result as the content and is signed by both game players.


## Glossary

- *Active* version -- version which is not subject to dying at the moment.
- *Archiving* -- see *dying*.
- *Association* -- a logical hierarchy of topics.
- *Base list of versions* -- a list of versions such that following the links results in downloading all known branches.
- *Branch* -- version that has no continuation successors at a certain point of time from the view of a certain peer.
- *Branch emerging* -- a hypothetical situation when a non-branch version becomes a branch as time passes.
- *Continuation* -- a version that has a specific branch as a parent.
- *Dependency* topic -- a topic that has to be downloaded for the successor topic to be meaningful.
- *Dependency* version -- an old version of a topic that has to be downloaded to check validity.
- *Dying* -- old unimportant version pruning.
- *Dying configuration* -- time or situation when a version becomes inactive.
- *Immortal* version -- version which die time is zero.
- *Link* -- a reference to a branch of any topic for network integrity.
- *Loosely outlive* -- always be active when another version is active.
- *Management chain* -- a tree of management blocks.
- *Parent* -- a previous version of a version.
- *Stale* tag -- tag which parent is inactive.
- *Tag* -- meta version that is used to increase version die time.
- *Topic* -- versioned data and its history.
- *Topic ID* -- topic hash.
- *Type* -- an integer value which is used to differentiate topic classes.
- *Unique content* -- one or more versions that no other branch has.
- *Verification script* -- a script that is used to verify data validity.
- *Version* -- all data of a topic at some point of time.