const lpmessage = require('length-prefixed-message')
const { Message } = require('./messages')

module.exports = class MessageParser {
  constructor (socket, handlers = {}) {
    const self = this

    this.closed = false
    this.handlers = handlers
    this.socket = socket
    this.socket.on('error', () => this.socket.destroy())
    this.socket.on('close', () => {
      this.closed = true
      if (this.handlers.onclose) this.handlers.onclose()
    })
    this.socket.on('connect', () => {
      if (this.handlers.onconnect) this.handlers.onconnect()
    })

    loop(null)

    function loop (message) {
      if (message && !self._decode(message)) return
      lpmessage.read(socket, loop)
    }
  }

  ping () {
    this._send(Message.TYPE.PING, null)
  }

  pong () {
    this._send(Message.TYPE.PONG, null)
  }

  unlisten (id) {
    this._send(Message.TYPE.UNLISTEN, Message.Unlisten.encode({ id }))
  }

  listen (topic, id) {
    this._send(Message.TYPE.LISTEN, Message.Listen.encode({ topic, id }))
  }

  listening (port) {
    this._send(Message.TYPE.LISTENING, Message.Listening.encode({ port }))
  }

  connect (topic) {
    this._send(Message.TYPE.CONNECT, Message.Connect.encode({ topic }))
  }

  stream () {
    this._send(Message.TYPE.STREAM, null)
  }

  end () {
    this.socket.end()
  }

  destroy (err) {
    this.socket.destroy()
    if (this.handlers.onerror) this.handlers.onerror(err)
  }

  _onping () {
    this.pong()
  }

  _onpong () {

  }

  _send (type, data) {
    lpmessage.write(this.socket, Message.encode({ type, data }))
  }

  _decode (buffer) {
    const d = decode(buffer, Message)
    if (!d) return
    const { type, data } = d

    switch (type) {
      case Message.TYPE.CONNECT: {
        const c = decode(data, Message.Connect)
        if (!c) return this.destroy(new Error('Invalid connect message'))
        if (this.handlers.onconnect) this.handlers.onconnect(c.topic)
        return true
      }

      case Message.TYPE.LISTEN: {
        const c = decode(data, Message.Listen)
        if (!c) return this.destroy(new Error('Invalid listen message'))
        if (this.handlers.onlisten) this.handlers.onlisten(c.topic, c.id)
        return true
      }

      case Message.TYPE.UNLISTEN: {
        const c = decode(data, Message.Unlisten)
        if (!c) return this.destroy(new Error('Invalid unlisten message'))
        if (this.handlers.onunlisten) this.handlers.onunlisten(c.id)
        return true
      }

      case Message.TYPE.LISTENING: {
        const c = decode(data, Message.Listening)
        if (!c) return this.destroy(new Error('Invalid listening message'))
        if (this.handlers.onlistening) this.handlers.onlistening(c.port)
        return true
      }

      case Message.TYPE.STREAM: {
        if (this.handlers.onstream) this.handlers.onstream(this.socket)
        return false
      }

      case Message.TYPE.PING: {
        this._onping()
        return true
      }

      case Message.TYPE.PONG: {
        this._onpong()
        return true
      }
    }

    return true
  }
}

function decode (buffer, enc) {
  if (!buffer) return null

  try {
    return enc.decode(buffer)
  } catch (_) {
    return null
  }
}
