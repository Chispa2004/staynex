// Synthetic browser Auth only. Never stores passwords or sends email.
const listeners=new Set();const get=()=>{try{return JSON.parse(localStorage.getItem('assisted-lab-session'));}catch{return null;}};
const notify=session=>{if(session)localStorage.setItem('assisted-lab-session',JSON.stringify(session));else localStorage.removeItem('assisted-lab-session');listeners.forEach(fn=>fn('SESSION',session));};
async function auth(action,email){const r=await fetch('/api/lab-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,email})});const data=await r.json();if(data.error)return {error:data.error};notify(data.session);return {data,error:null};}
const channel={on(){return channel;},subscribe(){return channel;},unsubscribe(){}};
const client={auth:{
 getSession:async()=>({data:{session:get()}}),getUser:async()=>({data:{user:get()?.user||null}}),
 signInWithPassword:({email})=>auth('signin',email),signUp:({email})=>auth('signup',email),signOut:async()=>{notify(null);return {error:null};},
 onAuthStateChange:fn=>{listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};}
},channel:()=>channel,removeChannel(){}};
export const getSupabaseBrowser=()=>client;
