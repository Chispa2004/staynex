// Offline gate: importing this module never opens a transport or reads secrets.
// Caller must tokenize the FULL serialized provider request (messages, schema,
// roles/framing) and supply a conservative upper bound. No truncation fallback.
export function evaluationBudget(plan,{approvedUsd=0}={}) {
 let spent=0,attempts=0,tokens=0,pending=null,stopped=false;
 const unit=10_000_000; // integer 1e-7 USD; ignore cached-input discounts
 const inputRate=Math.round(plan.usdPerMillionInput*10),outputRate=Math.round(plan.usdPerMillionOutput*10);
 const cap=Math.floor(Math.min(approvedUsd,plan.maxUsd)*unit);
 const snapshot=()=>({attempts,tokens,usd:spent/unit,pending:!!pending,stopped});
 const halt=message=>{stopped=true;throw Error(message);};
 return {
  snapshot,
  reserve(inputUpperBound) {
   if(stopped||pending)throw Error('Stopped or unsettled attempt');
   if(!Number.isSafeInteger(inputUpperBound)||inputUpperBound<1||inputUpperBound>plan.maxInputTokensPerCall)throw Error('Input bound missing or exceeded; do not truncate');
   const output=plan.maxOutputTokensPerCall,cost=inputUpperBound*inputRate+output*outputRate;
   if(cap<=0||attempts>=plan.maxCalls||spent+cost>cap||tokens+inputUpperBound+output>plan.maxTotalTokens)throw Error('Budget not approved or ceiling reached');
   attempts++;spent+=cost;tokens+=inputUpperBound+output;pending={input:inputUpperBound,output,cost};
   return {max_completion_tokens:output,maxRetries:0};
  },
  settle(usage,error=null) {
   if(!pending)throw Error('No reserved attempt');
   const reserved=pending;pending=null;
   if(error)halt('Provider error: retain full reservation and stop, no retry');
   const input=usage?.prompt_tokens,output=usage?.completion_tokens,total=usage?.total_tokens;
   if(!Number.isSafeInteger(input)||!Number.isSafeInteger(output)||input<0||output<0||total!==input+output)halt('Unknown usage: retain full reservation and stop');
   if(input>reserved.input||output>reserved.output)halt('Usage exceeded conservative reservation: stop and investigate');
   spent-=reserved.cost-(input*inputRate+output*outputRate);tokens-=reserved.input+reserved.output-total;
   return snapshot();
  }
 };
}
