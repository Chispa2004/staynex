// Process-local admission and promise completion, not a durable work queue.
// This cannot account for an earlier binary, detached jobs or other replicas.
export function installTransitionEndpoints(app,control,authorize) {
 app.get('/internal/transition',authorize,(_req,res)=>res.json(control.snapshot()));
 app.post('/internal/transition',authorize,(req,res)=>{
   try {
     if(Object.keys(req.body||{}).length!==1)throw Error('Expected mode only');
     res.json(control.restrict(req.body.mode));
   }catch{return res.status(422).json({error:'Only restrictive admission modes are accepted'});}
 });
}
export function createTransitionControl({initialMode='open',instance='unknown',revision='unknown'}={}) {
 const modes=['open','pms','all'];
 if(!modes.includes(initialMode)) throw Error('Invalid TRANSITION_ADMISSION_MODE');
 let mode=initialMode,active=0,completed=0,failed=0;
 const counts={};
 const snapshot=()=>({mode,instance,revision,active,completed,failed,groups:{...counts},scope:'this-process-only'});
 const restrict=next=>{
   if(!modes.includes(next)||modes.indexOf(next)<modes.indexOf(mode)) throw Error('Admission may only be restricted; reopening requires reviewed startup configuration');
   mode=next;return snapshot();
 };
 const wrap=(handler,group,method)=>async(req,res,next)=>{
   if(mode==='all'||(mode==='pms'&&group==='pms'&&!['get','head'].includes(method))) {
     res.setHeader('Retry-After','60');return res.status(503).json({ok:false,code:'TRANSITION_ADMISSION_CLOSED'});
   }
   active++;counts[group]=(counts[group]||0)+1;let errorSeen=false;
   try {
     // Do not decrement on socket close/HTTP finish: work can outlive a response.
     return await handler(req,res,error=>{if(error)errorSeen=true;return next(error);});
   } catch(error) {errorSeen=true;return next(error);}
   finally {active--;counts[group]--;completed++;if(errorSeen||res.statusCode>=500)failed++;}
 };
 const install=(router,group)=>{
   for(const layer of router.stack) if(layer.route) {
     const terminal=layer.route.stack.at(-1);
     terminal.handle=wrap(terminal.handle,group,terminal.method);
   }
   return router;
 };
 return {snapshot,restrict,wrap,install};
}
