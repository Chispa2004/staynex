// Defense against accidental provider traffic and dotenv loading in local/CI tests.
// This is not a sandbox for malicious code; CI never receives production secrets.
const fs = require('node:fs');
const net = require('node:net');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : null;
  if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('CI blocked external network');
  return originalConnect.apply(this, args);
};
const excluded = file => /(?:^|[\\/])\.env(?:$|\.)/.test(String(file));
const missing = () => Object.assign(new Error('CI excludes environment files'), { code: 'ENOENT' });
const readSync = fs.readFileSync, read = fs.readFile, readPromise = fs.promises.readFile;
fs.readFileSync = function (file, ...args) { if (excluded(file)) throw missing(); return readSync.call(this, file, ...args); };
fs.readFile = function (file, ...args) { if (excluded(file)) return process.nextTick(args.at(-1), missing()); return read.call(this, file, ...args); };
fs.promises.readFile = function (file, ...args) { if (excluded(file)) return Promise.reject(missing()); return readPromise.call(this, file, ...args); };
require('node:module').syncBuiltinESMExports();
