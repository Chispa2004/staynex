const fs=require('node:fs'),path=require('node:path');
exports.prepare=(root,lab)=>{
  const d=require('./theme-lab.cjs').prepare(root,lab);
  const put=(file,text)=>{const dest=path.join(d,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text)};
  for(const route of ['dashboard/automations','dashboard/settings/users','dashboard/knowledge','dashboard/settings/knowledge','settings','platform/hotels','dashboard/housekeeping','dashboard/maintenance','dashboard/settings/academy','dashboard/reception','dashboard/experience-bookings','dashboard/qr-rooms','dashboard/local-knowledge','dashboard/upsells','dashboard/experiences','dashboard/analytics','dashboard/ai-logs','dashboard/simulation','platform','platform/providers','platform/monitoring']){
    put('app/'+route+'/page.js',fs.readFileSync(path.join(root,'dashboard/app',route,'page.js'),'utf8'));
  }
  // Fixed synthetic clock/data: the two production builds see identical inputs.
  let data=fs.readFileSync(path.join(d,'lib/lab-fixture.js'),'utf8').replaceAll('new Date()', "new Date('2026-10-01T12:00:00Z')").replaceAll("platformRole:'none'","platformRole:'platform_admin'");
  data += "\ncontext.platformConsoleAccess=true;\n";
  put('lib/lab-fixture.js',data);
  put('lib/message-metrics.js',fs.readFileSync(path.join(root,'dashboard/lib/message-metrics.js'),'utf8').replace('now=new Date().toISOString()',"now='2026-10-01T12:00:00Z'"));
  let api=fs.readFileSync(path.join(d,'app/api/[...route]/route.js'),'utf8');
  api=api.replace('let body={};',"let body={hotel,hotelId:hotel.id,role:'admin',guestMemoryEnabled:false,items:[],reservations:[],bookings:[],upsells:[],experiences:[],rooms:[],logs:[],scenarios:[],providers:[],metrics:{}};");
  api=api.replace('return NextResponse.json(body);',`
    if(p==='/api/settings/users')body={hotel,hotelId:hotel.id,role:'admin',users:[]};
    if(p==='/api/knowledge')body={hotel,hotelId:hotel.id,role:'admin',entries:[],canManageKnowledge:true,operationalMode:false};
    if(p==='/api/automations')body={hotel,hotelId:hotel.id,role:'admin',scheduledMessages:[],rules:[],automations:[],automationRuns:[],metrics:{},migrationRequired:false};
    if(p==='/api/platform/monitoring')body={monitoring:{services:[],alerts:[],events:[],summary:{}}};
    if(p==='/api/platform/hotels')body={hotels:[],metrics:{totalHotels:0,activeHotels:0,pmsConnectedHotels:0,hotelsNeedingAttention:0}};
    return NextResponse.json(body);`);
  put('app/api/[...route]/route.js',api);
  return d;
};
