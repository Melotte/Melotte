// @ts-nocheck

const net = require('net')
const mafmt = require('mafmt')
const withIs = require('class-is')
const errCode = require('err-code')
const log = require('debug')('libp2p:tls')
const toConnection = require('./socket-to-conn')
const createListener = require('./listener')
const {multiaddrToNetConfig} = require('./utils')
const {AbortError} = require('abortable-iterator')
const {CODE_CIRCUIT, CODE_P2P} = require('./constants')
const multiaddr = require("multiaddr")

const tls = require("tls")

/**
 * @class TLS
 */
class TLS {
	/**
	 * @constructor
	 * @param {object} options
	 * @param {Upgrader} options.upgrader
	 */
	constructor({upgrader}) {
		if(!upgrader) {
			throw new Error('An upgrader must be provided. See https://github.com/libp2p/interface-transport#upgrader.')
		}
		this._upgrader = upgrader
	}

	/**
	 * @async
	 * @param {Multiaddr} ma
	 * @param {object} options
	 * @param {AbortSignal} options.signal Used to abort dial requests
	 * @returns {Connection} An upgraded Connection
	 */
	async dial(ma, options) {
		options = options || {}
		const socket = await this._connect(ma, options)
		const maConn = toConnection(socket, {remoteAddr: ma, signal: options.signal})
		log('new outbound connection %s', maConn.remoteAddr)
		const conn = await this._upgrader.upgradeOutbound(maConn)
		log('outbound connection %s upgraded', maConn.remoteAddr)
		return conn
	}

	/**
	 * @private
	 * @param {Multiaddr} ma
	 * @param {object} options
	 * @param {AbortSignal} options.signal Used to abort dial requests
	 * @returns {Promise<Socket>} Resolves a TCP Socket
	 */
	_connect(ma, options = {}) {
		if(options.signal && options.signal.aborted) {
			throw new AbortError()
		}

		return new Promise((resolve, reject) => {
			const start = Date.now()
			const cOpts = multiaddrToNetConfig(ma)

			log('dialing %j', cOpts)
			let rawSocket = net.connect(cOpts)
			let raw

			const onError = err => {
				err.message = `connection error ${cOpts.host}:${cOpts.port}: ${err.message}`
				done(err)
			}

			const onTimeout = () => {
				log('connnection timeout %s:%s', cOpts.host, cOpts.port)
				const err = errCode(new Error(`connection timeout after ${Date.now() - start}ms`), 'ERR_CONNECT_TIMEOUT')
				// Note: this will result in onError() being called
				rawSocket.emit('error', err)
			}

			const onConnect = () => {
				log('connection opened %j', cOpts)
				raw = rawSocket
				rawSocket.removeListener('error', onError)
				rawSocket.removeListener('timeout', onTimeout)
				rawSocket.removeListener('connect', onConnect)

				rawSocket = tls.connect({
					socket: raw, checkServerIdentity: () => {return undefined;},
					rejectUnauthorized: false
				}, done)

				// rawSocket.on("error")
			}

			const onAbort = () => {
				log('connection aborted %j', cOpts)
				rawSocket.destroy()
				done(new AbortError())
			}

			const done = err => {
				options.signal && options.signal.removeEventListener('abort', onAbort)

				if(err) return reject(err)
				resolve(rawSocket)
			}

			rawSocket.on('error', onError)
			rawSocket.on('timeout', onTimeout)
			rawSocket.on('connect', onConnect)
			options.signal && options.signal.addEventListener('abort', onAbort)
		})
	}

	/**
	 * Creates a TCP listener. The provided `handler` function will be called
	 * anytime a new incoming Connection has been successfully upgraded via
	 * `upgrader.upgradeInbound`.
	 * @param {*} [options]
	 * @param {function(Connection)} handler
	 * @returns {Listener} A TCP listener
	 */
	createListener(options, handler) {
		if(typeof options === 'function') {
			handler = options
			options = {}
		}
		options = options || {}
		return createListener({handler, upgrader: this._upgrader}, options)
	}

	/**
	 * Takes a list of `Multiaddr`s and returns only valid TCP addresses
	 * @param {Multiaddr[]} multiaddrs
	 * @returns {Multiaddr[]} Valid TCP multiaddrs
	 */
	filter(multiaddrs) {
		multiaddrs = Array.isArray(multiaddrs) ? multiaddrs : [multiaddrs]

		return multiaddrs.filter(ma => {
			if(ma.protoCodes().includes(CODE_CIRCUIT)) {
				return false
			}

			return mafmt.TLS.matches(ma.decapsulateCode(CODE_P2P))
		})
	}
}


module.exports = withIs(TLS, {className: 'TLS', symbolName: '@planet/libp2p-tls'})
