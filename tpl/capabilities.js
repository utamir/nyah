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
          case 'temperatureSensor':
            capabilities.push({
              'attributes': [{'attribute': 'temperature', 'type': 'int'}]
            })
            break
          case 'humiditySensor':
            capabilities.push({
              'attributes': [{'attribute': 'humidity', 'type': 'int'}]
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
