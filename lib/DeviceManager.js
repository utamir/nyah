var emitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var utils = require('../lib/Utils');
var log = utils.log;
var tpl = utils.get;
var ssdp = require('../lib/UPnP').ssdp;
var config = require('../config');
module.exports = DeviceManager;
function DeviceManager(path, baseurl) {
 if(! (this instanceof DeviceManager)) return new DeviceManager(path, baseurl);
 emitter.call(this);
 let p = require('path');
 this.path = p.resolve(p.dirname(require.main.filename),path);
 this.baseurl = baseurl;
 this.devices = new Map();
 this.on('deviceEvent',e=>ssdp.notify(this.devices.get(e.id),e));
 log.info('Device manager is loaded on %s',this.path);
 this.invalidate();
}
inherits(DeviceManager, emitter);

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
};

var initDeviceSsdp = function(device, descriptor){
    let isNew = (device.template == null);
    let isUpdate = (device.template != descriptor);
    device.template = descriptor;
    let ip = config.mgrip;
    device.descUrl = `http://${config.mgrip}:${config.mgrport}/${device.id}.xml`;
    if(config.separateInterfaces){
       ip = require('../lib/Utils').getNextIp(config.lan); 
    }
    log.info(['UDP','UNI','Creating socket for device %s(%s) on %s'].join(log.separator),device.name, device.id,ip);
    device.socket = device.socket || require('dgram').createSocket({
     type: "udp4",
     reuseAddr: true
    },(msg,sender)=>{
     let res = ssdp.decode(msg);     
     if(res['m-search']){
      let target = res['st'];
      log.debug(['SSDP', 'SEARCH', 'Target : %s'].join(log.separator),target);
      ssdp.reply(device, target, sender);
     } else if(res['notify']){
     //TODO: Should i handle notify here?
      log.info('Notify - replace %s',res);
      //deviceManager.notify();
     } else {
      log.debug(['UDP','MULTI', 'Unknown request %s',res].join(log.separator));
     }
    }).bind(ssdp.port,()=>{        
     device.socket.setMulticastTTL(ssdp.ttl);
     device.socket.setBroadcast(true);
     device.socket.setMulticastInterface(ip);
     device.socket.addMembership(ssdp.address, ip);
     device.socket.setMulticastLoopback(false); 

    if(isNew){
     device.bid = device.bid || 1;
     device.cid = device.cid || 1;
     device.alive = setInterval(()=>ssdp.alive(device),ssdp.aliveTick);
     ssdp.alive(device);
    } else if(isUpdated){
     device.socket.send(ssdp.update(device),ssdp.port, ssdp.address);
     log.debug(['UDP','SSDP','UPDATE','%s(%s)'].join(log.separator),device.name, device.id);
    }     
    });
    
}
DeviceManager.prototype.invalidate = function(){
 log.info('Reloading devices');
 require('fs').readdirSync(this.path).forEach(e=>{
  //try{
   //TODO: Load different pluging, not only node ones
   require([this.path,e].join('/'))(this);
   for(let [id, dev] of this.devices){
    let def = Object.assign({},defaultDescriptor);
    dev = Object.assign(def,dev);
    let desc = null;
    if(typeof dev.type === 'string'){
     //simple type
     desc = tpl(dev.type, dev, this.baseurl);
    }
    //check if new device, if new, send alive
    initDeviceSsdp(dev, desc);
    this.devices.set(id, dev);
   };
   //} catch(e) { }
 });
 log.debug('Devices %o',this.devices);
}

DeviceManager.prototype.handle = function(req, res, callback){
 for(let [id,device] of this.devices){
  switch(req.url){
   case `/${id}.xml`:
    res.writeHead(200,{
     'Content-Type': 'text/xml; charset=utf-8',
     'Content-Length': Buffer.byteLength(device.template)});
	res.end(device.template);
	log.debug(['HTTP','RES',req.url,device.template.replace(/[\n\r]/g, '')].join(log.separator));
	callback(null,device.template);
    return;
   break;
   case `/${id}/control`:
    //standard control url
    let action = null;
    for(let h in req.headers){
     if(h.toUpperCase() == 'SOAPACTION') {
      action = req.headers[h];
      break;
     }
    }
    if(action) {
     let body = [];
     req.on('data', c=>body.push(c)).on('end',()=>{ 
      body = Buffer.concat(body).toString();      
      log.debug(['HTTP','ACTION',action, body].join(log.separator));
      let c = ssdp.getAction(body, action);
      let args = ssdp.getActionArgs(body);
      if(c){
       let eid = utils.uid();
       this.once('action-'+eid,e=>{
         let r = tpl('actionResponse', e.action,action.replace('#'+e.action,''),e.response.map(a=>`<${a.key}>${a.value}</${a.key}>`).join(''));
         res.writeHead(200,{
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(r),
          'SERVER': ssdp.server});
         res.end(r);
         callback(null,r);
         this.handled = null;
         return;
       })
       this.emit('action', {
        id: device.id,
        action: c,
        args: args,
        eid: eid
       });
       this.handled = true;
      } else {
       let r = tpl('actionError', '402','Required action is not matching request body');
       res.writeHead(500,{
        'Content-Type': 'text/xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(r),
        'SERVER': ssdp.server});
       res.end(r);
       callback(null,r);
       return;
      }
     });   
    } else {
     log.error(['HTTP','ACTION','Invalid SOAP action'].join(log.separator));
     let r = tpl('actionError', '401','No action by that name at this service.');
     res.writeHead(500,{
      'Content-Type': 'text/xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(r),
      'SERVER': ssdp.server});
     res.end(r);
     callback(null,r);
     return;
    }
   break;
   case `/${id}/event`:
   //standard subscribe url
   let cb, isSub, sid, timeout, rcode, rstatus;
    for(let h in req.headers){
    if(h.toUpperCase() == 'CALLBACK') {
     cb = req.headers[h];
    } else if(h.toUpperCase() == 'NT') {
     isSub = (req.headers[h] == 'upnp:event');
    } else if(h.toUpperCase() == 'SID') {
     sid = req.headers[h];
    } else if(h.toUpperCase() == 'TIMEOUT') {
     timeout = req.headers[h];
    }
    if(timeout == 'infinite') timeout = null; //infinite is depricated
    timeout = timeout || ssdp.subDuraction; //handle nil
    timeout = timeout.toString().replace('Second-','');//handle arrived
   }
   if(req.method == 'SUBSCRIBE'){    
    if(sid & (cb | isSub)){
	 rcode = 400;
     rstatus = 'An SID header field and one of NT or CALLBACK header fields are present.';
    } else if (!sid & !(cb | isSub)) {
	 rcode = 412;
     rstatus = 'An SID does not correspond to a known, un-expired subscription or the SID header field is missing or empty.'; 
	} else if(!sid & isSub){
     device.subscribers = device.subscribers || [];
     sid = 'uuid:'+utils.fullGuid();     
     device.subscribers.push({
      id: sid,
	  url: cb.substr(1).slice(0, -1),
      created: new Date(),
      timeout: timeout
     });
     log.info(['HTTP', 'SUBSCRIBE','CREATE', 'Target: %s (%s)'].join(log.separator),cb, sid);
    } else if(sid) {
	 var idx = device.subscribers.findIndex(s=>s.id == sid);
	 if(idx < 0){
      rcode = 412;
      rstatus = 'An SID does not correspond to a known, un-expired subscription or the SID header field is missing or empty.'; 
     }else{
      device.subscribers[idx].created = new Date();
      device.subscribers[idx].timeout = timeout;
	  log.info(['HTTP', 'SUBSCRIBE','RENEW', 'Target: (%s)'].join(log.separator), sid);	      
     }
    }
    res.writeHead(rcode || 200,{
     'Content-Type': 'text/xml; charset="utf-8"',
     'DATE': new Date().toUTCString(),
     'SERVER': ssdp.server,
     'SID': sid,
     'TIMEOUT': 'Second-'+timeout
    });
    res.end();
    callback(null,rstatus || sid);
    return;
   } else if(req.method == 'UNSUBSCRIBE') {
    if(sid & (cb || isSub)){
     rcode = 400;
     rstatus = 'An SID header field and one of NT or CALLBACK header fields are present.';
    } else if(!sid) {
     rcode = 412;
     rstatus = 'An SID does not correspond to a known, un-expired subscription or the SID header field is missing or empty.'; 
    } else {
     var idx = device.subscribers.findIndex(s=>s.id == sid);
     if(idx < 0){
      rcode = 412;
	  log.warn(['HTTP','UNSUBSCRIBE','Subscription %s not found'].join(log.separator),sid);	
      rstatus = 'An SID does not correspond to a known, un-expired subscription or the SID header field is missing or empty.'; 
     } else {
      device.subscribers.splice(idx,1);
      log.info(['HTTP','UNSUBSCRIBE','Delete %s for device'].join(log.separator), sid, device.id);	
     }
    }
    res.writeHead(rcode || 200);
    res.end();
    callback(null,rstatus || sid);
    return;
   } else {
    callback(new Error('Wrong UPnP Eventing'));
    return;
   }
   break;
  }
 }
 if(!this.handled) callback(new Error('No HTTP handlers found for this request '+req.url));
}