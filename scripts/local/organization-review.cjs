// Reuses the existing synthetic session contract in an isolated copy, never production auth.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),runtime=path.join(root,'.npm-cache/organization-review/runtime');
const files=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(f=>/^(dashboard|shared|src|scripts)\//.test(f)&&!/(^|\/)\.env($|\.)/.test(f));
const manifest={branch:cp.execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),base:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files:[]};
const adapters=new Set(['dashboard/lib/supabase-browser.js','dashboard/app/layout.js']);
const write=(dest,content)=>{if(!fs.existsSync(dest)||!fs.readFileSync(dest).equals(Buffer.from(content)))fs.writeFileSync(dest,content);};
for(const file of files){if(adapters.has(file))continue;const dest=path.join(runtime,file);fs.mkdirSync(path.dirname(dest),{recursive:true});const content=fs.readFileSync(path.join(root,file));write(dest,content);manifest.files.push({file,sha256:crypto.createHash('sha256').update(content).digest('hex')});}
for(const folder of ['node_modules','dashboard/node_modules']){const dest=path.join(runtime,folder);if(!fs.existsSync(dest))fs.symlinkSync(path.join(root,folder),dest,'junction');}
write(path.join(runtime,'package.json'),fs.readFileSync(path.join(root,'package.json')));
const adapter=path.join(root,'.npm-cache/inbox-redesign/runtime/dashboard/lib/supabase-browser.js');
if(!fs.existsSync(adapter))throw new Error('Existing local review session adapter required: .npm-cache/inbox-redesign/runtime/dashboard/lib/supabase-browser.js');
write(path.join(runtime,'dashboard/lib/supabase-browser.js'),fs.readFileSync(adapter));
write(path.join(runtime,'dashboard/components/LocalReviewNetworkBoundary.js'),fs.readFileSync(path.join(root,'scripts/fixtures/organization-review-network.js')));
const layout=path.join(runtime,'dashboard/app/layout.js');write(layout,fs.readFileSync(path.join(root,'dashboard/app/layout.js'),'utf8').replace("import './globals.css';","import './globals.css';\nimport { LocalReviewNetworkBoundary } from '@/components/LocalReviewNetworkBoundary';").replace('<body>','<body><LocalReviewNetworkBoundary />'));
fs.writeFileSync(path.join(runtime,'dashboard/public/review-build.json'),JSON.stringify({...manifest,adapters:['dashboard/lib/supabase-browser.js','dashboard/app/layout.js','dashboard/components/LocalReviewNetworkBoundary.js']},null,2));
if(process.argv.includes('--prepare'))process.exit(0);
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|APPDATA|LOCALAPPDATA|USERPROFILE|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(k)));
Object.assign(env,{NEXT_PUBLIC_STAYNEX_LOCAL_REVIEW:'1',NEXT_TELEMETRY_DISABLED:'1',SEND_AUTOMATIONS:'false',USE_MOCK_AI:'true',GUEST_MEMORY_ENABLED:'false',AUTOMATION_TEST_SEND_ENABLED:'false',SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:9',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-review-placeholder',SUPABASE_SERVICE_ROLE_KEY:'local-review-placeholder',NODE_OPTIONS:`--require "${path.join(root,'scripts/local/organization-review-isolate.cjs').replaceAll('\\','/')}"`});
console.log('Synthetic review: http://127.0.0.1:3341/my-hotels?profile=cadena; source hashes: /review-build.json');
const child=cp.spawn(process.execPath,[path.join(runtime,'dashboard/node_modules/next/dist/bin/next'),'dev','-p','3341','-H','127.0.0.1'],{cwd:path.join(runtime,'dashboard'),env,stdio:'inherit'});
child.on('exit',code=>process.exit(code||0));
