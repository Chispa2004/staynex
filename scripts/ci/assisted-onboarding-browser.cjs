// Runs only against an owned loopback laboratory and disposable PostgreSQL.
const {spawn,spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const run=(file,args=[])=>{
 const result=spawnSync(process.execPath,[path.join(root,file),...args],{cwd:root,env:process.env,stdio:'inherit',timeout:240000});
 if(result.error||result.status!==0)throw result.error||Error(file+' failed: '+result.status);
};
(async()=>{
 // Never reuse a server left by another task.
 try { await fetch('http://127.0.0.1:3390/lab',{signal:AbortSignal.timeout(1000)}); throw Error('Port 3390 already occupied'); }
 catch(error){if(error.message==='Port 3390 already occupied')throw error;}
 run('scripts/test-invitation-auth-callback.cjs');
 run('scripts/assisted-onboarding-lab.cjs',['build']);
 const lab=spawn(process.execPath,['scripts/assisted-onboarding-lab.cjs','start'],{cwd:root,env:process.env,stdio:'inherit'});
 try {
  let ready=false;
  for(let n=0;n<60;n++){
   if(lab.exitCode!==null)throw Error('Laboratory exited before readiness');
   try{const r=await fetch('http://127.0.0.1:3390/lab',{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,1000));
  }
  if(!ready)throw Error('Laboratory readiness timeout');
  for(const args of [[],['--new-account']]){
   run('scripts/test-assisted-onboarding-browser.cjs',args);
   run('scripts/test-assisted-onboarding-completion.cjs',args);
  }
  console.log('PASS assisted onboarding browser: existing/new identity, lost response, completion, keyboard, 1366/390, light/dark; synthetic Auth only');
 } finally {
  lab.kill('SIGTERM');
  await new Promise(resolve=>{if(lab.exitCode!==null)resolve();else lab.once('exit',resolve);});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
