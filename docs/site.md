# Planet site design

A Planet site is a DAG of *commits* which contain site data and a *management chain* which controls permissions.

## Objects

### Commit

A commit may contain arbitrary information, as well as references to other commits. A commit DAG represents versioned data and its history. The exact commit content depends on the site architecture. For instance:

- A Git hosting site could directly transform Git commits to Planet commits. Thus, a commit contains a single version of the whole directory tree.
- In a blog, a commit could contain a blog post or a comment.
- In a chat, a commit could contain a single message.

Additionally, a commit may contain a reference to its author, the author's signature, a reference to some file, and so on.

A commit structure contains the following fields:

- A *type*, which is an integer value. Types help to differentiate between kinds of content. For example, "0" could be mapped to blog posts, "1" -- to comments, and so on. Several types are reserved, see below.
- Arbitrary content. Its meaning depends on the commit type: text content, directory or file hash, etc.
- Zero or more *parents*. The new commit content is a modification or a derivative work of its parents. For instance, if blog posts are allowed to be edited, a new version of a blog post may have the previous commit as a parent. The very first version of a particular item has no parents. Merges are supported by specifying several parents.
- Zero or more *dependencies*. Dependencies are references to other commits that have to be downloaded to check commit validity. For example, whether a comment on a blog post is allowed may be specified in the post commit, hence it has to be a dependency. Notice that some commits may be both a parent and a dependency, in this case, they will be downloaded, used for verification and then continued to a new version.
- Zero or more *associations*. An association represents logical hierarchy. For example, a blog comment has a blog post (more precisely, some of its commits) as an association. Associations are split into chunks, grouped by type. The difference between an association and a dependency is that an association is optional to download while a dependency is required. However, a dependency can be an association too for site code simplicity.
- A reference to a *verification script* (in the management chain, read below). The script will be used to verify data validity.
- Arbitrary metadata for the verification script.
- A *continuation* flag, which marks whether the new commit content is a logical continuation of all of its parents. For example, a new blog post version may be a continuation, while a working draft might not be a continuation.
- A *tag* flag, which is explained later.
- Zero or more *links*. These don't have any logical value, they are just for network integrity to make sure that, given a single commit hash, one can easily discover many other commits, even with different types or completely unrelated to the current commit's data. The link, however, must point to the same site.
- *Dying configuration*, which is discussed later.

```cpp
struct DyingConfiguration {
	time_t death_time;
	bool die_if_branch;
};


struct Commit {
	uint32_t type;
	std::vector<uint8_t> content;

	std::vector<Ref<Commit>> parents;
	std::vector<Ref<Commit>> dependencies;
	std::map<uint32_t, std::vector<Ref<Commit>>> associations;

	Ref<ManagementBlock> management;
	std::vector<uint8_t> metadata;

	bool is_continuation;
	bool is_tag;

	std::vector<Ref<Commit>> links;
	DyingConfiguration dying;
};
```

A commit is referenced by its hash. A commit is considered valid if:

- Its dependencies are valid.
- The commit verification script, contained in the management block, accepts it.
- A continuation commit is required to loosely outlive its parents. A formal definition of this condition is given below.
- A tag commit has to satisfy some other constraints defined below.
- Additionally, only the first, initial site commit may have zero parents, dependencies and associations at the same time.

For parentless commits the continuation flag does not make sense, but no specific value is forced. The site is expected to choose a value and optionally force it via the verification script.


#### Reserved types

Types `0x80000000` and above are reserved. At the moment, the following types in the reserved range have a definition:

- `0x80000000`: Site frontend. Commit value contains the root directory.
- `0x80000001`: Site backend. Commit value contains the root directory.


### Branching

A *branch* is a commit that has no continuation successors at a certain point of time from the view of a certain peer. If a new continuation commit that has an old branch as a parent is published, that branch stops being a branch, and the new commit becomes a branch instead. A branch is assumed to have *unique content*, which means that, for any two branches, each has content which the other one misses, i.e. the lowest common ancestor of the two branches is different from both of them.

In other words, the definition of a branch is an adaptation of the Git branch for decentralized systems.

For example, if we consider the following commit graph with all commits being continuations and no dependencies:

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

The process of *dying*, refers to the case when old commits which are no longer important are pruned. Each commit may have a specific death time and a `die_if_branch` flag.

A commit is considered *immortal* if its death time is zero.

A commit is considered *active* if its death time is in the future. An immortal commit is always active. A branch with `die_if_branch = false` is always considered active; for immortal verions, `die_if_branch` value is meaningless. If nothing else, a commit is active if it's a dependency of an active commit.

Commit A is considered to *loosely outlive* commit B if:

- They are both immortal, or
- A is immortal while B is mortal, or
- A and B are both mortal, and A death time is at least as large as B death time, and
  - A and B have the same `die_if_branch` flags, or
  - A doesn't have `die_if_branch` flag while B has.

In other words, A loosely outlives B if, in any possible case, A is always active if B is active.

Example (dependencies are <=, parents are <-):

```
A [death time = -10 years] <- B <- C [death time = +5 years]
                              ^
                              D <- E <- F [death time = -1 day, die_if_branch = false]
                              ^    ^
                              |    G [death time = -1 day, die_if_branch = true]
                              |
H [death time = -10 years] <= I [death time = 0]
```

Some commits don't have death times or flags because they are not required for the sake of example.

- A is inactive.
- C is active because it's not dead yet.
- F is active because it's a branch, and `die_if_branch` flag is reset.
- G is inactive because, even though it's a branch, `die_if_branch` is set.
- H is active because it's a dependency of an active commit.
- I is active because it's immortal.


### Storage optimization

All non-branch commits are kept just for history. Namely, the application is expected to work correctly if all non-branch commits except branch recursive dependencies become inaccessible.

Inactive commits are pruned, even though some clients with much storage may decide to always keep history. Commit pruning allows more efficient data storage while not having lack of consensus problems. For instance, consider that we have the following state, with all blocks having small death time and reset `die_if_branch` flags:

```
A <- B <- C <- D <- E
```

Two people accidentally make changes to a topic at the same time:

```
A <- B <- C <- D <- E <- F <- G
                    ^
                    H <- I
```

If all blocks except G and I are pruned, the two commits become completely independent, but they are not pruned.

```
... <- G

... <- I
```

When the problem is found, one can merge the two commits:

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


### Tags

Notice that if a branch was errorneously created with `die_if_branch` flag, one can still keep it forever by issuing a new commit with the following properties:

- Type and data are the same as what the old commit has.
- The only parent is the old commit.
- No dependencies.
- Continuation flag is not set.
- Tag flag is set.
- Management block is arbitrary.
- Metadata is arbitrary, possibly containing a signature.
- The commit is immortal.

Such meta commits are called *tags*. A tag is called *stale* if its parent is inactive. Branching off a tag, both continuing it or not, is not allowed, so each tag is also a branch. Tags are expected to be used to mark release versions of products, important versions of posts, etc.

Notice that this definition is an application of Git tags to decentralized systems.


### Branch emerging

*Branch emerging* is a hypothetical situation when a non-branch commit becomes a branch as time passes. Notice that it doesn't refer to the case when a non-branch commit looks like a branch to a certain peer because they haven't downloaded a successor commit. Instead, it refers to the situation when non-branch commit successors are pruned and thus the commit becomes a branch.

If branch emerging happened, old commits would spontaneously rise up next to new commits as branches with unique content, which is obviously wrong. Luckily, this situation is not possible in the current design because a child is always required to loosely outlive its parent.

Notice that this requirement does not actually limit dying configuration, it just makes things more reasonable. For instance, pretend that you want to branch off an old commit, but the new commits are temporary and shouldn't outlive the parent. This whole situation implies that you don't want to continue the old branch, you want to make a new branch, so you reset the continuation flag. Notice that if you don't have the commit itself, just a tag, you should use the tag's parent hash as your parent, even though you can't download it.


### Recommendations for dying configuration

The basic rules for death time assignment are:

- If the data stops being important somewhen, small death time and set `die_if_branch` flag are recommended.
- If the data is important while history isn't, small death time and reset `die_if_branch` flag are recommended.
- If the history is important, immortal commits are recommended.

Notice that, as explained above, if you make one commit of a branch immortal, you either have to make all next commits immortal as well or make a new branch at some point. In the second case, it might be useful to tag the old branch, so that it doesn't show up as having unique content.


### Implementation

Downloading the site from scratch is defined as follows:

- The download algorithm receives a single hash as the input -- the hash of the first site commit. This hash is called *site ID*.
- The first commit object is downloaded using site ID as hash.
- The commit's associated management block is downloaded as defined below.
- The commit verification script is called to ensure the commit validity.
- The site pubsub is queried for a *base list of commits*. How this list is generated is defined below.
- All the received commit hashes are put to the download priority queue, ordered by the number of times they were mentioned.

For each commit from the download priority queue:

- The commit is downloaded.
- The commit is checked for activity. Inactive commits are rejected, unless the client is configured to save all history.
- All missing commit dependencies are downloaded recursively by adding them to the top of the queue and restarting the loop.
- The commit's management block is downloaded, recursively.
- The commit is checked for validity via its commit verification script.
- The commit is attempted to be added to the branch list, as defined below.
- Commit parents are probed for download. For every parent:
  - If the download succeeded, check if it's active.
    - If it is, add the parent to the download queue.
    - If it's not, add the commit hash to a small inactive commit cache. This step is optional but recommended for speed.
  - If the download did not succeed, the parents are assumed to be pruned and thus unreachable.

Notice that the two algorithms above are happy-path. Download failures may be retried. Script rejections should not be rechecked.

Attempt to add a commit to the branch list is defined as follows:

- Check if the commit has any continuation successors in the local database. If yes, halt.
- If the commit is a continuation, remove all its parents from branch list.
- Add the commit to branch list.

Finally, a *base list of commits* is an optimized list of branches. In this context, "optimized" means that if a branch is included to the base list, branches that are referenced by its links (recursively) don't have to be included. However, in case the optimized list is small, it's recommended to also add more branches, e.g. the ones that are most far from the included ones.


### Sample architecture recommendations

Under the conditions mentioned above, the recommended architecture for recursive versioned content (e.g. blogs with posts and comments, nested directories) is provided below.

The following types are used:

- Type 0 is the type of the root commit.
- Types 1, 2, etc. are used for content, e.g. 1 is used for blog posts and 2 is used for blog comments.

Each item (e.g. blog post or comment) has a single initial commit without any parents and with little content, and one or more continuation commits with real data. Each continuation commit should use the same version as a parent, and the initial commit as a dependency. The initial commit must use a commit of the previous type as a dependency. For instance:

- *Object A*: site root commit
  - Type: 0
  - Content: none
  - Parents: none
  - Dependencies: none
  - Continuation: no
  - Tag: no
  - Dying configuration: immortal
- *Object B:* blog post initial commit
  - Type: 1
  - Content: blog author ID
  - Parents: none
  - Dependencies: object A
  - Continuation: no
  - Tag: no
  - Dying configuration: arbitrary
- *Object C:* blog post content
  - Type: 1
  - Content: blog content
  - Parents: none
  - Dependencies: object B
  - Continuation: yes
  - Tag: no
  - Dying configuration: arbitrary
- *Object D:* blog comment initial commit
  - Type: 2
  - Content: comment author ID
  - Parents: none
  - Dependencies: object B
  - Continuation: no
  - Tag: no
  - Dying configuration: arbitrary
- *Object E:* blog comment content
  - Type: 2
  - Content: comment content
  - Parents: none
  - Dependencies: object D
  - Continuation: yes
  - Tag: no
  - Dying configuration: arbitrary
- *Object F:* blog comment update
  - Type: 2
  - Content: new comment content
  - Parents: object E
  - Dependencies: object D
  - Continuation: yes
  - Tag: no
  - Dying configuration: arbitrary


## Management chain

The *management chain* is a tree of management blocks.

The parts of a management block are:

- An optional reference to the parent, missing for the genesis block.
- A management verification script, which checks other management blocks.
- A commit verification script, which checks if a commit is valid.
- Metadata that is read by the parent management verification script.

```cpp
struct ManagementBlock {
	std::optional<Ref<ManagementBlock>> parent;
	Script<bool, ManagementBlock> management_verifier;
	Script<bool, Commit> commit_verifier;
	std::map<uint32_t, std::vector<uint8_t>> metadata;
};
```


### Management verification script

A management block is considered valid if its parent is valid, and the parent's management verification script returns `true` for the child's contents. This allows controlling which parts of a management block can or cannot be changed.

A simple script could disallow any changes. If it was the genesis block, this would disallow any changes to the management chain at all. Notice that if it's not the genesis block, one may still branch of another block and thus bypass the rejection. Thus, any management verification script that could be used at some point of time will remain valid forever.

A more complex script would allow changing any scripts if bith site owners' signatures are in place. This may be a good solution for multi-owner sites.

```cpp
bool verify_management(const ManagementBlock& self, const ManagementBlock& block) {
	return (
		verify_signature(block, block.metadata.at(2), self.metadata.at(0)) &&
		verify_signature(block, block.metadata.at(3), self.metadata.at(1))
	);
}
```

In this example, block metadata is expected to contain two values:

- At index 0, the first owner public key is stored.
- At index 1, the second owner public key is stored.
- At index 2, the first owner signature is stored.
- At index 3, the second owner signature is stored.

Notice that this script allows changing the owners if both previous owners agree. However, the old owners will still be able to emit updates to the management chain because an old management block allowed that.


### Commit verification script

A commit verification script checks whether a commit is valid. The script may use a commit and all its dependencies as the input. Notice that its behavior may depend on commit type. For example:

- Root commit may be create only by all owners at once.
- Blog posts may be created by a specific group of people.
- Blog comments may be posted by anyone, but they have to die in 2 years.
- Blog post and comment edits may be published by the original author.
- Additionally, for reserved types (e.g. site code), modifications may be allowed only if all owners agree.

```cpp
using std::chrono::system_clock::time_point;
using std::chrono::system_clock::now;
using namespace std::literals::chrono_literals;

bool verify_commit(const ManagementBlock& self, const Commit& commit) {
	// Site code: need signatures from both owners
	if(commit.type == 0x80000000 || commit.type == 0x80000001) {
		return (
			verify_signature(commit, commit.metadata.at(0), self.metadata[0]) &&
			verify_signature(commit, commit.metadata.at(1), self.metadata[1])
		);
	}

	// Root commit
	if(commit.type == 0) {
		return (
			commit.parents.empty() &&
			commit.dependencies.empty() &&
			commit.associations.empty() &&
			!commit.is_continuation &&
			!commit.is_tag &&
			verify_signature(commit, commit.metadata.at(0), self.metadata[0]) &&
			verify_signature(commit, commit.metadata.at(1), self.metadata[1])
		);
	}

	// Post or comment
	if(commit.type == 1 || commit.type == 2) {
		// Force comments to die in 2 years
		if(commit.type == 2 && (commit.dying.death_time == 0 || time_point::from_time_t(commit.dying.death_time) > now() + 2y)) {
			return false;
		}

		if(!commit.is_continuation) {
			// Initial version
			return (
				// The only dependency is site root commit / post initial commit
				commit.dependencies.size() == 1 &&
				commit.dependencies[0]->type == commit.type - 1 &&
				!commit.dependencies[0]->is_continuation &&
				// Tag flag
				!commit.is_tag &&
				// Signed
				verify_signature(commit, commit.metadata.at(0), commit.metadata.at(1)) &&
				// Signer is correct
				(
					commit.type == 1
						? (
							// Signed by any owner
							commit.metadata.at(1) == self.metadata[0] ||
							commit.metadata.at(1) == self.metadata[1]
						)
						: (
							// Anyone can post a comment
							true
						)
				)
			);
		} else {
			// Update
			return (
				// The only dependency is initial version
				commit.dependencies.size() == 1 &&
				commit.dependencies[0]->type == commit.type &&
				!commit.dependencies[0]->is_continuation &&
				// Tag flag
				!commit.is_tag &&
				// Signature
				verify_signature(commit, commit.metadata.at(0), commit.dependencies[0]->metadata[1])
			);
		}
	}

	// Unknown types are forbidden
	return false;
}
```

Notice that commit check cannot depend on parent commits, which may be pruned by this time. If you want to access older commits, you have to specify them as dependencies. However, notice that this might completely disallow pruning.


## Glossary

- *Active* commit -- a commit which is not subject to dying at the moment.
- *Association* -- a logical hierarchy of commits.
- *Base list of commits* -- a list of commits such that following the links results in downloading all known branches.
- *Branch* -- a commit that has no continuation successors at a certain point of time from the view of a certain peer.
- *Branch emerging* -- a hypothetical situation when a non-branch commit becomes a branch as time passes.
- *Continuation* -- a commit that has a specific branch as a parent.
- *Dependency* commit -- a commit that has to be downloaded to check validity of another commit.
- *Dying* -- old unimportant commit pruning.
- *Dying configuration* -- time or situation when a commit becomes inactive.
- *Immortal* commit -- commit which has death time of zero.
- *Link* -- a reference to a branch for network integrity.
- *Loosely outlive* -- always be active when another commit is active.
- *Management chain* -- a tree of management blocks.
- *Parent* -- a previous commit of a commit.
- *Stale* tag -- tag whose parent is inactive.
- *Tag* -- meta commit that is used to increase commit death time.
- *Type* -- an integer value which is used to differentiate commit classes.
- *Unique content* -- one or more commits that no other branch has.
- *Verification script* -- a script that is used to verify data validity.