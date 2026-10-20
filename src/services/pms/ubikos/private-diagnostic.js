// In-process evidence only. Never attach raw provider errors to public responses.
// A WeakMap prevents an arbitrary thrown exception from supplying log fields.
const evidence = new WeakMap();
const stages = new Set(['configuration','transport','http','body','json','projection']);
const codes = new Set(['UBIKOS_SCOPE_REQUIRED','UBIKOS_REQUEST_CONTRACT_REQUIRED',
  'UBIKOS_DESTINATION_DENIED','UBIKOS_CREDENTIAL_REQUIRED','UBIKOS_REDIRECT_DENIED',
  'UBIKOS_AUTH_REJECTED','UBIKOS_FORBIDDEN_AUTH_OR_IP','UBIKOS_RATE_LIMITED',
  'UBIKOS_HTTP_FAILED','UBIKOS_RESPONSE_CONTRACT','UBIKOS_RESPONSE_TOO_LARGE',
  'UBIKOS_HOTEL_MISMATCH','UBIKOS_ROOM_MISMATCH','UBIKOS_CANCELLED',
  'UBIKOS_JSON_INVALID','UBIKOS_PROJECTION_REJECTED','UBIKOS_TIMEOUT',
  'UBIKOS_NETWORK_OR_TRANSPORT_FAILED']);
const categories = new Set(['DETAIL_UNCLASSIFIED','AUTHENTICATION_REPORTED',
  'ACCESS_RESTRICTION_REPORTED','REQUEST_VALIDATION_REPORTED','RATE_LIMIT_REPORTED']);
export function attachUbikosDiagnostic(error, result, projectionRejected=false) {
  const d=result.diagnostic;
  evidence.set(error,Object.freeze({
    failureStage:projectionRejected?'projection':stages.has(d?.stage)?d.stage:'unknown',
    transportStarted:typeof d?.transportStarted==='boolean'?d.transportStarted:null,
    httpResponseReceived:typeof d?.httpResponseReceived==='boolean'?d.httpResponseReceived:null,
    providerHttp:d?.httpResponseReceived===true && Number.isInteger(result.http) &&
      result.http>=100 && result.http<=599?result.http:null,
    providerDurationMs:Number.isSafeInteger(result.durationMs)&&result.durationMs>=0?result.durationMs:null,
    technicalCode:projectionRejected?'UBIKOS_PROJECTION_REJECTED':codes.has(result.code)?result.code:'UNKNOWN',
    providerReportedCategory:categories.has(result.errorDetail?.category)?result.errorDetail.category:null
  }));
  return error;
}
export const getUbikosDiagnostic = error =>
  error && typeof error==='object'?evidence.get(error):undefined;
