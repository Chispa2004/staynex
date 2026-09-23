'use client';
import { useDashboardLanguage } from '@/lib/i18n/useDashboardLanguage';
const labels={name:'Nombre del hotel',brand_name:'Marca',country_code:'País',city:'Ciudad',timezone:'Zona horaria',admin_email:'Correo del administrador',support_email:'Correo de soporte',whatsapp_number:'WhatsApp',phone:'Teléfono',support_phone:'Teléfono de soporte',check_in_time:'Hora de entrada',check_out_time:'Hora de salida',address:'Dirección',description:'Descripción',slug:'Identificador del hotel',workspace_slug:'Identificador del hotel',default_language:'Idioma',brand_color:'Color',secondary_color:'Color secundario',logo_url:'Logotipo',favicon_url:'Icono',subscription_plan:'Plan',_form:'Formulario'};
export const HotelFieldErrors=({fields,prefix})=>{
 const {tx}=useDashboardLanguage();
 if(!fields || !Object.keys(fields).length)return null;
 return <div role="alert" className="my-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
 <p>{tx('Revisa los campos indicados.')}</p><ul className="mt-2 space-y-1">{Object.entries(fields).map(([key,message])=><li key={key}>
 {prefix && key!=='_form'?<a className="underline" href={`#${prefix}-${key}`}>{tx(labels[key]||key)}</a>:tx(labels[key]||key)}: {tx(message)}
 </li>)}</ul></div>;
};
