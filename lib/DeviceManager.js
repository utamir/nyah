var emitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var log = require('../lib/Utils').log;
var tpl = require('../lib/Utils').get;
let ssdp = require('../lib/UPnP').ssdp;
var config = require('../config');
module.exports = DeviceManager;
function DeviceManager(path, baseurl) {
 if(! (this instanceof DeviceManager)) return new DeviceManager(path, baseurl);
 emitter.call(this);
 let p = require('path');
 this.path = p.resolve(p.dirname(require.main.filename),path);
 this.baseurl = baseurl;
 this.devices = new Map();
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
    }).bind({ 
    address: ip},()=>{
     device.socket.setMulticastTTL(ssdp.ttl);
     device.socket.setBroadcast(true);
     device.socket.setMulticastInterface(ip);
     device.socket.addMembership(ssdp.address, ip);
     device.socket.setMulticastLoopback(true);
    });
    if(isNew){
     device.bid = device.bid || 1;
     device.cid = device.cid || 1;
     //device.alive = setInterval(()=>ssdp.alive(device),ssdp.aliveTick);
     ssdp.alive(device);
    } else if(isUpdated){
     device.socket.send(ssdp.update(device),ssdp.port, ssdp.address);
     log.debug(['UDP','SSDP','UPDATE','%s(%s)'].join(log.separator),device.name, device.id);
    }
}
DeviceManager.prototype.invalidate = function(){
 log.info('Reloading devices');
 require('fs').readdirSync(this.path).forEach(e=>{
  try{
   //TODO: Load different pluging, not only node ones
   require([this.path,e].join('/'))(this.devices);
   for(let [id, dev] of this.devices){
    dev = Object.assign(defaultDescriptor,dev);
    let desc = null;
    if(typeof dev.type === 'string'){
     //simple type
     desc = tpl(dev.type, dev, this.baseurl);
    }
    //check if new device, if new, send alive
    initDeviceSsdp(dev, desc);
    this.devices.set(id, dev);
   };
   } catch(e) { }
 });
 log.debug('Devices %o',this.devices);
}

DeviceManager.prototype.handle = function(req,res){
 for(let [id,device] of this.devices){
  switch(req.url){
   case `/${id}.xml`:
    res.writeHead(200,{"Content-Type": "text/xml; charset=utf-8"});
	res.end(device.template);
	log.debug(['HTTP','RES',req.url,device.template.replace(/[\n\r]/g, '')].join(log.separator));
	return device.template;
	break;
  }
 }
 return;
}

DeviceManager.prototype.search = function(target, sender){
 log.debug(['SSDP', 'SEARCH', 'Target : %s'].join(log.separator),target);
 for(let device of this.devices.values()){
  ssdp.reply(device, target, sender);
 }
}