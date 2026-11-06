import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {sdk} from '../src/index.js';

if(!process.argv.includes('--live'))throw new Error('This benchmark makes live Google requests. Pass --live explicitly.');
const query='how does intermittent fasting work';
const profile={country:'US',language:'en',location:'Austin,Texas,United States',device:'desktop' as const,resolveSources:true};
const outputIndex=process.argv.indexOf('--output');
const output=outputIndex<0?undefined:process.argv[outputIndex+1];
if(outputIndex>=0&&!output)throw new Error('--output requires a path');
const runs=[];
for(let trial=1;trial<=3;trial++){
  const start=performance.now();
  try{
    const response=await sdk().search.get(query,profile);
    const overview=response.success?response.result.aioverview:undefined,organic=response.success?response.result.organicResults??[]:[];
    const publisher=(value:string)=>!/(^|\.)google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(new URL(value).hostname);
    const result={trial,elapsedMs:Math.round(performance.now()-start),status:response.metadata.aiOverview.status,textLength:overview?.text.length??0,markdownLength:overview?.markdown?.length??0,citations:overview?.sources.length??0,resolvedCitations:overview?.sources.filter(source=>publisher(source.url)).length??0,organicResults:organic.length,resolvedOrganicResults:organic.filter(item=>publisher(item.link)).length,resolution:response.metadata.resolution};
    runs.push(result);console.log(JSON.stringify(result));
    if(result.status!=='present'||response.metadata.resolution?.unresolved!==0)break;
  }catch(error){console.log(JSON.stringify({trial,error:error instanceof Error?error.message:'Benchmark failed'}));throw error;}
}
const complete=runs.filter(run=>run.status==='present'&&run.citations>0&&run.resolvedCitations===run.citations&&run.organicResults>0&&run.resolvedOrganicResults===run.organicResults);
const times=complete.map(run=>run.elapsedMs).sort((a,b)=>a-b),n=times.length;
const summary={attempts:runs.length,completeResponses:n,minMs:n?times[0]:null,maxMs:n?times[n-1]:null,medianMs:n?(n%2?times[Math.floor(n/2)]!:(times[n/2-1]!+times[n/2]!)/2):null};
const report={testedAt:new Date().toISOString(),query,profile,environment:'Local embedded native transport; preinstalled runtime; fresh per-call HTTP sessions; no SDK response cache; Austin is a UULE hint, not a verified Austin IP. Desktop means the native 1024x768 profile, not Chrome.',runs,summary};
console.log(JSON.stringify({summary}));
if(output){const path=resolve(output);await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n');}
if(n!==runs.length)process.exitCode=1;
