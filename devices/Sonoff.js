var utils = require('../lib/Utils')
var util = require('util')
var log = utils.log
var to = utils.to
var config = require('../config')
var exec = require('child_process').exec
var dm
var wsrv
var wsport = 8444
var hsport = 8443
var moduleName
module.exports = Sonoff
function Sonoff (deviceManager) {
  if (!(this instanceof Sonoff)) return new Sonoff(deviceManager)
  dm = deviceManager
  moduleName = this.constructor.name
  initServer()
}

var apiKey = '11111111-1111-1111-1111-11'
var initServer = function () {
  log.info(['SONOFF', 'HTTPS', 'Starting HTTPS server'].join(log.separator))
  require('https').createServer({
    key: config.sslkey,
    cert: config.sslcert
  }, (req, res) => {
    if (req.url === '/dispatch/device') {
      let body = []
      req.on('data', chunk => body.push(chunk)).on('end', () => {
        body = JSON.parse(body.join(''))
        log.debug(['SONOFF', 'HTTPS', 'REQ', req.method, req.url, '%j'].join(log.separator), body)
        let data = JSON.stringify({
          'error': 0,
          'reason': 'ok',
          'IP': config.uapip,
          'port': wsport
        })
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        })
        res.end(data)
        log.debug(['SONOFF', 'HTTPS', 'RES', '%s'].join(log.separator), data)
      })
    } else {
      log.error(['SONOFF', 'HTTPS', 'REQ', 'Unknown request %s'].join(log.separator), req.url)
      res.writeHead(404)
      res.end()
    }
  }).on('error', e => log.error(['SONOFF', 'HTTPS', e].join(log.separator))).listen(hsport, config.uapip)

  log.info(['SONOFF', 'WS', 'Starting WS server'].join(log.separator))
  wsrv = require('nodejs-websocket').createServer({
    secure: true,
    key: config.sslkey,
    cert: config.sslcert
  }, function (conn) {
    let cid = conn.socket.remoteAddress + ':' + conn.socket.remotePort
    log.debug(['SONOFF', 'WS', 'CONN', cid].join(log.separator))
    conn.on('text', function (str) {
      try {
        var data = JSON.parse(str)
        let res = handleWSRequest(data, cid)
        conn.sendText(JSON.stringify(res))
      } catch (e) {
        log.error(['SONOFF', 'WS', 'ERR', e].join(log.separator))
      }
    })
    conn.on('close', function (code, reason) {
      log.info(['SONOFF', 'WS', 'OFFLINE', `Connection to ${cid} was closed`, code, reason].join(log.separator))
      for (let d of dm.devices.values()) {
        if (d.cid === cid) {
     // dm.emit('deviceRemoved',{id: d.id});
          d.cid = null
          break
        }
      }
    })
    conn.on('error', err => log.error(['SONOFF', 'WS', err].join(log.separator)))
  }).listen(wsport, config.uapip)
  dm.on('upnpaction', e => {
    wsrv.connections.forEach(conn => {
      let cid = conn.socket.remoteAddress + ':' + conn.socket.remotePort
      let target = handleUpnpAction(e, cid)
      if (target) {
        let seqid = Math.floor(new Date() / 1000).toString()
        let res = {
          'apikey': apiKey + target.deviceid,
          'action': 'update',
          'deviceid': target.deviceid,
          'sequence': seqid,
          'params': {'switch': (target.Target ? 'on' : 'off')}
        }
        var r = JSON.stringify(res)
        conn.sendText(r)
        log.debug(['SONOFF', 'WS', 'REQ', r].join(log.separator))
      }
    })
  })
}
var handleUpnpAction = function (e, cid) {
  log.info(['SONOFF', 'ACTION', e.action, '%j'].join(log.separator), e.args)
  let target = dm.devices.get(e.id)
  if (target && target.cid === cid) {
    log.debug(['SONOFF', 'ACTION', e.action, '%j', 'Relevant target'].join(log.separator), e.args)
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
        break
      default: log.warn(['SONOFF', 'ACTION', `Unknown action ${e.action}`].join(log.separator)); break
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
    log.debug(['SONOFF', 'ACTION', e.action, '%j', 'Irrelevant target %s'].join(log.separator), e.args, cid)
  }
}

var handleWSRequest = function (data, cid) {
  let res = {
    'error': 0,
    'deviceid': data.deviceid,
    'apikey': apiKey + data.deviceid
  }
  log.debug(['SONOFF', 'WS', 'REQ', '%s', '%j'].join(log.separator), data.action ? data.action.toUpperCase() : 'SEQ', data)
  let id, target
  if (data.action) {
    switch (data.action) {
      case 'date':
        res.date = new Date().toISOString()
        break
      case 'register':
        let device = {
          deviceid: data.deviceid,
          version: data.romVersion,
          model: data.model,
          cid: cid,
          apikey: data.apikey
        }
        initializeDevice(device)
        res.config = {
          'hb': 1,
          'hbInterval': 5 // set heart bit to 5 seconds
        }
        break
      case 'update':
    // device wants to update its state
        id = apiKey + data.deviceid
        target = dm.devices.get(id)
        if (data.params.switch) {
          target.Status = (data.params.switch === 'on')
    // sync on target status
          target.Target = target.Status
          dm.emit('deviceEvent', {
            id: id,
            key: 'Status',
            value: target.Status
          })
        }
        if ((data.params.currentTemperature | data.params.currentHumidity) && data.params.sensorType !== 'ERROR_TYPE') {
          if (data.params.currentTemperature !== 'unavailable' && target.Temperature !== data.params.currentTemperature) {
            target.Temperature = data.params.currentTemperature
            dm.emit('deviceEvent', {
              id: id,
              key: 'Temperature',
              value: target.Temperature
            })
          }
          if (data.params.currentHumidity !== 'unavailable' && target.Humidity !== data.params.currentHumidity) {
            target.Humidity = data.params.currentHumidity
            dm.emit('deviceEvent', {
              id: id,
              key: 'Humidity',
              value: target.Humidity
            })
          }
        }
        target.cid = cid
    /* if(!target.cid) {
     log.warn(['SONOFF','WS','REQ','UPDATE', 'No cid found for %j. Associating cid: %s'].join(log.separator),target,cid);
     target.cid = cid;
    } */
        break
      case 'query':
        id = apiKey + data.deviceid
        target = dm.devices.get(id)
        res.params = {}
        data.params.forEach(p => {
          res.params[p] = target[p]
        })
        target.cid = cid
    /* if(!target.cid) {
     log.warn(['SONOFF','WS','REQ','QUERY','No sid found for %j. Associating cid: %s'].join(log.separator),target,cid);
     target.cid = cid;
    } */
        break
      default:
        log.warn(['SONOFF', 'WS', 'Unknown request: %j'].join(log.separator), data)
        break
    }
  } else {
  // TODO: Actually we have to listen to "sequence" respose for command execution, but in reality, it is not required due to SSDP spec
    id = apiKey + data.deviceid
    target = dm.devices.get(id)
    target.cid = cid
  /* if(!target.cid) {
   log.warn(['SONOFF','WS','REQ','SEQUENCE','No sid found for %j. Associating cid: %s'].join(log.separator),target,cid);
   target.cid = cid;
  } */
  // TODO: Here we just assing requested value to the actual
    if (data.sequence) {
      target.Status = target.Target
      dm.emit('deviceEvent', {
        id: id,
        key: 'Status',
        value: target.Status
      })
      dm.emit('sonoff-' + data.sequence, {
        id: id
      })
    }
  }
  log.debug(['SONOFF', 'WS', 'RES', '%j'].join(log.separator), res)
  return res
}

var initializeDevice = function (device) {
  let id = apiKey + device.deviceid
  if (!dm.devices.get(id)) {
    device.id = id
    let type = device.deviceid.substr(0, 2)
    if (type === '10') device.kind = 'switch'
    else if (type === '20') device.kind = 'light'
    else if (type === '30') device.kind = 'sensor' // temperature and humidity. No timers here;
    device.name = `Sonoff ${device.kind}`
    device.manufacturer = 'Sonoff'
    device.manufacturerurl = 'https://www.itead.cc'
    device.desc = 'Sonoff wifi smart home device'
  // device model is already in place
    device.type = 'BinaryLight' // TODO: Replace by decent device type based on type/model rather then binary switch
    // Values can be standard:
    device.capabilities = ['switch']
    // Or custom
    /* device.capabilities = [{
      'attributes': [{'attribute': 'switch', 'type': 'bool'}],
      'actions': ['on', 'off']
      // alternative is [{'action': 'on'}, {'action': 'off'}]
    }] */
    // HACK: PSA-BHA-GL might have also temperature and humidity sensors
    if (device.model === 'PSA-BHA-GL') {
      device.capabilities.push('temperatureSensor')
      device.capabilities.push('humiditySensor')
    }
    // END
    device.serialnumber = device.deviceid
    // TODO: automate constructor name extraction
    device.source = moduleName
    dm.devices.set(device.id, device)
    dm.emit('deviceAdded', {id: device.id})
    log.info(['SONOFF', 'SETUP', 'UpNP device %s is initialized'].join(log.separator), id)
  } else {
    log.info(['SONOFF', 'SETUP', 'UpNP device %s is already initialized'].join(log.separator), id)
    // send actual target to sync device
    let conn = wsrv.connections.find(c => {
      let cid = c.socket.remoteAddress + ':' + c.socket.remotePort
      return device.cid === cid
    })
    if (conn) {

    }
  }
}

Sonoff.prototype.Execute = function (targetId, action, args) {
  let execute = function (res, err) {
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
        if (target.Temperature) r.attributes.push({'temperature': target.Temperature})
        if (target.Humidity) r.attributes.push({'humidity': target.Humidity})
        res(JSON.stringify(r))
        return
      } else {
        waction = 'update'
        wparams = {'switch': action} // args should be empty
      }
      let conn = wsrv.connections.find(c => {
        let cid = c.socket.remoteAddress + ':' + c.socket.remotePort
        return target.cid === cid
      })
      if (conn) {
        let seqid = Math.floor(new Date() / 1000).toString()
        let req = {
          'apikey': apiKey + target.deviceid,
          'action': waction,
          'deviceid': target.deviceid,
          'sequence': seqid,
          'params': wparams
        }
        // TODO: Find a better way to do it instead of hardcoded "on"
        target.Target = (action === 'on')
        var r = JSON.stringify(req)
        let execTimeout = setTimeout(() => {
          log.warn(['SONOFF', 'EXECUTE', 'Connection timeout for %s'].join(log.separator), targetId)
          res()
        }, 5000)
        // we just using DM as emmiter. Not really intended to send events there
        dm.once('sonoff-' + seqid, e => {
          clearTimeout(execTimeout)
          let t = dm.devices.get(e.id)
          let r = {
            id: t.id,
            'attributes': [{
              'switch': t.Status
            }],
            'action': action
          }
          res(JSON.stringify(r))
        })
        conn.sendText(r)
        log.debug(['SONOFF', 'WS', 'REQ', r].join(log.separator))
      } else {
        log.warn(['SONOFF', 'EXECUTE', 'Connection is not found for %s'].join(log.separator), targetId)
        res()
      }
    } else {
      log.warn(['SONOFF', 'EXECUTE', 'Target %s is not found'].join(log.separator), targetId)
      res()
    }
  }
  return new Promise(execute)
}

Sonoff.prototype.Add = async function () {
  let wlan = require('../lib/piwlan')(config.wlan)
  let ap = await wlan.scan()
  let apNet = ap.find(n => n.ssid.startsWith('ITEAD-1000'))
  if (!apNet) {
    log.info(['SONOFF', 'SETUP', 'No devices are not in pairing mode. Please, Long press until led start blinking fast.'].join(log.separator))
  } else {
    log.info(['SONOFF', 'SETUP', 'Device is found in pairing mode.'].join(log.separator))
    apNet.pwd = '12345678'
    await wlan.connect(apNet, false)

    log.info(['SONOFF', 'SETUP', 'Starting configuration.'].join(log.separator))
    let sip = '10.10.7.2'
    let setip = `sudo ifconfig ${config.wlan} ${sip}`
    let err, res
    res = await util.promisify(exec)(setip);
    [err, res] = await to(utils.httpRequest({
      hostname: '10.10.7.1',
      port: 80,
      path: '/device',
      method: 'GET',
      localAddress: sip
    }))
    if (err) {
      log.error(['SONOFF', 'SETUP', 'The device is unable to complete setup due to %s'].join(log.separator), err)
      return
    }
    res = JSON.parse(res)
    let device = {
      deviceid: res.deviceid,
      apiKey: res.apikey
    };
    [err, res] = await to(utils.httpRequest({
      hostname: '10.10.7.1',
      port: 80,
      path: '/ap',
      method: 'POST',
      localAddress: sip
    }, {
      'version': 4,
      'ssid': config.ap.ssid,
      'password': config.ap.pwd,
      'serverName': config.uapip,
      'port': hsport
    }))
    if (err) {
      log.error(['SONOFF', 'SETUP', 'The device is unable to complete setup due to %s'].join(log.separator), err)
    }
    await wlan.disconnect(apNet, true)
    setip = `sudo ip addr flush dev ${config.wlan}`
    res = await util.promisify(exec)(setip)

   // initializeDevice(device);

    log.info(['SONOFF', 'SETUP', 'The device %j setup is completed'].join(log.separator), device)
  }
}
