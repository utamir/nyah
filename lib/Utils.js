const root = require('path').dirname(require.main.filename);

exports.get = (template, ...params)=>{ 
 let tpl = require(root+'/tpl/'+template);
 return tpl.get.apply(tpl, params);
}

exports.uid = ()=> Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);

var fcd = (date) => {
    let hour = date.getHours();
    let minutes = date.getMinutes();
    let seconds = date.getSeconds();
    let milliseconds = date.getMilliseconds();

    return '' +
           ((hour < 10) ? '0' + hour: hour) +
           ':' +
           ((minutes < 10) ? '0' + minutes: minutes) +
           ':' +
           ((seconds < 10) ? '0' + seconds: seconds) +
           '.' +
           ('00' + milliseconds).slice(-3) +
           '';
};
const util = require('util');
var lvl = 0;
var log = exports.log = {};
log.levels = {
	ALL : 0,
	DEBUG : 1,
	INFO : 2,
	WARN : 3,
	ERROR : 4,
	FATAL : 5,
	OFF : 6
};
log.separator = ' | ';
log.setLevel = function(level){
	lvl = level;
}
var fll = (level, arguments) => [fcd(new Date()), Object.keys(log.levels).filter(key=>log.levels[key] === level), ((new Error().stack).split("at ")[3]).trim().replace(/([A-Z]:)?[\/\\].*[\/\\]/,''), util.format.apply(util,arguments)].join(log.separator);
log.debug = function(){
	if(lvl >= log.levels.DEBUG) {
	 let str = fll(log.levels.DEBUG, arguments);
	 console.log(str);
	 process.emit('log', str);
	}
};
log.info = function(){
	if(lvl >= log.levels.INFO){
	 let str = fll(log.levels.INFO, arguments);
	 console.log(str);
	 process.emit('log', str);
	}
};
log.warn = function(){
	if(lvl >= log.levels.WARN){
	 let str = fll(log.levels.WARN, arguments);
	 console.warn(str);
	 process.emit('log', str);
	}
};
log.error = function(){
	if(lvl >= log.levels.ERROR){
	 let str = fll(log.levels.ERROR, arguments);
	 console.warn(str);
	 process.emit('log', str);
	}
};
log.fatal = function(){	
	if(lvl >= log.levels.FATAL){
	 let str = fll(log.levels.FATAL, arguments);
	 console.warn(str);
	 process.emit('log', str);
	}
};