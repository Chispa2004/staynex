// Explicit local-only alternative when Docker is unavailable; never accepts a DB URL.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
export async function createNativeTestPostgres(bin,driver) {
 if(!path.isAbsolute(bin)||!path.isAbsolute(driver))throw Error('Explicit local binaries and driver required');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'staynex-service-pg-')),data=path.join(root,'data');
 const run=(name,args)=>execFileSync(path.join(bin,name+'.exe'),args,{encoding:'utf8',windowsHide:true,timeout:60000,stdio:name==='pg_ctl'?'ignore':'pipe'});
 const port=await new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
 let started=false;
 const cleanup=()=>{if(started||fs.existsSync(path.join(data,'postmaster.pid'))){run('pg_ctl',['-D',data,'-m','fast','-w','stop']);started=false;}
  const resolved=path.resolve(root);if(!resolved.startsWith(path.resolve(os.tmpdir())+path.sep+'staynex-service-pg-')||fs.lstatSync(root).isSymbolicLink())throw Error('Unsafe cleanup path');fs.rmSync(root,{recursive:true,force:true});};
 try {
  // Disposable fixture clusters already run with fsync disabled (-F). Avoid a
  // Windows filesystem flush timeout while initializing their empty catalog;
  // this harness tests transactions/readback, not crash-durability guarantees.
  run('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--locale=C','--no-sync']);
  run('pg_ctl',['-D',data,'-l',path.join(root,'server.log'),'-o',`-h 127.0.0.1 -p ${port} -F`,'-w','start']);started=true;
  const query=fileURLToPath(new URL('./native-pg-query.cjs',import.meta.url));
  return {cleanup,sql:text=>execFileSync(process.execPath,[query,driver,String(port)],{input:text,env:process.env,encoding:'utf8',windowsHide:true,timeout:30000,stdio:['pipe','pipe','pipe']}).trim()};
 }catch(e){try{cleanup();}catch(cleanError){process.stderr.write('Temporary cluster cleanup: '+cleanError.message+'\n');}throw e;}
}
