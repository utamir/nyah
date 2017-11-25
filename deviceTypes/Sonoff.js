var utils = require('../lib/Utils');
var util = require('util');
var log = utils.log;
var to = utils.to;
var config = require('../config');
var exec = require('child_process').exec;
var dm;
var wsport = 8444;
var hsport = 8443;
module.exports = Sonoff;
function Sonoff(deviceManager) {
 if(!(this instanceof Sonoff)) return new Sonoff(deviceManager);
 dm = deviceManager;

 initServer();
}

var apiKey = '11111111-1111-1111-1111-11';
var initServer = function(){
 log.info(['SONOFF','HTTPS','Starting HTTPS server'].join(log.separator));
 require('https').createServer({
  key: config.sslkey,
  cert: config.sslcert
 }, (req, res)=>{
  if(req.url == '/dispatch/device'){
   let body = [];
   req.on('data', chunk => body.push(chunk)).on('end', ()=> {
    body = JSON.parse(body.join(''));
    log.debug(['SONOFF', 'HTTPS', 'REQ', req.method, req.url, '%j'].join(log.separator),body);    
    let data = JSON.stringify({
     "error": 0,
     "reason": "ok",
     "IP": config.uapip,
     "port": wsport
    });
    res.writeHead(200,{
     'Content-Type': 'application/json',
     'Content-Length': Buffer.byteLength(data)
    });
    res.end(data);
    log.debug(['SONOFF', 'HTTPS', 'RES', '%s'].join(log.separator),data);    
   });      
  } else {
   log.error(['SONOFF','HTTPS','REQ','Unknown request %s'].join(log.separator),req.url);
   res.writeHead(404);
   res.end();
  }
 }).on('error', e=>log.error(['SONOFF','HTTPS',e].join(log.separator))).listen(hsport,config.uapip);
 
 log.info(['SONOFF','WS','Starting WS server'].join(log.separator));
 require("nodejs-websocket").createServer({
  secure : true,
  key: config.sslkey,
  cert: config.sslcert,
 },function (conn) {
  let cid = conn.socket.remoteAddress+':'+conn.socket.remotePort;
  log.debug(['SONOFF','WS','REQ', cid].join(log.separator));
  dm.on('action',e=>{
   let target = handleAction(e,cid); 
   if(target){
    let seqid = Math.floor(new Date() / 1000).toString();
    let res = {
     "apikey" : apiKey + target.deviceid,
     "action" : 'update',
     "deviceid" : target.deviceid,
     "sequence" : seqid,
     "params" : {'switch' : (target.Target?'on':'off')}
    };
    var r = JSON.stringify(res);
	conn.sendText(r);
    log.debug(['SONOFF','WS','REQ',r].join(log.separator));
   }
  });
  conn.on("text", function (str) {
   try {
    var data = JSON.parse(str);
    let res = handleWSRequest(data, cid);
    conn.sendText(JSON.stringify(res));
   } catch(e){
    log.error(['SONOFF','WS', 'ERR', e].join(log.separator));
   }
  });
  conn.on("close", function (code, reason) {
   log.info(['SONOFF','WS','OFFLINE',`Connection to ${cid} was closed`,code, reason].join(log.separator));
   for(let d of dm.devices.values()){
    if(d.cid == cid){
     //dm.emit('deviceRemoved',{id: d.id});
     d.cid = null;
     break;
    }
   }
  });
  conn.on("error", err=>log.error(['SONOFF','WS',err].join(log.separator)));
}).listen(wsport,config.uapip);
}
var handleAction = function(e,cid){
 log.info(['SONOFF','ACTION',e.action,'%j'].join(log.separator),e.args);
 let target = dm.devices.get(e.id);
 if(target && target.cid == cid) {
  let oper = [];
  switch (e.action){
   case 'GetStatus':
    oper.push ({
     key: 'ResultStatus',
     value: target.Status || false
    });
   break;
   case 'GetTarget':
    oper.push ({
     key: 'RetTargetValue',
     value: target.Target || false
    });
   break;
   case 'SetTarget':
    target.Target = e.args['newTargetValue'] == true;    
   break;
   default: log.warn(['SONOFF','ACTION',`Unknown action ${e.action}`].join(log.separator)); break;
  }
  let evt = `action-${e.eid}`;
  let eargs = {
   id: e.id,
   response: oper,
   action: e.action
  };
  dm.emit(evt, eargs);
  return target;
 } else {
  return;
 }
}

var handleWSRequest = function(data, cid){
 let res = {
  "error" : 0,
  "deviceid" : data.deviceid,
  "apikey" : apiKey + data.deviceid
 };
 log.debug(['SONOFF','WS','REQ','%s','%j'].join(log.separator),data.action?data.action.toUpperCase():'SEQ',data);
 let id; 
 if(data.action) {
  switch(data.action){
   case 'date': 
	res.date = new Date().toISOString();
   break;
   case 'register':
    let device = {
     deviceid: data.deviceid,
     version: data.romVersion,
     model: data.model,
     cid: cid,
     apikey: data.apikey     
    };
    initializeDevice(device);
   break;
   case 'update': 
    //device wants to update its state    
    id = apiKey + data.deviceid;
    var target = dm.devices.get(id);
    target.Status = (data.params.switch == 'on');
    //sync on target status
    target.Target = target.Status;
    dm.emit('deviceEvent',{
     id: id,
     key: 'Status',
     value: target.Status
    });
    if(!target.cid) { 
     log.warn(['SONOFF','WS','REQ','UPDATE', 'No sid found for %j. Associating cid: %s'].join(log.separator),target,cid);
     target.cid = cid;
    }
   break;
   case 'query':
    id = apiKey + data.deviceid;
    var target = dm.devices.get(id);
    res.params = {};
    data.params.forEach(p=>{
     res.params[p] = target[p];
    });
    if(!target.cid) { 
     log.warn(['SONOFF','WS','REQ','QUERY','No sid found for %j. Associating cid: %s'].join(log.separator),target,cid);
     target.cid = cid;
    }
   break;
   default:
    log.warn(['SONOFF','WS','Unknown request: %j'].join(log.separator),data);
   break;
  }
 } else {
  //TODO: Actually we have to listen to "sequence" respose for command execution, but in reality, it is not required due to SSDP spec
  id = apiKey + data.deviceid;
  var target = dm.devices.get(id);
  if(!target.cid) { 
   log.warn(['SONOFF','WS','REQ','SEQUENCE','No sid found for %j. Associating cid: %s'].join(log.separator),target,cid);
   target.cid = cid;
  }
  //TODO: Here we just assing requested value to the actual
  
  target.Status = target.Target;
  dm.emit('deviceEvent',{
   id: id,
   key: 'Status',
   value: target.Status
  });
 }
 log.debug(['SONOFF','WS','RES','%j'].join(log.separator),res); 
 return res;
}

var initializeDevice = function(device){
 let id = apiKey + device.deviceid;
 if(!dm.devices.get(id)) {
  device.id = id;
  let type = device.deviceid.substr(0, 2);
  if(type == '10') device.kind = 'switch';
  else if(type == '20') device.kind = 'light';
  else if(type == '30') device.kind = 'sensor'; //temperature and humidity. No timers here;
  device.name = `Sonoff ${device.kind}`;
  device.manufacturer = 'Sonoff';
  device.manufacturerurl = 'https://www.itead.cc';
  device.desc = 'Sonoff wifi smart home device';
  //device model is already in place
  device.type = 'BinaryLight'; //TODO: Replace by decent device type based on type/model rather then binary switch
  device.serialnumber = device.deviceid;
  dm.devices.set(device.id, device);
  dm.emit('deviceAdded',{id: device.id});
  log.info(['SONOFF','SETUP','UpNP device %s is initialized'].join(log.separator),id);
 } else {
  log.info(['SONOFF','SETUP','UpNP device %s is already initialized'].join(log.separator),id);
 }
}

Sonoff.prototype.Add = async function() {
 let wlan = require('../lib/piwlan')(config.wlan);
 let ap = await wlan.scan();
 let apNet = ap.find(n => n.ssid.startsWith('ITEAD-1000'));
 if (!apNet) {
  this.pairCount = this.pairCount || 0;
  log.info(['SONOFF','SETUP','No devices are not in pairing mode. Please, Long press until led start blinking fast.'].join(log.separator));
  if(this.pairCount++ < 20) {
   setTimeout(() => this.Add(), 1000);
  } else {
   log.warn(['SONOFF','SETUP','Gave up of pairing'].join(log.separator));
   this.pairCount = 0;
   return;
  }
 } else {
   log.info(['SONOFF','SETUP','Device is found in pairing mode.'].join(log.separator));
   apNet.pwd = '12345678';
   let conn = await wlan.connect(apNet, false);
   
   log.info(['SONOFF','SETUP','Starting configuration.'].join(log.separator));
   let sip = '10.10.7.2';
   let setip = `sudo ifconfig ${config.wlan} ${sip}`;
   let err, res;
   res = await util.promisify(exec)(setip);
   [err, res] = await to(utils.httpRequest({
    hostname: '10.10.7.1',
    port: 80,
    path: '/device',
    method: 'GET',
    localAddress: sip
   }));
   if(err) {
    log.error(['SONOFF','SETUP','The device is unable to complete setup due to %s'].join(log.separator),err);
    return;
   }
   res = JSON.parse(res);
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
	"version": 4,
	"ssid": config.ap.ssid,
	"password": config.ap.pwd,
	"serverName": config.uapip,
	"port": hsport
   }));
   if(err) {
    log.error(['SONOFF','SETUP','The device is unable to complete setup due to %s'].join(log.separator),err);
   }
   conn = await wlan.disconnect(apNet, true);
   setip = `sudo ip addr flush dev ${config.wlan}`;
   res = await util.promisify(exec)(setip);
   
   //initializeDevice(device);   
   
   log.info(['SONOFF','SETUP','The device %j setup is completed'].join(log.separator),device);
   return;
 }
 
 
}