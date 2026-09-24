import { buildValidatedHotelCreationInput, validateCountryCode } from '../location/hotel-location-integrity.js';
import { validateIanaTimeZone } from '../time/timezone-validation.js';

export const HOTEL_FIELD_LIMITS = Object.freeze({ name:120, brand_name:120, city:120, country_code:2, timezone:100,
  admin_email:254, support_email:254, phone:32, support_phone:32, whatsapp_number:16, address:500, description:2000,
  slug:48, workspace_slug:48, default_language:5, brand_color:7, secondary_color:7, logo_url:2048, favicon_url:2048,
  check_in_time:5, check_out_time:5, subscription_plan:32 });
const required = ['name','country_code','city','timezone'];
const aliases = {brandName:'brand_name',countryCode:'country_code',adminEmail:'admin_email',supportEmail:'support_email',
  supportPhone:'support_phone',whatsappNumber:'whatsapp_number',workspaceSlug:'workspace_slug',defaultLanguage:'default_language',
  brandColor:'brand_color',secondaryColor:'secondary_color',logoUrl:'logo_url',faviconUrl:'favicon_url',subscriptionPlan:'subscription_plan'};
const email = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
export const validationError = (fields, status=422) => Object.assign(new Error('Revisa los campos indicados.'), {status,fields});
export const assertObject = body => { if (!body || typeof body!=='object' || Array.isArray(body)) throw validationError({_form:'Envía un objeto con los datos del hotel.'},400); return body; };

// Blank optional controls are omitted on creation, or explicitly cleared on edit.
// Direct API requests must use absence/null instead of whitespace as a value.
export const hotelFormInput = (form, {creating=false}={}) => Object.fromEntries(Object.entries(form).flatMap(([key,value]) => {
  if (!Object.hasOwn(HOTEL_FIELD_LIMITS,key)) return [];
  if (typeof value==='string' && !value.trim() && !required.includes(key) && key!=='admin_email') return creating ? [] : [[key,null]];
  return [[key,value]];
}));
export const validateHotelFields = (body, {creating=false, platform=false}={}) => {
  assertObject(body); const source={...body}, fields={}, data={};
  for(const [alias,key] of Object.entries(aliases)) if(Object.hasOwn(body,alias)) {
    if(Object.hasOwn(body,key) && body[key]!==body[alias]) fields[key]='Los valores del campo no coinciden.';
    else source[key]=body[alias];
  }
  for(const [key,max] of Object.entries(HOTEL_FIELD_LIMITS)) {
    const needed=creating && (required.includes(key) || (platform && key==='admin_email'));
    if(!Object.hasOwn(source,key)) {if(needed) fields[key]='Este campo es obligatorio.'; continue;}
    const value=source[key];
    if(value===null && !required.includes(key) && key!=='admin_email' && key!=='default_language') {data[key]=null;continue;}
    if(typeof value!=='string' || !value.trim()) {fields[key]='Introduce un texto válido, no vacío.';continue;}
    const text=value.trim();
    if(text.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {fields[key]=`Máximo ${max} caracteres, sin caracteres de control.`;continue;}
    data[key]=text;
    if(['admin_email','support_email'].includes(key) && !email.test(text)) fields[key]='Introduce un correo válido, por ejemplo nombre@hotel.com.';
    if(key==='country_code') {if(!validateCountryCode(text,{required:true}).valid) fields[key]='Usa el código de país de dos letras.';else data[key]=text.toUpperCase();}
    if(key==='timezone' && !validateIanaTimeZone(text).valid) fields[key]='Introduce una zona horaria IANA válida, por ejemplo Europe/Madrid.';
    if(key==='whatsapp_number' && !/^\+[1-9]\d{6,14}$/.test(text)) fields[key]='Usa el formato internacional: + y entre 7 y 15 dígitos.';
    if(['phone','support_phone'].includes(key) && (!/^\+?[\d ()-]{5,32}$/.test(text) || text.replace(/\D/g,'').length<5)) fields[key]='Introduce un teléfono válido.';
    if(['check_in_time','check_out_time'].includes(key) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) fields[key]='Usa una hora válida en formato HH:MM.';
    if(['slug','workspace_slug'].includes(key) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) fields[key]='Usa letras minúsculas, números y guiones.';
    if(['brand_color','secondary_color'].includes(key) && !/^#[\da-f]{6}$/i.test(text)) fields[key]='Usa un color hexadecimal de seis dígitos.';
    if(key==='default_language' && !['es','en','fr','de'].includes(text)) fields[key]='Selecciona ES, EN, FR o DE.';
    if(key==='subscription_plan' && !['starter','professional','enterprise','enterprise_demo','pro_demo','workspace_trial'].includes(text)) fields[key]='Selecciona un plan existente.';
    if(['logo_url','favicon_url'].includes(key)) {try {const u=new URL(text);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error();}catch{fields[key]='Introduce una URL HTTP o HTTPS válida.';}}
  }
  if(!creating && !Object.keys(data).length && !Object.keys(fields).length) fields._form='Indica al menos un campo del hotel para guardar.';
  if(Object.keys(fields).length) throw validationError(fields);
  if(creating) Object.assign(data,buildValidatedHotelCreationInput(data));
  return data;
};
export const assertCreationKey = key => {if(typeof key!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw validationError({_form:'Falta una clave válida para reintentar el alta sin duplicarla.'},400);return key;};

export const readHotelJson = async request => {
  let body;
  try { body=await request.json(); } catch { throw validationError({_form:'El cuerpo de la petición no es JSON válido.'},400); }
  return assertObject(body);
};
