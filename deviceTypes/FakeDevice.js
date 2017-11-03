var emitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var log = require('../lib/Utils').log;
module.exports = FakeDevice;
function FakeDevice(devices) {
 if(! (this instanceof FakeDevice)) return new FakeDevice(devices);
 this.devices = devices;
 emitter.call(this);
 
 //create only one device of a fake type
 let id = 'deadbeef-fa11-abad-a555-babefacecafe';
 this.devices.set(id, {
    id: id,
	name: 'Fake Thing',	
	manufacturer: 'Ipsum Domus',
	manufacturerurl: 'http://ipsumdomus.com/',	
	desc: 'Empty fake device which can be used as any device type you want',	 
	model: 'Fake 1.0',	 
	//modelid: '',	 
	//modelurl: '',	 eventually leave empty
	//serialnumber: '',	 
	upc: '884224355040',	 
	type: 'BinaryLight'		 
 });
 
}
inherits(FakeDevice, emitter);