#!/usr/bin/env node

const { Remote } = require('./')

const r = new Remote()

r.on('listening', function () {
  console.log('tcp-forward server running on port ' + r.address().port)
})

r.on('forward-listening', function (port) {
  console.log('Tunnel listening and forwarding on port ' + port)
})

r.on('forward-close', function (port) {
  console.log('Tunnel closed forwarding port ' + port)
})

r.listen(port())

function port () {
  let i = process.argv.indexOf('-p')
  if (i === -1) i = process.argv.indexOf('--port')
  if (i === -1) return 0
  return Number(process.argv[i + 1]) || 0
}
