#!/usr/bin/env node
'use strict';
var utils = require('./lib/Utils');
var log = utils.log;
var fs = require('fs');

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

 var deviceManager = require('./lib/DeviceManager')('./devices', `http://${config.mgrip}:${config.mgrport}`);
 require("http").createServer(function(req,res){
  log.debug(['HTTP','REQ',req.url].join(log.separator));
  if(req.url == '/logs') {
   res.writeHead(200,{"Content-Type": "text/html; charset=utf-8"});
   res.end(tpl('log',{ip: config.mgrip, port: config.mgwsport}));
  } else {
   if(!deviceManager.handle(req,res)) { //First try handle by device methods
    let file = './tpl'+req.url; 		//Then check if it is physical file
	let fstat = null;
	try {
	 fstat = fs.statSync(file);
	} catch (e) {}
    if(fstat && fstat.isFile()){
	 log.debug(['HTTP','RES',file].join(log.separator));
     fs.createReadStream(file).pipe(res);
    } else {							//If nothing, give up
     log.debug(['HTTP','ERR', 'Unhandled request ' + req.url].join(log.separator));
     res.writeHead(404);
	 res.end();
	}
   }
  }
 }).listen(config.mgrport, config.mgrip);
 //TODO: Handle keep alive
 let lgs = require("nodejs-websocket").createServer().listen(config.mgwsport, config.mgrip);
 process.on('log',msg=>lgs.connections.forEach(c=>c.sendText(msg)));
 fs.watch('./devices', (e, f) => {
  //TODO: Make it more granular. Take into account e-eventType and f-fileName
  deviceManager.invalidate();
 });
 
 let ssdp = require('./lib/UPnP').ssdp;
 let onUdpMessage = function(msg, sender){
  let res = ssdp.decode(msg);
  log.debug(['UDP','MULTI','%j', '%o'].join(log.separator),sender,res);
  if(res['m-search']){
   deviceManager.search(res['st'],sender);
  } else if(res['notify']){
   //TODO: Should i handle notify here?
   log.info('Notify - replace %s',res);
   //deviceManager.notify();
  } else {
   log.debug(['UDP','MULTI', 'Unknown request %s',res].join(log.separator));
  }
 }
 let udp = require('dgram').createSocket({
  type: "udp4",
  reuseAddr: true
 }, onUdpMessage).bind(ssdp.port, ()=>{
  udp.setMulticastTTL(ssdp.ttl);
  udp.setBroadcast(true);
  udp.setMulticastInterface(config.mgrip);
  udp.addMembership(ssdp.address, config.mgrip);
  udp.setMulticastLoopback(true);
 });
 


//}
