exports.get = device => {
  let capabilities = []
  if (device.capabilities) {
    device.capabilities.forEach(c => {
      if (typeof c === 'string') {
        switch (c) {
          case 'switch':
            capabilities.push({
              'attributes': [{'attribute': 'switch', 'type': 'bool'}],
              'actions': [{'action': 'on', 'args': null}, {'action': 'off', 'args': null}]
            })
            break
        }
      } else {
        capabilities.push(c)
      }
    })
    device.capabilities = capabilities
  }
}
