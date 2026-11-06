import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sdk, AiSearchError } from '../src/index.js';
import { runScaleStage } from './scale-scheduler.js';

if(!process.argv.includes('--live'))throw new Error('This script makes live requests. Pass --live --output PATH explicitly.');
const outputFlag=process.argv.indexOf('--output');
if(outputFlag<0||!process.argv[outputFlag+1])throw new Error('Pass --output PATH for sanitized JSON results.');
const output=resolve(process.argv[outputFlag+1]!);await mkdir(dirname(output),{recursive:true});
const queries=['why does the ocean look blue','how to descale an electric kettle','induction vs gas stove pros and cons','best indoor plants for low light rooms'];
const stages=[{count:10,concurrency:1,spacingMs:500},{count:30,concurrency:2,spacingMs:500},{count:60,concurrency:4,spacingMs:500}];
interface Row {id:number;stage:number;query:string;occurrence:number;repeated:boolean;startedAt:string;elapsedMs:number;status:'present'|'unverified'|'blocked'|'error';hasOverview:boolean;answerCharacters:number;sources:number;httpStatus?:number;errorKind?:string;stopSignal?:string}
const rows:Row[]=[],stageResults:unknown[]=[],seen=new Map<string,number>(),client=sdk(),gate={lastStart:-Infinity};
const begun=Date.now();let sequence=0,writeQueue=Promise.resolve();
const percentile=(values:number[],p:number)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;};
const stats=(values:Row[])=>({completed:values.length,present:values.filter(row=>row.status==='present').length,unverified:values.filter(row=>row.status==='unverified').length,blocked:values.filter(row=>row.status==='blocked').length,errors:values.filter(row=>row.status==='error').length,p50Ms:percentile(values.map(row=>row.elapsedMs),.5),p95Ms:percentile(values.map(row=>row.elapsedMs),.95)});
const save=(finished=false)=>{const snapshot=JSON.stringify({startedAt:new Date(begun).toISOString(),finished,elapsedMs:Date.now()-begun,policy:{maximumCalls:100,maximumSdkStartsPerSecond:2,coldSessionPerSdkCall:true,upstreamRequestsPerCall:'Two baseline HTTP calls (homepage and Search), plus at most one recognized bootstrap follow-up; failures can terminate earlier. This is not a 2 upstream requests/sec limit.',challengePolicy:'Stop launches on blocked/HTTP403/429/302; drain in-flight; no retry, proxy, imported cookies or identity rotation.',queryDesign:'Four distinct public queries repeated in fixed round-robin order; not 100 unique prompts.'},summary:stats(rows),stages:stageResults,rows:[...rows].sort((a,b)=>a.id-b.id)},null,2)+'\n';writeQueue=writeQueue.then(()=>writeFile(output,snapshot));return writeQueue;};
await save();
for(let stage=0;stage<stages.length;stage++){
  const policy=stages[stage]!;console.log(JSON.stringify({event:'stage-start',stage:stage+1,...policy}));
  const result=await runScaleStage(policy,async()=>{
    const id=++sequence,query=queries[(id-1)%queries.length]!,occurrence=(seen.get(query)??0)+1;seen.set(query,occurrence);
    const started=performance.now(),startedAt=new Date().toISOString();let row:Row;
    try{
      const answer=await client.overview.get(query,{country:'US',language:'en',markdown:true});
      const status=answer.metadata.httpStatus;
      row={id,stage:stage+1,query,occurrence,repeated:occurrence>1,startedAt,elapsedMs:Math.round(performance.now()-started),status:answer.status,hasOverview:answer.status==='present',answerCharacters:answer.text?.length??0,sources:answer.sources.length,...(status!==undefined?{httpStatus:status}:{})};
      if(answer.status==='blocked'||status===403||status===429||status===302)row.stopSignal='access-challenge-or-redirect';
    }catch(error){
      const status=error instanceof AiSearchError?error.status:undefined;
      row={id,stage:stage+1,query,occurrence,repeated:occurrence>1,startedAt,elapsedMs:Math.round(performance.now()-started),status:'error',hasOverview:false,answerCharacters:0,sources:0,errorKind:error instanceof AiSearchError?error.kind:'unknown',...(status!==undefined?{httpStatus:status}:{})};
      if(status===403||status===429||status===302)row.stopSignal='access-challenge-or-redirect';
    }
    rows.push(row);void save();console.log(JSON.stringify({event:'result',...row,rolling:stats(rows)}));return row;
  },(row,completed)=>row.stopSignal??(completed.filter(value=>value.status==='error').length>=3?'three-stage-errors':undefined),gate);
  const summary={stage:stage+1,planned:policy.count,concurrency:policy.concurrency,launched:result.launched,...stats(result.values),...(result.stopReason?{stopReason:result.stopReason}:{})};stageResults.push(summary);console.log(JSON.stringify({event:'stage-end',...summary}));await save();
  if(result.stopReason)break;
}
await save(true);console.log(JSON.stringify({event:'audit-end',...stats(rows),output}));
