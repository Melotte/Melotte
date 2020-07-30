import IPFSRepo from "ipfs-repo"
import {Config, defaultConfig} from "../config"
import mergeOptions from "merge-options"
import deepEqual from "fast-deep-equal"
import PeerId from "peer-id";


export class RepoError extends Error {
}


export default class Repo {
	public config: Config;
	public repo: IPFSRepo;
	public peerID: PeerId;


	async init(config: Config) {
		this.repo = new IPFSRepo(config.Repo.Path, {autoMigrate: false})

		let repoInited = true;
		if(this.repo.closed) {
			try {
				await this.repo.open();
			} catch(e) {
				repoInited = false;
			}
		}

		if(!repoInited && config.Repo.AutoCreate === false)
			throw new RepoError("Repo creation disabled")
		if(repoInited)
			await this.initExisitingRepo(config)
		else
			await this.initNewRepo(config)
	}

	async initExisitingRepo(newConfig: Config) {
		this.config = <Config>await this.repo.config.getAll()
		let merged = mergeOptions(this.config, newConfig)
		if(!deepEqual(merged, this.config))
			await this.repo.config.replace(this.config = merged)
		this.peerID = await PeerId.createFromPrivKey(this.config.Identity!.PrivKey)
	}

	async initNewRepo(newConfig: Config) {
		this.config = mergeOptions(defaultConfig, newConfig)
		if(await this.repo.exists() === true)
			throw new RepoError("Repo exists but tried to create new repo")
		if(this.config.Identity!.PrivKey)
			this.peerID = await PeerId.createFromPrivKey(this.config.Identity!.PrivKey)
		else
			this.peerID = await PeerId.create({bits: this.config.Identity!.Bits})
		this.config.Identity = {
			PeerID: this.peerID.toB58String(),
			PrivKey: this.peerID.privKey.bytes.toString('base64')
		}
		await this.repo.init(this.config)
		await this.repo.open()
	}
}