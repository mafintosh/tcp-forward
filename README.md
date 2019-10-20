# tcp-forward

TCP forwarding module that allow you to forward client connections and servers to a remote.

```
npm install tcp-forward
```

## Usage

``` js
const { Local, Remote } = require('tcp-forward')
```

First setup a remote forwarding server

``` js
const r = new Remote()

r.on('forward-listening', function (port, topic) {
  console.log('Client connected and we are forwarding port ' + port)
  console.log('Client passed the following topic as well', topic)
})

r.on('forward-close', function (port, topic) {
  console.log('Client server closed or became unresponsive, closed port ' + port)
  console.log('Client had the following topic', topic)
})

r.on('forward-connect', function (socket, topic) {
  console.log('Client connected to us and is asking us to forward the socket')
  console.log('Client passed the following topic as well', topic)
})

r.listen(10000)

// to shut it down call r.destroy()
```

Then you can setup clients to use the forwarding to server to act
as a server/client for them.

``` js
const l = new Local(1000, 'remote-server.com')

const server = l.createServer()

server.on('connection', function (socket) {
  // got forwarded socket
})

server.on('error', function () {
  console.log('Connection lost to the server')
})

server.on('listening', function () {
  console.log('The remote server is listening on port', server.address().port, 'for us')
})

server.listen(Buffer.from('some topic that is forwarded to the server'))

// call server.close() or server.destroy() to shut it down
```

You can connect using a client connection as well

``` js
const socket = l.connect(Buffer.from('some topic'))
```

## CLI

If you just want to run a simple forwarding server a CLI is available also

``` sh
npm install -g tcp-forward
tcp-forward-server --port 10000 # runs a forwarding server on port 10000
```

## License

MIT
