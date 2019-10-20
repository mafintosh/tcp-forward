const net = require('net')
const MessageParser = require('./message-parser')
const pump = require('pump')
const events = require('events')
const thunky = require('thunky')

const MAX_QUEUED = 16
const MAX_CONTROL_WAIT = 7000

class ServerState {
  constructor (tunnel, id) {
    this.tunnel = tunnel
    this.id = id
    this.actives = 0
    this.server = null
    this.listening = new Set()
    this.queued = []
    this.waiting = []
    this.destroyed = false
    this._timeout = null

    this.open = thunky((cb) => {
      const self = this

      this.server = net.createServer(this.onconnection.bind(this))
      this.server.on('error', done)
      this.server.on('listening', done)
      this.server.listen(0)

      function done (err) {
        self.server.removeListener('error', done)
        self.server.removeListener('listening', done)
        if (err) return cb(err)
        cb(null, self.server.address().port)
      }
    })
  }

  active () {
    if (this._timeout) {
      clearTimeout(this._timeout)
      this._timeout = null
    }
    this.actives++
  }

  inactive () {
    this.actives--
    if (this.actives === 0) {
      this._timeout = setTimeout(this.destroy.bind(this), MAX_CONTROL_WAIT)
    }
  }

  destroy () {
    if (this.destroyed) return
    this.destroyed = true
    for (const socket of this.queued) socket.destroy()
    for (const fn of this.waiting) fn(new Error('Server closed'))
    if (!this.listening.size) return
    for (const hex of this.listening) {
      this.tunnel.emit('forward-close', this.server.address().port, Buffer.from(hex, 'hex'), this.id)
    }
    this.listening = new Set()
    this.server.close()
  }

  onconnection (socket) {
    if (this.destroyed) return socket.destroy()

    if (this.waiting.length) {
      const next = this.waiting.shift()
      next(null, socket)
      return
    }

    if (this.queued.length >= MAX_QUEUED) {
      socket.destroy()
      return
    }

    socket.on('error', destroy)
    socket.on('close', this.onqueuedclose.bind(this, socket))

    this.queued.push(socket)
  }

  onqueuedclose (socket) {
    const i = this.queued.indexOf(socket)
    if (i > -1) this.queued.splice(i, 1)
  }

  next (cb) {
    if (this.queued.length) {
      const next = this.queued.shift()
      cb(null, next)
      return
    }

    this.waiting.push(cb)
  }

  listen (topic, cb) {
    this.open((err, port) => {
      if (err) return cb(err)
      if (this.destroyed) {
        this.server.close()
        return cb(new Error('Server closed'))
      }
      const hex = topic.toString('hex')
      if (!this.listening.has(hex)) {
        this.listening.add(hex)
        this.tunnel.emit('forward-listening', port, topic, this.id)
      }
      cb(null, port)
    })
  }
}

function destroy () {
  this.destroy()
}

module.exports = class RemoteTunnel extends events.EventEmitter {
  constructor () {
    super()
    this.control = net.createServer(this.onconnection.bind(this))
    this.control.on('error', this.emit.bind(this, 'error'))
    this.control.on('listening', this.emit.bind(this, 'listening'))
    this.servers = new Map()
    this.listening = false
  }

  address () {
    return this.control.address()
  }

  active (id) {
    const hex = id.toString('hex')
    let s = this.servers.get(hex)

    if (!s) {
      s = new ServerState(this, id)
      this.servers.set(hex, s)
    }

    s.active()

    return s
  }

  onconnection (socket) {
    const self = this

    let connecting = null
    let serverSocket = null
    let server = null

    const control = new MessageParser(socket, {
      onconnect (topic) {
        connecting = topic
      },
      onstream (stream) {
        if (connecting) {
          if (!self.emit('forward-connect', stream, connecting)) stream.destroy()
          return
        }

        if (serverSocket) {
          pump(stream, serverSocket)
          return
        }

        stream.destroy()
      },
      onlisten (topic, id) {
        server = self.active(id)
        server.listen(topic, function (err, port) {
          if (control.closed) return
          if (err) return control.destroy(err)
          control.listening(port)
        })
        server.next(function (err, socket) {
          if (err) return control.destroy(err)
          if (control.closed) return server.onconnection(socket)
          control.stream()
          pump(socket, control.socket)
          serverSocket = socket
          server.inactive()
          server = null
        })
      },
      onunlisten (id) {
        if (!server) server = self.active(id)
        server.destroy()
      },
      onclose () {
        if (server) server.inactive()
      }
    })
  }

  destroy () {
    if (!this.listening) return
    this.control.close()
    for (const server of this.servers.values()) {
      server.destroy()
    }
  }

  listen (...args) {
    this.listening = true
    this.control.listen(...args)
  }
}
