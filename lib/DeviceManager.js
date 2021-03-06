var emitter = require('events').EventEmitter
var inherits = require('util').inherits
var utils = require('../lib/Utils')
var log = utils.log
var tpl = utils.get
var ssdp = require('../lib/UPnP').ssdp
var config = require('../config')
module.exports = DeviceManager

function DeviceManager (path, baseurl) {
  if (!(this instanceof DeviceManager)) return new DeviceManager(path, baseurl)
  emitter.call(this)
  let p = require('path')
  this.path = p.resolve(p.dirname(require.main.filename), path)
  this.baseurl = baseurl
  this.devices = new Map()
  this.plugins = []
  this.on('deviceEvent', e => {
    let device = this.devices.get(e.id)
    ssdp.notify(device, e)
    if (device.subscribers) {
      device.subscribers.forEach(s => {
        if (s.type === 'rest') {
          let plugin = this.plugins.find(p => p.constructor.name === device.source)
          if (plugin && typeof plugin.Execute === 'function') {
            plugin.Execute(device.id, 'query').then(dta => {
              let u = require('url').parse(s.url)
              let options = {
                hostname: u.hostname,
                port: u.port || 80,
                path: u.path,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json; charset="utf-8"'
                }
              }
              utils.httpRequest(options, JSON.parse(dta), 2000)
            }) // TODO: Replace by dynamic query for attributes
          } else {
            log.warn(['DEVICE MANAGER', 'ACTION', 'Plugin %s is unknown or has invalid signature'].join(log.separator), device.source)
          }
        }
      })
    }
  })
  this.on('deviceAdded', e => this.invalidate())
  this.on('deviceRemoved', e => {
    ssdp.byebye(this.devices.get(e.id))
    this.devices.delete(e.id)
  })
  log.info('Device manager is loaded on %s', this.path)
  this.invalidate()
}
inherits(DeviceManager, emitter)

var defaultDescriptor = {
  name: '',
  manufacturer: '',
  manufacturerurl: '',
  desc: '',
  model: '',
  modelid: '',
  modelurl: '',
  serialnumber: '',
  upc: '',
  type: null
}

var initDeviceSsdp = function (device, descriptor) {
  let isNew = (device.template == null)
  let isUpdate = (device.template !== descriptor)
  device.template = descriptor
  ssdp.init(device)
  let ip = config.mgrip
  device.descUrl = `http://${config.mgrip}:${config.mgrport}/${device.id}.xml`
  if (config.separateInterfaces) {
    ip = require('../lib/Utils').getNextIp(config.lan) // TODO: no such method. Check is separate interface is required for each device
  }
  log.info(['UDP', 'UNI', 'Creating socket for device %s(%s) on %s'].join(log.separator), device.name, device.id, ip)
  let handleSsdpRequest = (msg, sender) => {
    log.debug(['SSDP', 'REQ', msg].join(log.separator))
    let res = ssdp.decode(msg)
    if (res['m-search']) {
      let target = res['st']
      log.debug(['SSDP', 'SEARCH', 'Target : %s'].join(log.separator), target)
      ssdp.reply(device, target, sender)
    } else if (res['notify']) {
     // TODO: Should i handle notify here?
      // log.info('Notify - replace %s',res);
      // deviceManager.notify();
    } else {
      log.debug(['UDP', 'MULTI', 'Unknown request %s', res].join(log.separator))
    }
  }
  device.socket = require('dgram').createSocket({
    type: 'udp4',
    reuseAddr: true
  }, handleSsdpRequest).bind(ssdp.port, () => {
    device.socket.setMulticastTTL(ssdp.ttl)
    device.socket.setBroadcast(true)
    device.socket.setMulticastInterface(ip)
    device.socket.addMembership(ssdp.address, ip)
    device.socket.setMulticastLoopback(false)

    if (isNew) {
      device.sbid = device.sbid || 1
      device.scid = device.scid || 1
      device.alive = setInterval(() => ssdp.alive(device), ssdp.aliveTick)
      ssdp.alive(device)
    } else if (isUpdate) {
      device.socket.send(ssdp.update(device), ssdp.port, ssdp.address)
      log.debug(['UDP', 'SSDP', 'UPDATE', '%s(%s)'].join(log.separator), device.name, device.id)
    }
  })
}

DeviceManager.prototype.discovery = async function (dstart, dend) {
  log.info(['DEVICE MANAGER', 'DISCOVERY', 'Starting discovery'].join(log.separator))
  // TODO: Add retry here
  for (let p of this.plugins) {
    if (typeof p.Add === 'function') {
      dstart(p.constructor.name)
      log.debug(['DEVICE MANAGER', 'DISCOVERY', 'Discovery of %s'].join(log.separator), p.constructor.name)
      await p.Add()
      dend(p.constructor.name)
    }
  }
  log.info(['DEVICE MANAGER', 'DISCOVERY', 'Finished discovery'].join(log.separator))
}

DeviceManager.prototype.action = async function (id, action, args) {
  log.info(['DEVICE MANAGER', 'ACTION', 'Executing %s(%s) for %s'].join(log.separator), action, args || 'void', id)
  let device = this.devices.get(id)
  if (device) {
    if (action !== 'subscribe') {
      let plugin = this.plugins.find(p => p.constructor.name === device.source)
      if (plugin && typeof plugin.Execute === 'function') {
        return plugin.Execute(id, action, args)
      } else {
        log.warn(['DEVICE MANAGER', 'ACTION', 'Plugin %s is unknown or has invalid signature'].join(log.separator), device.source)
      }
    } else {
      let url = Buffer.from(args, 'base64').toString()
      if (!url.startsWith('http')) url = 'http://' + url
      device.subscribers = device.subscribers || []
      if (!device.subscribers.some(e => e.type === 'rest' && e.url === url)) {
        device.subscribers.push({
          url: url,
          created: new Date(),
          type: 'rest'
        })
        log.info(['DEVICE MANAGER', 'ACTION', 'Subscription %s created'].join(log.separator), url)
      } else {
        log.info(['DEVICE MANAGER', 'ACTION', 'Subscription %s already exists'].join(log.separator), url)
      }
      return JSON.stringify({
        id: id,
        'arguments': [ url ],
        'action': action
      })
    }
  } else {
    log.warn(['DEVICE MANAGER', 'ACTION', 'Device %s is unkown'].join(log.separator), id)
  }
}

DeviceManager.prototype.invalidate = function () {
  log.info(['DEVICE MANAGER', 'INVALIDATE', 'Reloading devices'].join(log.separator))
  require('fs').readdirSync(this.path).forEach(e => {
  // try{
   // Reload only new plugins
    let p = this.plugins.find(p => p.mname === e)
   // TODO: Load different plugins, not only node ones
    if (!p) {
      p = require([this.path, e].join('/'))(this)
      p.mname = e
      this.plugins.push(p)
    }
    for (let [id, dev] of this.devices) {
      let def = Object.assign({}, defaultDescriptor)
      dev = Object.assign(def, dev)
      let desc = null
      if (typeof dev.type === 'string') {
     // simple type
        desc = tpl(dev.type, dev, this.baseurl)
      }
      // update known capabilities
      tpl('capabilities', dev)
    // check if new device, if new, send alive
      initDeviceSsdp(dev, desc)
      this.devices.set(id, dev)
    };
   // } catch(e) { }
  })
  log.debug(['DEVICE MANAGER', 'INVALIDATE', 'Devices %o'].join(log.separator), this.devices)
}

DeviceManager.prototype.handle = function (req, res, callback) {
  let handled = false
  for (let [id, device] of this.devices) {
    switch (req.url) {
      case `/${id}.xml`:
        handled = true
        res.writeHead(200, {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(device.template)})
        res.end(device.template)
        log.debug(['HTTP', 'RES', req.url, device.template.replace(/[\n\r]/g, '')].join(log.separator))
        callback(null, device.template)
        return
      case `/${id}/control`:
        handled = true
    // standard control url
        let action = null
        for (let h in req.headers) {
          if (h.toUpperCase() === 'SOAPACTION') {
            action = req.headers[h]
            break
          }
        }
        if (action) {
          let body = []
          req.on('data', c => body.push(c)).on('end', () => {
            body = Buffer.concat(body).toString()
            log.debug(['HTTP', 'ACTION', action, body].join(log.separator))
            let c = ssdp.getAction(body, action)
            let args = ssdp.getActionArgs(body)
            if (c) {
              let eid = utils.uid()
              this.once('upnpaction-' + eid, e => {
                let r = tpl('actionResponse', e.action, action.replace('#' + e.action, ''), e.response.map(a => `<${a.key}>${a.value}</${a.key}>`).join(''))
                res.writeHead(200, {
                  'Content-Type': 'text/xml; charset=utf-8',
                  'Content-Length': Buffer.byteLength(r),
                  'SERVER': ssdp.server})
                res.end(r)
                callback(null, r)
              })
              this.emit('upnpaction', {
                id: device.id,
                action: c,
                args: args,
                eid: eid
              })
            } else {
              let r = tpl('actionError', '402', 'Required action is not matching request body')
              res.writeHead(500, {
                'Content-Type': 'text/xml; charset=utf-8',
                'Content-Length': Buffer.byteLength(r),
                'SERVER': ssdp.server})
              res.end(r)
              callback(null, r)
            }
          })
        } else {
          log.error(['HTTP', 'ACTION', 'Invalid SOAP action'].join(log.separator))
          let r = tpl('actionError', '401', 'No action by that name at this service.')
          res.writeHead(500, {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(r),
            'SERVER': ssdp.server})
          res.end(r)
          callback(null, r)
          return
        }
        break
      case `/${id}/event`:
        handled = true
   // standard subscribe url
        let cb, isSub, sid, timeout, rcode, rstatus
        for (let h in req.headers) {
          if (h.toUpperCase() === 'CALLBACK') {
            cb = req.headers[h]
          } else if (h.toUpperCase() === 'NT') {
            isSub = (req.headers[h] === 'upnp:event')
          } else if (h.toUpperCase() === 'SID') {
            sid = req.headers[h]
          } else if (h.toUpperCase() === 'TIMEOUT') {
            timeout = req.headers[h]
          }
          if (timeout === 'infinite') timeout = null // infinite is depricated
          timeout = timeout || ssdp.subDuraction // handle nil
          timeout = timeout.toString().replace('Second-', '')// handle arrived
        }
        if (req.method === 'SUBSCRIBE') {
          let idx
          if (sid & (cb | isSub)) {
            rcode = 400
            rstatus = 'An SID header field and one of NT or CALLBACK header fields are present.'
          } else if (!sid & !(cb | isSub)) {
            rcode = 412
            rstatus = 'An SID does not correspond to a known, un-expired subscription or the SID header field is missing or empty.'
          } else if (!sid & isSub) {
            device.subscribers = device.subscribers || []
            sid = 'uuid:' + utils.fullGuid()
            device.subscribers.push({
              id: sid,
              url: cb.substr(1).slice(0, -1),
              created: new Date(),
              timeout: timeout,
              type: 'ssdp'
            })
            log.info(['HTTP', 'SUBSCRIBE', 'CREATE', 'Target: %s (%s)'].join(log.separator), cb, sid)
          } else if (sid) {
            idx = device.subscribers.findIndex(s => s.id === sid)
            if (idx < 0) {
              rcode = 412
              rstatus = 'An SID does not correspond to a known, un-expired subscription or the SID header field is missing or empty.'
            } else {
              device.subscribers[idx].created = new Date()
              device.subscribers[idx].timeout = timeout
              log.info(['HTTP', 'SUBSCRIBE', 'RENEW', 'Target: (%s)'].join(log.separator), sid)
            }
          }
          res.writeHead(rcode || 200, {
            'Content-Type': 'text/xml; charset="utf-8"',
            'DATE': new Date().toUTCString(),
            'SERVER': ssdp.server,
            'SID': sid,
            'TIMEOUT': 'Second-' + timeout
          })
          res.end()
          callback(null, rstatus || sid)
          return
        } else if (req.method === 'UNSUBSCRIBE') {
          let idx
          if (sid & (cb || isSub)) {
            rcode = 400
            rstatus = 'An SID header field and one of NT or CALLBACK header fields are present.'
          } else if (!sid) {
            rcode = 412
            rstatus = 'An SID does not correspond to a known, un-expired subscription or the SID header field is missing or empty.'
          } else {
            idx = device.subscribers.findIndex(s => s.id === sid)
            if (idx < 0) {
              rcode = 412
              log.warn(['HTTP', 'UNSUBSCRIBE', 'Subscription %s not found'].join(log.separator), sid)
              rstatus = 'An SID does not correspond to a known, un-expired subscription or the SID header field is missing or empty.'
            } else {
              device.subscribers.splice(idx, 1)
              log.info(['HTTP', 'UNSUBSCRIBE', 'Delete %s for device'].join(log.separator), sid, device.id)
            }
          }
          res.writeHead(rcode || 200)
          res.end()
          callback(null, rstatus || sid)
          return
        } else {
          callback(new Error('Wrong UPnP Eventing'))
          return
        }
    }
  }
  if (!handled) callback(new Error('No Device method handlers found for this request ' + req.url))
}
