// Provider-specific policy. No Ubikos URLs or authentication contract inferred.
export const pmsContractError = code => Object.assign(new Error(code),{code,status:422,statusCode:422});
export function assertApaleoDestination(baseUrl, path='/booking/v1/reservations', environment, method='GET') {
  if(!['production','test'].includes(environment)) throw pmsContractError('PMS_ENVIRONMENT_REQUIRED');
  let base,url;
  try {base=new URL(baseUrl);url=new URL(path,base);}catch{throw pmsContractError('PMS_DESTINATION_DENIED');}
  if(base.href!=='https://api.apaleo.com/' || url.origin!==base.origin || url.username || url.password || url.hash || method!=='GET'
    || !/^\/(booking\/v1\/reservations(?:\/[A-Za-z0-9_-]+)?|inventory\/v1\/properties\/[A-Za-z0-9_-]+)$/.test(url.pathname))
    throw pmsContractError('PMS_DESTINATION_DENIED');
  return url;
}
export function assertApaleoBinding(config) {
  if(!config?.hotelId || !config?.connectionId || !Number.isInteger(Number(config?.revision)) || Number(config.revision)<1
    || typeof config.propertyId!=='string' || !/^[A-Za-z0-9_-]{1,100}$/.test(config.propertyId))
    throw pmsContractError('PMS_PROPERTY_BINDING_REQUIRED');
  assertApaleoDestination(config.baseUrl||'https://api.apaleo.com','/booking/v1/reservations',config.environment);
  return config;
}
export function assertApaleoProperty(record,config) {
  assertApaleoBinding(config);
  if(record?.property?.id!==config.propertyId || (record.propertyId!=null && record.propertyId!==config.propertyId))
    throw pmsContractError('PMS_PROPERTY_MISMATCH');
  return record;
}
export function pmsBinding(connection) {
 return {connectionId:connection?.id,hotelId:connection?.hotel_id,revision:connection?.config_revision,
   propertyId:connection?.metadata?.property_id,environment:connection?.metadata?.environment};
}
export function reservationBinding(connection) {
 return {pms_connection_id:connection.id,pms_config_revision:connection.config_revision,
   pms_property_id:connection.metadata?.property_id,pms_environment:connection.metadata?.environment};
}
export function currentPmsEvidence(connection,now=Date.now()) {
 const evidence=connection?.evidence||{};
 const valid=item=>Boolean(connection?.enabled && connection.provider==='apaleo' && !['mock','simulation','simulated','sandbox'].includes(connection.metadata?.connection_mode) && ['test','production'].includes(connection.metadata?.environment) && connection.metadata?.property_id && item
   && item.hotel_id===connection.hotel_id && item.provider===connection.provider
   && item.revision===connection.config_revision && item.property_id===connection.metadata?.property_id
   && item.environment===connection.metadata?.environment && Number.isFinite(Date.parse(item.at))
   && now-Date.parse(item.at)>=0 && now-Date.parse(item.at)<48*3600000);
 const test=valid(evidence.access)?evidence.access:null;
 const sync=valid(evidence.sync)?evidence.sync:null;
 return {production:connection?.metadata?.environment==='production',configured:Boolean(connection),enabled:connection?.enabled===true,
   accessVerified:test?.result==='success',syncVerified:sync?.result==='success'&&sync?.coverage==='complete',
   test,sync,historicalSuccess:connection?.last_success_evidence||null};
}
