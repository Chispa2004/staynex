const fs=require('node:fs'),net=require('node:net');
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){const first=Array.isArray(args[0])?args[0][0]:args[0];const host=typeof first==='object'?first.host:typeof args[1]==='string'?args[1]:null;if(host&&!['localhost','127.0.0.1','::1'].includes(host))throw new Error('Local review blocks external connections');return connect.apply(this,args);};
const read=fs.readFileSync;
fs.readFileSync=function(file,...args){if(/(?:^|[\\/])\.env(?:$|\.)/.test(String(file))){const e=new Error('Private environment excluded');e.code='ENOENT';throw e;}return read.call(this,file,...args);};
require('node:module').syncBuiltinESMExports();
