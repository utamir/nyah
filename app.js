#!/usr/bin/env node
'use strict'
var utils = require('./lib/Utils')
var log = utils.log
var to = utils.to
var fs = require('fs')
var util = require('util')
var p = require('path')

let uid = parseInt(process.env.SUDO_UID)
if (uid) process.setuid(uid)

log.setLevel(log.levels.DEBUG)
log.oneLine = true
// log.noLog = ['UDP','SSDP'];

process.on('uncaughtException', err => {
  log.debug('uncaughtException')
  log.error(err.stack)
  process.exit()
})

const cluster = require('cluster')
if (cluster.isMaster) {
  cluster.fork()

  cluster.on('exit', function (worker, code, signal) {
    cluster.fork()
  })
}

if (cluster.isWorker) {
  var config = require('./config')
  log.info('Initializing NYAH on %s:%s', config.mgrip, config.mgrport)
  var tpl = utils.get

  var deviceManager = require('./lib/DeviceManager')('./deviceTypes', `http://${config.mgrip}:${config.mgrport}`)
  let http = require('http').createServer(async function (req, res) {
    log.debug(['HTTP', 'REQ', req.url].join(log.separator))
    if (req.url === '/logs') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'})
      res.end(tpl('log', {ip: config.mgrip, port: config.mgwsport}))
    } else if (req.url === '/add') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'})
      res.write('<html><head><title>Searching new device</title></head><body>')
      await deviceManager.discovery(d => res.write(`<div><span>Start searching for ${d}...</span>`), d => res.write(`<span>End searching for ${d}...</span></div>`))
      res.end('</body></html>')
    } else if (req.url === '/devices') {
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'})
      let devices = []
      for (let device of deviceManager.devices.values()) {
        devices.push({
          id: device.id,
          name: device.name,
          manufacturer: device.manufacturer,
          description: device.desc,
          model: device.model,
          upnptype: device.upnpType,
          capabilities: device.capabilities
        })
      }
      res.end(JSON.stringify(devices))
    } else if (req.url.startsWith('/action')) {
   // this is action API to perform operation.
   // Syntax is /action/{device id}/{action}/{optional: action arguments}
   // Sample: /action/111-222-333-444/on
   // Sample: /action/111-222-333-444/timer/00_05_*_*_*_* = send to target "timer : 00 05 * * * * "
      let r = req.url.split('/')
      if (r.length < 3) {
        res.writeHead(500, {'Content-Type': 'application/json; charset=utf-8'})
        res.end('{"error": {"code": 500, "message": "Invalid arguments"}}')
        log.warn(['ACTION', 'Invalid arguments', '%j'].join(log.separator), r)
      } else {
        let id = r[2]
        let ac = r[3]
        let args = r.length === 4 ? r[4] : null
        res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'})
        log.info(['ACTION', ac, id].join(log.separator))
        let device = deviceManager.devices.get(id)
        if (device) {
          let ex = await deviceManager.action(id, ac, args)
          res.end(ex || '{"error": {"code": 200, "message": "Unable to perform action"}}')
        } else {
          res.end('{"error": {"code": 200, "message": "Unknown device"}}')
        }
      }
    } else if (req.url.startsWith('/test')) {
   // this is test API to perform operation.
   // Syntax is /test/{action}/{device id}/{operation}-{params}/{optional: action arguments cron scheduler separated by _}
   // Sample: /test/cron/111-222-333-444/SetTarget-newTargetValue:1/00_05_*_*_*_*/ = set target true every 5 minute
   // Sample: /test/cron/111-222-333-444/SetTarget-newTargetValue:1/ = removes previous cron task
      let r = req.url.split('/')
      if (r.length < 4) {
        res.writeHead(500, {'Content-Type': 'text/html; charset=utf-8'})
        res.end()
        log.warn(['TEST', 'Invalid arguments', '%j'].join(log.separator), r)
        return
      }
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'})
      res.write('<html><head><title>Test device</title></head><body>')
      let cmd = r[2].toLowerCase()
      let id = r[3]
      log.info(['TEST', cmd, id].join(log.separator))
      switch (cmd) {
        case 'cron':
          let device = deviceManager.devices.get(id)
          if (device) {
            this.cron = this.cron || {}
            let oper = r[4].split('-')
            let crn = r[5] ? r[5].split('_') : null
            let jid = utils.checksum(`${id} ${r[4]}`)
            if (crn) {
              res.write((!this.cron[jid] ? `<h2>Create` : `<h2>Update`) + ` cron job ${r[4]} - ${crn}<br/>(job: ${jid})</h2>`)
              if (this.cron[jid]) {
                this.cron[jid].stop()
                this.cron[jid] = null
              }
              let c = require('./lib/cron')
              this.cron[jid] = new c.CronJob(crn.join(' '), () => {
                let eid = utils.uid()
                deviceManager.once('action-' + eid, e => {
                  log.info(['TEST', cmd, 'Command executed'].join(log.separator))
                })
                let args = {}
                if (oper.length > 1) {
                  oper[1].split(';').forEach(p => {
                    let o = p.split(':')
                    args[o[0]] = o[1]
                  })
                }
                deviceManager.emit('upnpaction', {
                  id: id,
                  action: oper[0],
                  args: args,
                  eid: eid
                })
              })
            } else {
              this.cron[jid] = crn
              res.write(`<h2>Remove cron job ${r[4]}<br/>(job: ${jid})</h2>`)
            }
          } else {
            res.write(`<h2>Unknown device ${id}</h2>`)
          }
          break
        default: res.write(`<h2>Unknown command ${cmd}</h2>`); break
      }
      res.end('</body></html>')
    } else {
      let err, resp;
      [err, resp] = await to(util.promisify(deviceManager.handle.bind(deviceManager))(req, res))
      if (err) {                            // First try handle by device methods
        log.debug(['HTTP', 'Device method handle error: %s'].join(log.separator), err)
        let file = p.resolve(p.dirname(require.main.filename), './tpl' + req.url); // Then check if it is physical file
        [err, resp] = await to(util.promisify(fs.stat)(file))
        if (resp && resp.isFile()) {
          log.debug(['HTTP', 'RES', file].join(log.separator))
          let f, fe;
          [fe, f] = await to(util.promisify(fs.readFile)(file))
          if (f) {
            let ct = {'Content-Type': 'application/octet-stream'}
            switch (p.extname(file)) {
              case '.xml': ct = {'Content-Type': 'text/xml; charset="utf-8"'}; break
              case '.png': ct = {'Content-Type': 'image/png'}; break
              default: log.warn(['HTTP', 'RES', 'Unknown content type for %s'].join(log.separator), p.extname(file)); break
            }
            ct['Content-Length'] = Buffer.byteLength(f)
            res.writeHead(200, ct)
            res.end(f)
          } else {
            log.warn(['HTTP', 'ERR', 'Unable to response file %s', fe].join(log.separator), file)
          }
        } else { // If nothing, give up
          log.warn(['HTTP', 'ERR', 'Unhandled request ' + req.url, 'Error: ' + err].join(log.separator))
          res.writeHead(404)
          res.end()
        }
      } else {
        log.debug(['HTTP', 'RES', resp].join(log.separator))
      }
    }
  })
  http.setTimeout(2000)
  http.listen(config.mgrport, config.mgrip)
 // TODO: Handle keep alive
  let lgs = require('nodejs-websocket').createServer().listen(config.mgwsport, config.mgrip)
  process.on('log', msg => lgs.connections.forEach(c => c.sendText(msg)))
  fs.watch('./deviceTypes', (e, f) => {
  // TODO: Make it more granular. Take into account e-eventType and f-fileName
    deviceManager.invalidate()
  })
}
