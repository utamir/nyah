var dm
module.exports = FakeDevice
// This device is used only for UPnP discovery of the hub
function FakeDevice (deviceManager) {
  if (!(this instanceof FakeDevice)) return new FakeDevice(deviceManager)
  dm = deviceManager
  let sn = require('../config').mgrmac.replace(/\:/g, '').slice(-12).toUpperCase()
  let id = 'B16B00B5-8BAD-D06F-00DX-' + sn
  dm.devices.set(id, {
    id: id,
    name: 'Nyah',
    manufacturer: 'Ipsum Domus',
    manufacturerurl: 'http://ipsumdomus.com/',
    desc: 'Not Yet Another Hub',
    model: 'Nyah 1.0',
// modelid: '',
// modelurl: '', eventually leave empty
    serialnumber: sn,
//    upc: '884224355040',
    type: 'Nyah',
    capabilities: [],
    source: this.constructor.name
  })
}
