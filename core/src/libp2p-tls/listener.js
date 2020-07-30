// @ts-nocheck

const tls = require("tls")
const EventEmitter = require('events')
const debug = require('debug')
const log = debug('libp2p:tcp:listener')
log.error = debug('libp2p:tcp:listener:error')

const toConnection = require('./socket-to-conn')
const {CODE_P2P} = require('./constants')
const {
	getMultiaddrs,
	multiaddrToNetConfig
} = require('./utils')
const os = require("os")
const multiaddr=require("multiaddr")

const fs = require("fs")
/**
 * Attempts to close the given maConn. If a failure occurs, it will be logged.
 * @private
 * @param {MultiaddrConnection} maConn
 */
async function attemptClose(maConn) {
	try {
		maConn && await maConn.close()
	} catch(err) {
		log.error('an error occurred closing the connection', err)
	}
}

module.exports = ({handler, upgrader}, options) => {
	const listener = new EventEmitter()

	const server = tls.createServer({
		key: fs.readFileSync('../data/key.pem'), // Dummy keys
		cert: fs.readFileSync('../data/cert.pem'),
		requestCert: false,
		ca: []
	}, async socket => {
		// Avoid uncaught errors caused by unstable connections
		socket.on('error', err => log('socket error', err))
		let maConn
		let conn
		try {
			maConn = toConnection(socket, {listeningAddr})
			log('new inbound connection %s', maConn.remoteAddr)
			conn = await upgrader.upgradeInbound(maConn)
		} catch(err) {
			log.error('inbound connection failed', err)
			return attemptClose(maConn)
		}

		log('inbound connection %s upgraded', maConn.remoteAddr)

		trackConn(server, maConn)

		if(handler) handler(conn)
		listener.emit('connection', conn)
	})

	server
		.on('listening', () => listener.emit('listening'))
		.on('error', err => listener.emit('error', err))
		.on('close', () => listener.emit('close'))

	// Keep track of open connections to destroy in case of timeout
	server.__connections = []

	listener.close = () => {
		if(!server.listening) return

		return new Promise((resolve, reject) => {
			server.__connections.forEach(maConn => attemptClose(maConn))
			server.close(err => err ? reject(err) : resolve())
		})
	}

	let peerId, listeningAddr

	listener.listen = ma => {
		listeningAddr = ma
		peerId = ma.getPeerId()

		if(peerId) {
			listeningAddr = ma.decapsulateCode(CODE_P2P)
		}

		return new Promise((resolve, reject) => {
			const options = multiaddrToNetConfig(listeningAddr)
			server.listen(options, err => {
				if(err) return reject(err)
				log('Listening on %s', server.address())
				resolve()
			})
		})
	}

	listener.getAddrs = () => {
		const multiaddrs = []
		const address = server.address()

		if(!address) {
			throw new Error('Listener is not ready yet')
		}

		const ipfsId = listeningAddr.getPeerId()

		// Because TCP will only return the IPv6 version
		// we need to capture from the passed multiaddr
		if(listeningAddr.toString().indexOf('ip4') !== -1) {
			let m = listeningAddr.decapsulate('tcp')
			m = m.encapsulate('/tcp/' + address.port + '/tls')
			if(listeningAddr.getPeerId()) {
				m = m.encapsulate('/p2p/' + ipfsId)
			}

			if(m.toString().indexOf('0.0.0.0') !== -1) {
				const netInterfaces = os.networkInterfaces()
				Object.keys(netInterfaces).forEach((niKey) => {
					netInterfaces[niKey].forEach((ni) => {
						if(ni.family === 'IPv4') {
							multiaddrs.push(multiaddr(m.toString().replace('0.0.0.0', ni.address)))
						}
					})
				})
			} else {
				multiaddrs.push(m)
			}
		}

		return multiaddrs
	}

	return listener
}

function trackConn(server, maConn) {
	server.__connections.push(maConn)

	const untrackConn = () => {
		server.__connections = server.__connections.filter(c => c !== maConn)
	}

	maConn.conn.once('close', untrackConn)
}
