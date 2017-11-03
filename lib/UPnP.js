var os = require('os');
var log = require('../lib/Utils').log;
var server = os.platform()+ '/' + (os.release() || 1.0) + ' UPnP/1.1 NYAH/1.0'
var ssdp = exports.ssdp = {};
ssdp.port = 1900;
ssdp.ttl = 128;
ssdp.address = '239.255.255.250';
ssdp.aliveTick = 10000;

ssdp.decode = (msg) => msg.toString('utf-8').trim().split('\r\n').reduce((r,e)=>{
 let m = /([A-Za-z-\.]+):?\s?(.*)/.exec(e);
 r[m[1].toLowerCase()] = m[2];
 return r;
},[]);

ssdp.alive = (device) => {
 let body = (nt,usn)=>[
 `NOTIFY * HTTP/1.1"`,
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
 ].join('\r\n')+'\r\n';
 
 let send = (nt,usn) =>setTimeout(()=> { 
  log.debug(['UDP','SSDP','ALIVE','%s(%s)','NT: %s, USN: %s'].join(log.separator),device.name, device.id, nt, usn);
  let msg = body(nt,usn);
  log.debug(['UDP','SSDP','ALIVE','%s'].join(log.separator),msg);
  msg = Buffer.from(msg);
  device.socket.send(msg, 0, msg.length, ssdp.port, ssdp.address);
 },Math.floor(Math.random() * 100));
 
 let urn = /<deviceType>(.+)</g.exec(device.template);
 device.urn = urn[1];
 let udn = /<UDN>(.+)</g.exec(device.template);
 device.udn = udn[1];
 send('upnp:rootdevice',device.udn+'::upnp:rootdevice');
 send(device.udn,device.udn);
 send(device.urn,device.udn+'::'+device.urn);
 
 let sRx = /<serviceType>(.+)</g;
 while((urn = sRx.exec(device.template)) !== null){
  device.surn = device.surn || [];
  device.surn.push(urn[1]);
  send(urn[1],device.udn+'::'+urn[1]);
 }
};

ssdp.byebye = device => {
 let body = (nt,usn)=>[
 `NOTIFY * HTTP/1.1"`,
 `HOST: ${ssdp.address}:${ssdp.port}`,
 `NT: ${nt}`,
 `NTS: ssdp:byebye`,
 `USN: ${usn}`,
 `BOOTID.UPNP.ORG: ${device.bid}`,
 `CONFIGID.UPNP.ORG: ${device.cid}`
 ].join('\r\n')+'\r\n';
 
 let send = (nt,usn) =>setTimeout(()=> { 
  log.debug(['UDP','SSDP','BYEBYE','%s(%s)','NT: %s, USN: %s'].join(log.separator),device.name, device.id, nt, usn);
  let msg = body(nt,usn);
  log.debug(['UDP','SSDP','BYEBYE','%s'].join(log.separator),msg);
  msg = Buffer.from(msg);
  device.socket.send(msg, 0, msg.length, ssdp.port, ssdp.address);
 },Math.floor(Math.random() * 100));
 
 send('upnp:rootdevice',device.udn+'::upnp:rootdevice');
 send(device.udn,device.udn);
 send(device.urn,device.udn+'::'+device.urn);
 
 device.surn.forEach(urn=>send(urn,device.udn+'::'+urn));
 
};

ssdp.update = (device) => {
 let body = (nt,usn)=>[
 `NOTIFY * HTTP/1.1"`,
 `HOST: ${ssdp.address}:${ssdp.port}`,
 `LOCATION: ${device.descUrl}`,
 `NT: ${nt}`,
 `NTS: ssdp:update`,
 `USN: ${usn}`,
 `BOOTID.UPNP.ORG: ${device.bid}`,
 `CONFIGID.UPNP.ORG: ${device.cid}`,
 `NEXTBOOTID.UPNP.ORG: ${device.bid++}`,
 `SEARCHPORT.UPNP.ORG: ${device.socket.address().port}`
 ].join('\r\n')+'\r\n';
 
 let send = (nt,usn) =>setTimeout(()=> { 
  log.debug(['UDP','SSDP','UPDATE','%s(%s)','NT: %s, USN: %s'].join(log.separator),device.name, device.id, nt, usn);
  let msg = body(nt,usn);
  log.debug(['UDP','SSDP','UPDATE','%s'].join(log.separator),msg);
  msg = Buffer.from(msg);
  device.socket.send(msg, 0, msg.length, ssdp.port, ssdp.address);
 },Math.floor(Math.random() * 100));
 
 let urn = /<deviceType>(.+)</g.exec(device.template);
 device.urn = urn[1];
 let udn = /<UDN>(.+)</g.exec(device.template);
 device.udn = udn[1];
 send('upnp:rootdevice',device.udn+'::upnp:rootdevice');
 send(device.udn,device.udn);
 send(device.urn,device.udn+'::'+device.urn);
 
 let sRx = /<serviceType>(.+)</g;
 while((urn = sRx.exec(device.template)) !== null){
  device.surn = device.surn || [];
  device.surn.push(urn[1]);
  send(urn[1],device.udn+'::'+urn[1]);
 }
};

ssdp.reply = (device, target, address) => {
 let body = (st,usn)=>[
 `HTTP/1.1 200 OK"`,
 `CACHE-CONTROL: max-age=${ssdp.aliveTick / 500}`,
 `DATE: ${new Date().toUTCString()}`,
 `EXT: `,
 `HOST: ${ssdp.address}:${ssdp.port}`,
 `LOCATION: ${device.descUrl}`,
 `SERVER: ${server}`,
 `ST: ${st}`,
 `USN: ${usn}`,
 `BOOTID.UPNP.ORG: ${device.bid}`,
 `CONFIGID.UPNP.ORG: ${device.cid}`,
 `SEARCHPORT.UPNP.ORG: ${device.socket.address().port}`
 ].join('\r\n')+'\r\n';
 
 let send = (st,usn) =>setTimeout(()=> { 
  log.debug(['UDP','SSDP','REPLY','%s(%s)','ST: %s, USN: %s'].join(log.separator),device.name, device.id, st, usn);
  let msg = body(st,usn);
  log.debug(['UDP','SSDP','REPLY','%s'].join(log.separator),msg);
  msg = Buffer.from(msg);
  device.socket.send(msg, 0, msg.length, address.port, address.address);
 },Math.floor(Math.random() * 100));
 
 switch (target) {
  case 'ssdp:all': 
   send('upnp:rootdevice',device.udn+'::upnp:rootdevice');
   send(device.udn,device.udn);
   send(device.urn,device.udn+'::'+device.urn);
 
   device.surn.forEach(urn=>send(urn,device.udn+'::'+urn));
   break;
  case 'upnp:rootdevice': send('upnp:rootdevice',device.udn+'::upnp:rootdevice'); break;
  case device.udn: send(device.udn,device.udn); break;
  case device.urn: send(device.urn,device.udn+'::'+device.urn); break;
 }
 if(device.surn.includes(target)){
  send(target,device.udn+'::'+target);
 }
 
};