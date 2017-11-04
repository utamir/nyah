var os = require('os');
var util = require('util');
var url = require('url');
var http = require('http');
var log = require('../lib/Utils').log;
var server = os.platform()+ '/' + (os.release() || 1.0) + ' UPnP/1.1 NYAH/1.0'
var ssdp = exports.ssdp = {};
ssdp.port = 1900;
ssdp.ttl = 2;
ssdp.address = '239.255.255.250';
ssdp.aliveTick = 1*60*1000;
ssdp.server = server;
ssdp.subDuraction = 7200; //>1800 (30min)

ssdp.decode = (msg) => msg.toString('utf-8').trim().split('\r\n').reduce((r,e)=>{
 let m = /([A-Za-z-\.]+):?\s?(.*)/.exec(e);
 r[m[1].toLowerCase()] = m[2];
 return r;
},[]);

ssdp.getAction = (env,action)=>{   
  let m = /<u:(\w+).+u="(.+)"/.exec(env);
  if(action == `"${m[2]}#${m[1]}"`){
   return m[1];
  } else {
   log.error(['SSDP', 'Requested action %s is not matching the request %s'].join(log.separator),action, env);
  }
  return;
};

ssdp.getActionArgs = (env)=>{
 let rx = /<([a-zA-Z]+)>(\w+|\d+)/gm;
 let res = {};
 while((arg = rx.exec(env)) !== null){
  res[arg[1]] = arg[2];
 }
 return res;
};

ssdp.alive = async (device) => {
 let body = (nt,usn)=>[
 `NOTIFY * HTTP/1.1`,
 `HOST: ${ssdp.address}:${ssdp.port}`,
 `CACHE-CONTROL: max-age=${ssdp.aliveTick / 500}`,
 `LOCATION: ${device.descUrl}`,
 `NT: ${nt}`,
 `NTS: ssdp:alive`,
 `SERVER: ${server}`,
 `USN: ${usn}`,
 `BOOTID.UPNP.ORG: ${device.bid}`,
 `CONFIGID.UPNP.ORG: ${device.cid}`,
 `SEARCHPORT.UPNP.ORG: ${device.socket.address().port}`
 ].join('\r\n')+'\r\n\r\n';
 
 let send = (nt,usn) =>new Promise((resolve, reject)=>setTimeout(()=> { 
  log.debug(['UDP','SSDP','ALIVE','%s(%s)','NT: %s, USN: %s'].join(log.separator),device.name, device.id, nt, usn);
  let msg = body(nt,usn);
  log.debug(['UDP','SSDP','ALIVE','%s'].join(log.separator),msg);
  msg = Buffer.from(msg,'utf-8');
  device.socket.send(msg, 0, msg.length, ssdp.port, ssdp.address, e=>{
   if(e)reject(e);
   else resolve();
  });
 },Math.floor(Math.random() * 100)));
 
 let urn = /<deviceType>(.+)</g.exec(device.template);
 device.urn = urn[1];
 let udn = /<UDN>(.+)</g.exec(device.template);
 device.udn = udn[1];
 await send('upnp:rootdevice',device.udn+'::upnp:rootdevice');
 await send(device.udn,device.udn);
 await send(device.urn,device.udn+'::'+device.urn);
 
 let sRx = /<serviceType>(.+)</g;
 while((urn = sRx.exec(device.template)) !== null){
  device.surn = device.surn || [];
  device.surn.push(urn[1]);
  await send(urn[1],device.udn+'::'+urn[1]);
 }
};

ssdp.byebye = async (device) => {
 let body = (nt,usn)=>[
 `NOTIFY * HTTP/1.1`,
 `HOST: ${ssdp.address}:${ssdp.port}`,
 `NT: ${nt}`,
 `NTS: ssdp:byebye`,
 `USN: ${usn}`,
 `BOOTID.UPNP.ORG: ${device.bid}`,
 `CONFIGID.UPNP.ORG: ${device.cid}`
 ].join('\r\n')+'\r\n\r\n';
 
 let send = (nt,usn) =>new Promise((resolve, reject)=>setTimeout(()=> { 
  log.debug(['UDP','SSDP','BYEBYE','%s(%s)','NT: %s, USN: %s'].join(log.separator),device.name, device.id, nt, usn);
  let msg = body(nt,usn);
  log.debug(['UDP','SSDP','BYEBYE','%s'].join(log.separator),msg);
  msg = Buffer.from(msg,'utf-8');
  device.socket.send(msg, 0, msg.length, ssdp.port, ssdp.address, e=>{
   if(e)reject(e);
   else resolve();
  });
 },Math.floor(Math.random() * 100)));
 
 await send('upnp:rootdevice',device.udn+'::upnp:rootdevice');
 await send(device.udn,device.udn);
 await send(device.urn,device.udn+'::'+device.urn);
 
 if(device.surn) {
  for(let urn of device.surn) await send(urn,device.udn+'::'+urn);
 }
};

ssdp.update = async (device) => {
 let body = (nt,usn)=>[
 `NOTIFY * HTTP/1.1`,
 `HOST: ${ssdp.address}:${ssdp.port}`,
 `LOCATION: ${device.descUrl}`,
 `NT: ${nt}`,
 `NTS: ssdp:update`,
 `USN: ${usn}`,
 `BOOTID.UPNP.ORG: ${device.bid}`,
 `CONFIGID.UPNP.ORG: ${device.cid}`,
 `NEXTBOOTID.UPNP.ORG: ${device.bid++}`,
 `SEARCHPORT.UPNP.ORG: ${device.socket.address().port}`
 ].join('\r\n')+'\r\n\r\n';
 
 let send = (nt,usn) =>new Promise((resolve, reject)=>setTimeout(()=> { 
  log.debug(['UDP','SSDP','UPDATE','%s(%s)','NT: %s, USN: %s'].join(log.separator),device.name, device.id, nt, usn);
  let msg = body(nt,usn);
  log.debug(['UDP','SSDP','UPDATE','%s'].join(log.separator),msg);
  msg = Buffer.from(msg,'utf-8');
  device.socket.send(msg, 0, msg.length, ssdp.port, ssdp.address, e=>{
   if(e)reject(e);
   else resolve();
  });
 },Math.floor(Math.random() * 100)));
 
 let urn = /<deviceType>(.+)</g.exec(device.template);
 device.urn = urn[1];
 let udn = /<UDN>(.+)</g.exec(device.template);
 device.udn = udn[1];
 await send('upnp:rootdevice',device.udn+'::upnp:rootdevice');
 await send(device.udn,device.udn);
 await send(device.urn,device.udn+'::'+device.urn);
 
 let sRx = /<serviceType>(.+)</g;
 while((urn = sRx.exec(device.template)) !== null){
  device.surn = device.surn || [];
  device.surn.push(urn[1]);
  await send(urn[1],device.udn+'::'+urn[1]);
 }
};

ssdp.reply = async (device, target, address) => {
 let body = (st,usn)=>[
 `HTTP/1.1 200 OK`,
 `CACHE-CONTROL: max-age=${ssdp.aliveTick / 500}`,
 `DATE: ${new Date().toUTCString()}`,
 `EXT: `,
 `LOCATION: ${device.descUrl}`,
 `SERVER: ${server}`,
 `ST: ${st}`,
 `USN: ${usn}`,
 `BOOTID.UPNP.ORG: ${device.bid}`,
 `CONFIGID.UPNP.ORG: ${device.cid}`,
 `SEARCHPORT.UPNP.ORG: ${device.socket.address().port}`
 ].join('\r\n')+'\r\n\r\n';
 
 let send = (st,usn) =>new Promise((resolve, reject) => { 
  log.debug(['UDP','SSDP','REPLY','%s:%s','%s(%s)','ST: %s, USN: %s'].join(log.separator),address.address, address.port, device.name, device.id, st, usn);
  let msg = body(st,usn);
  log.debug(['UDP','SSDP','REPLY','%s'].join(log.separator),msg);
  msg = Buffer.from(msg,'utf-8');
  device.socket.send(msg, 0, msg.length, address.port, address.address, e=>{
   if(e)reject(e);
   else resolve();
  });
 });
 
 switch (target.toLowerCase()) {
  case 'ssdp:all': 
   await send('upnp:rootdevice',device.udn+'::upnp:rootdevice');
   await send(device.udn,device.udn);
   await send(device.urn,device.udn+'::'+device.urn);
 
   for(let urn of device.surn) await send(urn,device.udn+'::'+urn);
   break;
  case 'upnp:rootdevice': await send('upnp:rootdevice',device.udn+'::upnp:rootdevice'); break;
  case device.udn.toLowerCase(): await send(device.udn,device.udn); break;
  case device.urn.toLowerCase(): await send(device.urn,device.udn+'::'+device.urn); break;
 }
 if(device.surn && device.surn.some(u=>u.toLowerCase() == target.toLowerCase())){
  await send(target,device.udn+'::'+target);
 }
 
};

ssdp.notify = async (device, event)=>{
 let _notify = async function(sid, target, seq, dta) {		
  var u = url.parse(target);
  var options = {
   hostname: u.hostname,
   port: u.port || 80,
   path: u.path,
   method: 'NOTIFY',
   headers: {
 	'Content-Type': 'text/xml; charset="utf-8"',
 	'NT': 'upnp:event',
 	'NTS': 'upnp:propchange',
 	'SID': sid,
 	'SEQ': seq,
 	'Content-Length': Buffer.byteLength(dta)				
   }
  };
  log.info(['SSDP','REQ','Sending notification %d to %s <%s>'].join(log.separator),seq, sid, target);
  var req = await http.request(options);
   req.write(dta);
   req.end();
   log.info(['SSDP', 'REQ', 'Notification %d to %s sent.'].join(log.separator),seq, target);		
   seq++;
   if(seq == 4294967295) seq = 1;
  return seq;
 };
 
 let _res = `<?xml version="1.0"?>
 <e:propertyset xmlns:e="urn:schemas-upnp-org:event-1-0">
 <e:property><${event.key}>${event.value}</${event.key}></e:property>
 </e:propertyset>`;
 
 device.subscribers = device.subscribers || [];
 log.info(['SSDP','SUBSCRIPTION','Notifying %s subscribers'].join(log.separator),device.subscribers.length);
 
 for (let i = 0; i < device.subscribers.length; i++) {
  let seq = device.subscribers[i].seq || 0;
  device.subscribers[i].seq = await _notify(
  device.subscribers[i].id,
  device.subscribers[i].url,
  seq,
  _res);
  //cleanup old subscribers
  if(new Date() - device.subscribers[i].created > (device.subscribers[i].timeout * 1000)){
   device.subscribers.splice(i,1);
  }
 }
	 
};