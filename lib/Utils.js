const root = require('path').dirname(require.main.filename);

exports.get = (template, ...params)=>{ 
 let tpl = require(root+'/tpl/'+template);
 return tpl.get.apply(tpl, params);
}

exports.uid = ()=> Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);

exports.fullGuid = ()=>{
 var dt = new Date().getTime();
 var uuid = 'xxxxxxxx-xxxx-xxxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
 	var r = (dt + Math.random()*16)%16 | 0;
 	dt = Math.floor(dt/16);
 	return (c=='x' ? r :(r&0x3|0x8)).toString(16);
 });
 return uuid;
};

exports.checksum = (str)=>{
 return require('crypto')
  .createHash('md5')
  .update(str, 'utf8')
  .digest('hex')
};

exports.to = (promise) => {  
   return promise.then(data => [null, data])
   .catch(err => [err]);
};

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
log.oneLine = false;
var fll = (level, arguments) => [fcd(new Date()), Object.keys(log.levels).filter(key=>log.levels[key] === level), ((new Error().stack).split("at ")[3]).trim().replace(/([A-Z]:)?[\/\\].*[\/\\]/,''), util.format.apply(util,arguments)].join(log.separator);
log.debug = function(){
	if(lvl <= log.levels.DEBUG) {
	 let str = fll(log.levels.DEBUG, arguments);
     if(!str.split(log.separator).some(s=>(log.noLog && log.noLog.includes(s)))) {
      str = log.oneLine?str.replace(/[\n\r\t]|\s\s+/gm,' '):str;
	  console.log(str);
	  process.emit('log', str);
     }
	}
};
log.info = function(){
	if(lvl <= log.levels.INFO){
	 let str = fll(log.levels.INFO, arguments);
     if(!str.split(log.separator).some(s=>(log.noLog && log.noLog.includes(s)))) {
      str = log.oneLine?str.replace(/[\n\r\t]|\s\s+/gm,' '):str;
	  console.log(str);
	  process.emit('log', str);
     }
	}
};
log.warn = function(){
	if(lvl <= log.levels.WARN){
	 let str = fll(log.levels.WARN, arguments);
     str = log.oneLine?str.replace(/[\n\r\t]|\s\s+/gm,' '):str;
	 console.warn(str);
	 process.emit('log', str);
	}
};
log.error = function(){
	if(lvl <= log.levels.ERROR){
	 let str = fll(log.levels.ERROR, arguments);
     str = log.oneLine?str.replace(/[\n\r\t]|\s\s+/gm,' '):str;
	 console.warn(str);
	 process.emit('log', str);
	}
};
log.fatal = function(){	
	if(lvl <= log.levels.FATAL){
	 let str = fll(log.levels.FATAL, arguments);
     str = log.oneLine?str.replace(/[\n\r\t]|\s\s+/gm,' '):str;
	 console.warn(str);
	 process.emit('log', str);
	}
};

exports.httpRequest = (options, data, timeout) => new Promise((resolve, reject)=>{
 let hr = require('http').request(options, res=>{
  let r = [];
  if (timeout) {
    hr.on('socket', socket => {
      socket.setTimeout(timeout)
      socket.on('timeout', () => {
        req.abort()
        log.warn(['HTTP', 'REQ', 'Request: %j data: %s aborted due to timeout'].join(log.separator), options, data)
        reject(new Error('Timeout'))
      })
    })
  }
  res.on('data', (chunk) => r.push(chunk));
  res.on('end', () => {
    let dta = r.join('');
    log.debug(['HTTP','REQUEST','RES','Data: %s'].join(log.separator),dta);
    resolve(dta);
  });
 }).on('error', e=>reject(e)); //TODO: Should we handle on('Timeout')?
 if (data) {
   if (typeof data !== 'string') data = JSON.stringify(data)
   if (!Buffer.isBuffer(data)) data = Buffer.from(data)
   hr.setHeader('Content-Length', data.length)
   hr.write(data)
 }
 hr.end();
 log.debug(['HTTP','REQUEST','REQ','Options: %j Data: %s'].join(log.separator),options, data);
});