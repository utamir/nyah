#!/usr/bin/env node
'use strict';
var utils = require('./lib/Utils');
var log = utils.log;
var to = utils.to;
var fs = require('fs');
var util = require('util');

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

 var deviceManager = require('./lib/DeviceManager')('./deviceTypes', `http://${config.mgrip}:${config.mgrport}`);
 require("http").createServer(async function(req,res){
  log.debug(['HTTP','REQ',req.url].join(log.separator));
  if(req.url == '/logs') {
   res.writeHead(200,{"Content-Type": "text/html; charset=utf-8"});
   res.end(tpl('log',{ip: config.mgrip, port: config.mgwsport}));
  } else {
   let err, resp;
   [err, resp] = await to(util.promisify(deviceManager.handle.bind(deviceManager))(req,res));
   if(err) {                            //First try handle by device methods
    log.debug(['HTTP','Device method handle error: %s'].join(log.separator),err);
    let file = './tpl'+req.url; 		//Then check if it is physical file
    [err, resp] = await to(util.promisify(fs.stat)(file));
	if(resp && resp.isFile()){
	 log.debug(['HTTP','RES',file].join(log.separator));
     fs.createReadStream(file).pipe(res);
    } else {							//If nothing, give up
     log.debug(['HTTP','ERR', 'Unhandled request ' + req.url, 'Error: '+err].join(log.separator));
     res.writeHead(404);
	 res.end();
	}
   } else {
    log.debug(['HTTP','RES',resp].join(log.separator));
   }
  }
 }).listen(config.mgrport, config.mgrip);
 //TODO: Handle keep alive
 let lgs = require("nodejs-websocket").createServer().listen(config.mgwsport, config.mgrip);
 process.on('log',msg=>lgs.connections.forEach(c=>c.sendText(msg)));
 fs.watch('./deviceTypes', (e, f) => {
  //TODO: Make it more granular. Take into account e-eventType and f-fileName
  deviceManager.invalidate();
 });
 


//}
