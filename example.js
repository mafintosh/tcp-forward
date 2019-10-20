const { Local, Remote } = require('./')

const r = new Remote()

r.on('tunnel-connect', function (socket, topic) {
  console.log('got a local connect', topic)
  socket.write('hi')
})

r.on('tunnel-close', function (port, topic) {
  console.log('tunnel is closing', port, topic)
})

r.on('tunnel-listening', function (port, topic) {
  console.log('tunnel is listening on port', port)
  const socket = require('net').connect(port)
  socket.on('data', (data) => console.log('server', data))
  socket.write('hi')
  setTimeout(function () {
    console.log('nu')
    socket.write('ho')
  }, 1000)
})

r.listen(10000, function () {
  const l = new Local(10000)

  // const socket = l.connect(Buffer.from('topic'))
  // socket.on('data', console.log)

  const s = l.createServer(function (socket) {
    console.log('got local socket')
    socket.on('data', console.log)
    socket.write('sup')
    s.close()
  })

  s.listen(Buffer.from('another topic'))
})
