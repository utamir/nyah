#!/usr/bin/env node
'use strict';
var utils = require('./lib/Utils');
var log = utils.log;
log.setLevel(log.levels.INFO);
 
/*process.on('uncaughtException', function(err) {
 log.debug("uncaughtException");
 log.error(err.stack);
 process.exit();
});

const cluster = require('cluster');
if (cluster.isMaster) {
 cluster.fork();
 
 cluster.on('exit', function(worker, code, signal) {
  cluster.fork();
 });
}

if (cluster.isWorker) {*/
 var config = require('./config');
 log.info('Initializing NYAH on %s:%s',config.mgrip, config.mgrport);
 var tpl = utils.get;

 require("http").createServer(function(req,res){
  if(req.url == '/logs') {
   res.writeHead(200,{"Content-Type": "text/html; charset=utf-8"});
   res.end(tpl('log',{ip: config.mgrip, port: config.mgwsport}));
  }
 }).listen(config.mgrport, config.mgrip);
 //TODO: Handle keep alive
 let lgs = require("nodejs-websocket").createServer().listen(config.mgwsport, config.mgrip);
 process.on('log',msg=>lgs.connections.forEach(c=>c.sendText(msg)));
 var deviceManager = require('./lib/DeviceManager')('./devices', `http://${config.mgrip}:${config.mgrport}`);
 require('fs').watch('./devices', (e, f) => {
  //TODO: Make it more granular. Take into account e-eventType and f-fileName
  deviceManager.invalidate();
 });
//}
