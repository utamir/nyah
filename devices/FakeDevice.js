var log = require('../lib/Utils').log
var dm
module.exports = FakeDevice
function FakeDevice (deviceManager) {
  if (!(this instanceof FakeDevice)) return new FakeDevice(deviceManager)
  dm = deviceManager

  dm.on('upnpaction', e => {
    for (let id of this.ids) {
      if (e.id === id) {
        handleAction(e)
        break
      }
    }
  })

 // create only device descriptos of a fake type
  this.ids = []
  this.ids.push('deadbeef-fa11-abad-a555-babefacecafe')
  dm.devices.set(this.ids[0], {
    id: this.ids[0],
    name: 'Fake Binary Lights',
    manufacturer: 'Ipsum Domus',
    manufacturerurl: 'http://ipsumdomus.com/',
    desc: 'Fake virtual binary light device which can be used as test for the suite',
    model: 'Fake Light 1.0',
// modelid: '',
// modelurl: '', eventually leave empty
// serialnumber: '',
    upc: '884224355040',
    type: 'BinaryLight',
    capabilities: ['switch'],
    source: this.constructor.name
  })
  // dm.emit('deviceAdded', {id: this.ids[0]})
  log.info('Device %s added', this.ids[0])
  // try fake Philips hue bridge
  this.ids.push('e51e84ba-40f5-4a24-bf21-0a7eebb50e43')
  dm.devices.set(this.ids[1], {
    id: this.ids[1],
    name: 'Fake Philips hue bridge',
    manufacturer: 'Ipsum Domus',
    manufacturerurl: 'http://ipsumdomus.com/',
    desc: 'Fake Philips hue bridge to test SmartThings',
    model: 'Philips hue bridge',
// modelid: '',
// modelurl: '', eventually leave empty
    serialnumber: 'B827EB33001B',
    upc: '99999999999',
    type: 'Basic',
    source: this.constructor.name
  })
  // dm.emit('deviceAdded', {id: this.ids[1]})
  log.info('Device %s added', this.ids[1])
 // create fake event loop
  let fakeEvent = () => {
    let target = dm.devices.get(this.ids[0])
    target.Status = !(target.Status || false)
    dm.emit('deviceEvent', {
      id: this.ids[0],
      key: 'Status',
      value: target.Status
    })
  }
  setInterval(fakeEvent, 60000)

 // delay load next device
  setTimeout(() => {
    this.ids.push('deadbeef-fa11-abad-a555-facecafebabe')
    dm.devices.set(this.ids[2], {
      id: this.ids[2],
      name: 'Fake Basic Device',
      manufacturer: 'Ipsum Domus',
      manufacturerurl: 'http://ipsumdomus.com/',
      desc: 'Fake virtual basic device which can be used as test for the suite',
      model: 'Fake Device 1.0',
// modelid: '',
// modelurl: '', eventually leave empty
// serialnumber: '',
      upc: '884224355041',
      type: 'Basic',
      source: this.constructor.name
    })
    dm.emit('deviceAdded', {id: this.ids[2]})
    log.info('Device %s added', this.ids[2])
  }, 50000)
}

function handleAction (e) {
  log.info('Requested action: %s(%j) for %s', e.action, e.args, e.id)
    // handle fake methods
  let target = dm.devices.get(e.id)
  if (!target) {
    log.error('Target %s not found', e.id)
    return
  }
  let oper = []
  switch (e.action) {
    case 'GetStatus':
      oper.push({
        key: 'ResultStatus',
        value: target.Status || false
      })
      break
    case 'GetTarget':
      oper.push({
        key: 'RetTargetValue',
        value: target.Target || false
      })
      break
    case 'SetTarget':
      target.Target = e.args['newTargetValue']
      // set 2 secs artificial delay
      setTimeout(() => {
        target.Status = target.Target
       // TODO: Event here
      }, 2000)
      break
    default: log.warn('Unknown action: %s', e.action); break
  }
  let evt = `upnpaction-${e.eid}`
  let eargs = {
    id: e.id,
    response: oper,
    action: e.action
  }
  log.debug('Event: %s, %j', evt, eargs)
  dm.emit(evt, eargs)
}
