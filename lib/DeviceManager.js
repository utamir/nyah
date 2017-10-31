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
   r = require([this.path,e].join('/'))();
   r.descriptor = Object.assign(defaultDescriptor,r.descriptor);
   if(typeof r.descriptor.type === 'string'){
    //simple type
	r.template = tpl(r.descriptor.type, r.descriptor, this.baseurl);
   }
	return r;
   } catch(e) { }
 },[]);
 log.debug('Devices %o',this.devices);
}