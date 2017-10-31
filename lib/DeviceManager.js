var emitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var log = require('../lib/Utils').log;
var tpl = require('../lib/Utils').get;
module.exports = DeviceManager;
function DeviceManager(path, baseurl) {
 if(! (this instanceof DeviceManager)) return new DeviceManager(path, baseurl);
 emitter.call(this);
 let p = require('path');
 this.path = p.resolve(p.dirname(require.main.filename),path);
 this.baseurl = baseurl;
 this.devices = []
 log.info('Device manager is loaded on %s',this.path);
 this.invalidate();
}
inherits(DeviceManager, emitter);

var defaultDescriptor = {
	id: '',
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

DeviceManager.prototype.invalidate = function(){
 log.info('Reloading devices');
 this.devices = require('fs').readdirSync(this.path).reduce((r,e)=>{
  try{
   //TODO: Load different pluging, not only node ones
   let d = require([this.path,e].join('/'))();
   d.descriptor = Object.assign(defaultDescriptor,d.descriptor);
   //copy some main properties
   d.id = d.descriptor.id;
   d.name = d.descriptor.name;
   if(typeof d.descriptor.type === 'string'){
    //simple type
	d.template = tpl(d.descriptor.type, d.descriptor, this.baseurl);
   }
   r.push(d);
   return r;
   } catch(e) { }
 },[]);
 log.debug('Devices %j',this.devices);
}

DeviceManager.prototype.handle = function(req,res){
 for(let device of this.devices){
  switch(req.url){
   case `/${device.id}.xml`:
    res.writeHead(200,{"Content-Type": "text/xml; charset=utf-8"});
	res.end(device.template);
	log.debug(['HTTP','RES',req.url,device.template.replace(/[\n\r]/g, '')].join(log.separator));
	return device.template;
	break;
  }
 }
 return;
}