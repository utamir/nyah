var utils = require('../lib/Utils')
var util = require('util')
var udp = require('dgram')
var discoSocket
var addr = '255.255.255.255'
var discoveryInterval = 1000
var log = utils.log
var to = utils.to
var config = require('../config')
var exec = require('child_process').exec
var dm
var moduleName

module.exports = Tplink
function Tplink (deviceManager) {
  if (!(this instanceof Tplink)) return new Tplink(deviceManager)
  dm = deviceManager
  moduleName = this.constructor.name
  discoSocket = initAutoDiscovery(config.uapip, false, true)
  discoSocket.on('device', info => {
    if (info.message.system && info.message.system.get_sysinfo) {
      // this is device info message
      initializeDevice(info.message.system.get_sysinfo)
      updateDevice(info.message.system.get_sysinfo, info.sender)
    } else {
      // TODO: Here we should handle ACKs e.g. {"system":{"set_relay_state":{"err_code":0}}} for switch
      log.info(['TPLINK', 'DISCO', 'Unexpected message %j from %s:%s'].join(log.separator), info.message, info.sender.address, info.sender.port)
    }
  })
  dm.on('upnpaction', handleUpnpAction)
}

var handleUpnpAction = function (e) {
  log.info(['TPLINK', 'ACTION', e.action, '%j'].join(log.separator), e.args)
  let target = dm.devices.get(e.id)
  if (target) {
    let oper = []
    switch (e.action) {
      // UPNP actions
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
        target.Target = (e.args['newTargetValue'] === true || e.args['newTargetValue'] === '1' || e.args['newTargetValue'] === 1)
        switchState(target.id, target.Target)
        break
      default: log.warn(['TPLINK', 'ACTION', `Unknown action ${e.action}`].join(log.separator)); break
    }
    let evt = `upnpaction-${e.eid}`
    let eargs = {
      id: e.id,
      response: oper,
      action: e.action
    }
    dm.emit(evt, eargs)
    return target
  } else {
    log.debug(['TPLINK', 'ACTION', e.action, '%j', 'Device %s is unknown'].join(log.separator), e.args, target.id)
  }
}

let initializeDevice = function (device) {
  if (!dm.devices.get(device.deviceId)) {
    device.id = device.deviceId
    let type = device.type
    if (type === 'IOT.SMARTPLUGSWITCH') device.kind = 'switch'
    // TODO: Find other values for other kinds
    device.name = device.alias
    device.manufacturer = 'TP-Link'
    device.manufacturerurl = 'http://www.tp-link.com/'
    device.desc = device.dev_name
  // device model is already in place
    device.type = 'BinaryLight' // TODO: Replace by decent device type based on type/model rather then binary switch
    // Values can be standard:
    // device.capabilities = ['switch']
    // Or custom
    device.capabilities = [{
      'attributes': [{'attribute': 'switch', 'type': 'bool'}],
      'actions': ['on', 'off']
      // alternative is [{'action': 'on'}, {'action': 'off'}]
    }]
    // END
    device.serialnumber = device.hwId
    // TODO: automate constructor name extraction
    device.source = moduleName
    dm.devices.set(device.id, device)
    dm.emit('deviceAdded', {id: device.id})
    log.info(['TPLINK', 'SETUP', 'UpNP device %s is initialized'].join(log.separator), device.id)
  }
}

let updateDevice = function (info, source) {
  let device = dm.devices.get(info.deviceId)
  if (device) {
    device.hostname = source.address
    device.port = source.port
    let state = device.Status
    device.Status = info.relay_state === 1
    if (state !== device.Status) {
      dm.emit('deviceEvent', {
        id: device.id,
        key: 'Status',
        value: device.Status
      })
    }
    // TODO: sync of other statuses for other device types
  } else {
    log.warn(['TPLINK', 'UPDATE', `Device ${info.deviceId} is not found`].join(log.separator))
  }
}

let switchState = (id, state) => new Promise((resolve, reject) => {
  let device = dm.devices.get(id)
  if (device) {
    device.Target = state
    if (device.Target === device.Status) {
      log.info(['TPLINK', 'SWITCH', `Device ${device.id} is already in required state. No action needed`].join(log.separator))
      resolve()
      return
    }
    let timeout = setTimeout(() => reject(new Error(`Timeout turning ${state ? 'on' : 'off'} switch ${device.id}`)), 5000)
    dm.on('deviceEvent', e => {
      if (e.id === device.id && e.key === 'Status' && e.value === device.Target) {
        clearTimeout(timeout)
        resolve()
      }
    })
    // we can use TCP request/response here, but we still use the same udp disco socket
    sendUdp(discoSocket, state ? messages.switchOn : messages.switchOff, device.hostname, device.port, device.id)
  } else {
    log.warn(['TPLINK', 'SWITCH', `Device {$id} is not found`].join(log.separator))
  }
})

let sendUdp = async (s, m, a, p, id, nospam) => new Promise((resolve, reject) => {
  s.send(m, 0, m.length, p, a,
    err => {
      // hide disco messages - no spam
      if (!nospam || err) {
        log.debug(['TPLINK', 'REQ', id || 'ALL', `${s.address().address}:${s.address().port} -> ${a}:${p}`, `Message ${_decrypt(m)} sent (${err})`].join(log.separator))
      }
      if (err) reject(err)
      else resolve()
    })
})

var initAutoDiscovery = function (ip, stopOnFound, nospam) {
  log.info(['TPLINK', 'AUTODISCOVERY', 'Initializing auto discovery'].join(log.separator))
  let handleDiscoRequest = (msg, sender) => {
    msg = _decrypt(msg).toString('utf8')
    if (!nospam) log.debug(['TPLINK', 'RES', `${sender.address}:${sender.port}`, msg].join(log.separator))
    if (stopOnFound) {
      clearInterval(timer)
    }

    // use socket as emitter
    socket.emit('device', {
      message: JSON.parse(msg),
      sender: sender
    })
  }
  let timer
  let socket = udp.createSocket({
    type: 'udp4',
    reuseAddr: true
  }, handleDiscoRequest).bind(null, ip, () => {
    socket.setBroadcast(true)
    socket.setMulticastInterface(ip)
    // socket.addMembership(addr, ip)
    socket.setMulticastLoopback(false)
    let sendDiscovery = async (s) => {
      await sendUdp(s, messages.discovery, addr, 9999, null, nospam)
      for (let d of dm.devices.values()) {
        if (d.source === moduleName) {
          await sendUdp(s, messages.discovery, d.hostname || addr, d.port || 9999, d.id, nospam)
        }
      }
    }
    timer = setInterval(() => sendDiscovery(socket), discoveryInterval)
    sendDiscovery(socket)
    log.info(['TPLINK', 'AUTODISCOVERY', 'Auto discovery is active'].join(log.separator))
  })
  socket.on('close', () => clearInterval(timer))
  return socket
}

Tplink.prototype.Execute = function (targetId, action, args) {
  let execute = async function (res, err) {
    let target = dm.devices.get(targetId)
    if (target) {
    // TODO: Validate capabilities.actions and .attributes here
      let waction, wparams
      if (action === 'query') {
        // waction = 'query'
        // wparams = '[ ]'
        // TODO: find the decent way of sending query to the device. Meanwhile, return whatever is there
        let r = {
          id: target.id,
          'attributes': [{
            'switch': target.Status
          }],
          'action': action
        }
        res(JSON.stringify(r))
        return
      } else {
        waction = 'update'
        wparams = {'switch': action} // args should be empty
      }
      let [error, result] = await to(switchState(target.id, action === 'on'))
      if (error) res()
      else {
        let r = {
          id: target.id,
          'attributes': [{
            'switch': target.Status
          }],
          'action': action
        }
        res(JSON.stringify(r))
      }
    } else {
      log.warn(['TPLINK', 'EXECUTE', 'Target %s is not found'].join(log.separator), targetId)
      res()
    }
  }
  return new Promise(execute)
}

Tplink.prototype.Add = async function () {
  let wlan = require('../lib/piwlan')(config.wlan)
  let ap = await wlan.scan()
  let apNet = ap.find(n => n.ssid.startsWith('TP-LINK_Smart Plug_'))
  if (!apNet) {
    log.info(['TPLINK', 'SETUP', 'No devices are not in pairing mode. Please, Press and hold for 5 seconds until led blinks amber and green. Press and hold for 10 seconds to reset.'].join(log.separator))
  } else {
    log.info(['TPLINK', 'SETUP', 'Device is found in pairing mode.'].join(log.separator))
    await wlan.connect(apNet, false)
    log.info(['TPLINK', 'SETUP', 'Starting configuration.'].join(log.separator))
    let setip = `sudo dhclient ${config.wlan} -v`
    let res = await util.promisify(exec)(setip)
    let sip = require('os').networkInterfaces()[config.wlan].find(i => i.family === 'IPv4' && !i.internal).address
    let disco = () => new Promise((resolve, reject) => {
      let socket = initAutoDiscovery(sip, true)
      let deviceFound = async info => {
        // unbind from cloud - just in case
        await sendUdp(socket, messages.cloudUnbind, info.sender.address, info.sender.port)
        // change cloud address - just in case
        await sendUdp(socket, messages.cloudSetUrl, info.sender.address, info.sender.port)
        // set wifi credentials
        await sendUdp(socket, messages.setWifi, info.sender.address, info.sender.port)
        socket.close()
        resolve(info.message)
      }
      socket.on('device', deviceFound)
    })
    // it can be only one device on device setup AP
    let device = await disco()
    log.info(['TPLINK', 'SETUP', 'Device %j found and setup'].join(log.separator), device)
    await wlan.disconnect(apNet, true)
    setip = `sudo ip addr flush dev ${config.wlan}`
    res = await util.promisify(exec)(setip)

    log.info(['TPLINK', 'SETUP', 'The device %j setup is completed'].join(log.separator), device)
  }
}

function _encrypt (input, firstKey) {
  if (!firstKey) firstKey = 0xAB
  let buf = Buffer.from(input)
  let key = firstKey
  for (var i = 0; i < buf.length; i++) {
    buf[i] = buf[i] ^ key
    key = buf[i]
  }
  return buf
}

function _decrypt (input, firstKey) {
  if (!firstKey) firstKey = 0xAB
  let buf = Buffer.from(input)
  let key = firstKey
  let nextKey
  for (var i = 0; i < buf.length; i++) {
    nextKey = buf[i]
    buf[i] = buf[i] ^ key
    key = nextKey
  }
  return buf
}

var messages = {
  discovery: _encrypt('{"system":{"get_sysinfo":{}}}'),
  setWifi: _encrypt(`{"netif":{"set_stainfo":{"ssid":"${config.ap.ssid}","password":"${config.ap.pwd}","key_type":3}}}`),
  cloudSetUrl: _encrypt(`{"cnCloud":{"set_server_url":{"server":"${config.uapip}"}}}`),
  cloudUnbind: _encrypt('{"cnCloud":{"unbind":null}}'),
  switchOn: _encrypt('{"system":{"set_relay_state":{"state":1}}}'),
  switchOff: _encrypt('{"system":{"set_relay_state":{"state":0}}}')
}
