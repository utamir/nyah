var ssdp = exports.ssdp = {};
ssdp.port = 1900;
ssdp.ttl = 128;
ssdp.address = '239.255.255.250';

ssdp.decode = (msg) => msg.toString('utf-8').trim().split('\r\n').reduce((r,e)=>{
 let m = /([A-Za-z-\.]+):?\s?(.*)/.exec(e);
 r[m[1].toLowerCase()] = m[2];
 return r;
},[]);