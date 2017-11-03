const os = require('os');
var config = module.exports = {};

config.lan = os.type()=='Linux'?'eth0':'Wireless Network Connection';
config.wan = 'uap0';
config.wlan = 'wlan0';
config.ap = {ssid: 'tlhome',pwd:'Let14Us9'};

config.mgrip = os.networkInterfaces()[config.lan].find(i => i.family == 'IPv4' && !i.internal).address;
config.mgrport = 8080;
config.mgwsport = 8081;

config.separateInterfaces = false;