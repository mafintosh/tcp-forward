const MessageParser = require('./message-parser')
const net = require('net')
const events = require('events')
const crypto = require('crypto')

const RETRIES = [1000, 1000, 2000, 4000]

class ClientServer extends events.EventEmitter {
  constructor (port, host) {
    super()
    this.port = port
    this.listeningPort = 0
    this.id = crypto.randomBytes(32)
    this.host = host
    this.topics = []
    this.control = new MessageParser(net.connect({ port: this.port, host: this.host, allowHalfOpen: true }), this)
    this.retries = 0
    this.destroyed = false
    this._retrying = null
  }

  address () {
    return { port: this.listeningPort, address: this.host }
  }

  onclose () {
    this.control = null
    if (this.destroyed) return
    if (this.retries >= RETRIES.length) {
      this.emit('error', new Error('Cannot connect to remote tunnel'))
      return
    }

    const time = RETRIES[this.retries++]
    this._retrying = setTimeout(this._connect.bind(this), time)
  }

  onlistening (port) {
    if (port !== this.listeningPort) {
      this.listeningPort = port
      this.emit('listening', port, this.host)
    }
  }

  onconnect () {
    this.retries = 0
    this.emit('forward-connect')
  }

  onstream (stream) {
    this.control.handlers = {}
    this.control.stream()
    this.control = null
    this._connect()
    this.emit('connection', stream)
  }

  _connect () {
    this.control = new MessageParser(net.connect({ port: this.port, host: this.host, allowHalfOpen: true }), this)
    for (const topic of this.topics) this.control.listen(topic, this.id)
  }

  destroy (err) {
    if (this._retrying) clearTimeout(this._retrying)
    if (this.destroyed) return
    this.destroyed = true
    if (err) this.emit('error', err)
    if (this.control) {
      this.control.unlisten(this.id)
      this.control.end()
    }
    this.emit('close')
  }

  close () {
    this.destroy(null)
  }

  listen (topic = crypto.randomBytes(32)) {
    this.topics.push(topic)
    if (this.control) this.control.listen(topic, this.id)
  }
}

module.exports = class LocalTunnel {
  constructor (port, host) {
    this.port = port
    this.host = host
  }

  connect (topic) {
    const socket = net.connect({ port: this.port, host: this.host, allowHalfOpen: true })
    const m = new MessageParser(socket)
    m.connect(topic)
    m.stream()
    return socket
  }

  createServer (onconnection) {
    const server = new ClientServer(this.port, this.host)
    if (onconnection) server.on('connection', onconnection)
    return server
  }
}
