import {isUbikosListDay, ubikosListOperations} from '../../src/services/pms/ubikos/list-contract.js';
import {randomUUID} from 'node:crypto';
import {getUbikosDiagnostic} from '../../src/services/pms/ubikos/private-diagnostic.js';

const fail = (code, status) => { throw Object.assign(new Error(code), {code, status}); };
const response = (body, status = 200) => Response.json(body, {status,
  headers: {'Cache-Control': 'no-store', 'Vary': 'Authorization, x-staynex-hotel-id'}});
const codes = new Set(['ACCESS_DENIED', 'BINDING_REQUIRED', 'REQUEST_INVALID',
  'SERVER_READING_UNAVAILABLE', 'READ_FAILED', 'STRUCTURE_INVALID']);

// Dependencies are server-only; authorization precedes any provider transport.
export function createUbikosObservationHandler({getContext, canAccess, assertContext, reader = null,
  logDiagnostic = entry => console.info(JSON.stringify(entry))}) {
  return async request => {
    const diagnosticId=randomUUID(),startedAtUtc=new Date().toISOString(),started=performance.now();
    let failureStage='authorization',readerInvoked=false;
    try {
      const ctx = await getContext(request, {readOnly: true, includeDirectory: false});
      const {hotel, supabase, role, user, platformRole, fallback} = ctx;
      const requested = request.headers.get('x-staynex-hotel-id');
      if (!user?.id || ctx.accessDenied || !hotel?.id || fallback || !requested ||
        requested !== hotel.id || !canAccess(role, 'pms_connections')) fail('ACCESS_DENIED', 403);
      assertContext({hotel, fallback, write: true}); // suspended hotels cannot query
      if (new URL(request.url).search) fail('REQUEST_INVALID', 400);
      failureStage='binding';
      const {data, error} = await supabase.from('hotel_pms_connections')
        .select('id,hotel_id,provider,account_code,enabled,metadata')
        .eq('hotel_id', hotel.id).eq('provider', 'ubikos').limit(2);
      if (error) fail('READ_FAILED', 503);
      if (data?.length !== 1) fail('BINDING_REQUIRED', 409);
      const connection = data[0];
      const property = connection.metadata?.property_id;
      if (connection.hotel_id !== hotel.id || connection.provider !== 'ubikos' ||
        !connection.enabled || property !== '10318' ||
        (connection.account_code && connection.account_code !== property)) fail('BINDING_REQUIRED', 409);
      const canQuery = canAccess(role, 'pms_connections_manage') && platformRole !== 'support';
      const scope = {hotelId:hotel.id,connectionId:connection.id,externalHotelId:property};
      const available = Boolean(reader?.available(scope));
      const binding = {hotelId: hotel.id, hotelName: hotel.name, connectionId: connection.id,
        externalHotelId: property, canQuery, serverReadingAvailable: available,
        simulated: reader?.simulated === true};
      if (request.method === 'GET') return response({ok: true, ...binding});
      if (request.method !== 'POST') fail('REQUEST_INVALID', 405);
      failureStage='authorization';
      if (!canQuery) fail('ACCESS_DENIED', 403);
      failureStage='request';
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(k => !['connectionId', 'operation', 'date'].includes(k)) ||
        body.connectionId !== connection.id || !ubikosListOperations.includes(body.operation) ||
        (body.operation === 'inhouse' ? body.date !== undefined : !isUbikosListDay(body.date))) {
        fail('REQUEST_INVALID', 400);
      }
      failureStage='configuration';
      if (!available) fail('SERVER_READING_UNAVAILABLE', 503);
      // Scope supplied from the authorized persisted connection, never a caller URL.
      failureStage='reader';readerInvoked=true;
      const observation = await reader.read({...scope,
        operation: body.operation, date: body.date, signal: request.signal});
      failureStage='projection';
      if (observation.status === 'rejected') fail('STRUCTURE_INVALID', 502);
      return response({ok: true, ...binding, observation});
    } catch (error) {
      // Never forward provider errors, database details, secrets or raw bodies.
      const denied = error?.status === 403 || error?.code === 'hotel_operations_held';
      const code = codes.has(error?.code) ? error.code : denied ? 'ACCESS_DENIED' : 'READ_FAILED';
      const dashboardHttp=({ACCESS_DENIED:403,BINDING_REQUIRED:409,REQUEST_INVALID:
        !['GET','POST'].includes(request.method)?405:400,
        SERVER_READING_UNAVAILABLE:503,READ_FAILED:503,STRUCTURE_INVALID:502})[code];
      const diagnostic=getUbikosDiagnostic(error);
      try {
        logDiagnostic({event:'staynex_ubikos_manual_read_failure_v1',diagnosticId,startedAtUtc,
          durationMs:Math.round(performance.now()-started),dashboardHttp,
          failureStage,transportStarted:readerInvoked?null:false,httpResponseReceived:readerInvoked?null:false,
          providerHttp:null,providerDurationMs:null,technicalCode:code,providerReportedCategory:null,
          ...diagnostic});
      } catch { /* Logging cannot change the safe response or trigger another query. */ }
      return response({ok: false, code, diagnosticId}, dashboardHttp);
    }
  };
}
