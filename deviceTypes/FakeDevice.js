var emitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var log = require('../lib/Utils').log;
module.exports = FakeDevice;
function FakeDevice(devices) {
 if(! (this instanceof FakeDevice)) return new FakeDevice(devices);
 this.devices = devices;
 emitter.call(this);
 
 //create only devices of a fake type
 this.devices.set('deadbeef-fa11-abad-a555-babefacecafe', {
    id: 'deadbeef-fa11-abad-a555-babefacecafe',
	name: 'Fake Binary Lights',	
	manufacturer: 'Ipsum Domus',
	manufacturerurl: 'http://ipsumdomus.com/',	
	desc: 'Fake virtual binary light device which can be used as test for the suite',	 
	model: 'Fake Light 1.0',	 
	//modelid: '',	 
	//modelurl: '',	 eventually leave empty
	//serialnumber: '',	 
	upc: '884224355040',	 
	type: 'BinaryLight'		 
 });
 
 this.devices.set('deadbeef-fa11-abad-a555-facecafebabe', {
    id: 'deadbeef-fa11-abad-a555-facecafebabe',
	name: 'Fake Basic Device',	
	manufacturer: 'Ipsum Domus',
	manufacturerurl: 'http://ipsumdomus.com/',	
	desc: 'Fake virtual basic device which can be used as test for the suite',	 
	model: 'Fake Device 1.0',	 
	//modelid: '',	 
	//modelurl: '',	 eventually leave empty
	//serialnumber: '',	 
	upc: '884224355041',	 
	type: 'Basic'		 
 });
 
}
inherits(FakeDevice, emitter);