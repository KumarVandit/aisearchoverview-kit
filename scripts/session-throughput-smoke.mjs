import {sdk} from '../dist/index.js';
import {createHash} from 'node:crypto';
import {appendFileSync,mkdtempSync,readFileSync,writeFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Manual experiment only. No server, answer cache, denied-query retry or identity rotation.
const queries=['The Catherine','apartments in Austin Texas','apartments in austin texas for rent','apartments in austin texas near the university','apartments in austin texas downtown','apartments in austin texas under $1000','apartments in austin texas cheap'];
const profile={country:'US',language:'en',location:'Austin,Texas,United States',device:'desktop'};
const cache=process.env.AI_SEARCH_OVERVIEW_CACHE;
if(!cache)throw Error('Run setup and supply AI_SEARCH_OVERVIEW_CACHE');
const directory=mkdtempSync(join(tmpdir(),'overview-session-smoke-'));chmodSync(directory,0o700);
const wrapper=join(directory,'python-session'),python=join(cache,'python/bin/python');
const driver=fileURLToPath(new URL('./test-support/session-fetch.py',import.meta.url));
writeFileSync(wrapper,`#!${python}\nimport os,runpy,sys,fcntl\nfrom pathlib import Path\nbase=Path(__file__).resolve().parent\nos.environ['AI_OVERVIEW_SESSION_FILE']=str(base/'anonymous.cookies')\nif len(sys.argv)!=4: raise SystemExit('Expected SDK driver, URL and native helper')\nsys.argv=[${JSON.stringify(driver)},sys.argv[2],sys.argv[3]]\nwith open(base/'session.lock','a') as lock:\n os.chmod(base/'session.lock',0o600)\n fcntl.flock(lock.fileno(),fcntl.LOCK_EX)\n runpy.run_path(${JSON.stringify(driver)},run_name='__main__')\n`,{mode:0o700});
const client=sdk({pythonExecutable:wrapper,bootstrapExecutable:join(cache,'native/target/release/google-search-bootstrap'),ipFamily:'ipv4',traffic:{maxConcurrent:1,minIntervalMs:6000,cooldownMs:60000}});
const summary=text=>{if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,text);};
summary('## Anonymous session throughput experiment\n\nUp to 100 fresh answers at six-second start intervals, cycling seven exact Austin desktop queries. One persistent own-cookie jar; IPv4; no answer cache or publisher resolution. Stop on the first denial, redirect, network error or backpressure. Unverified answers remain unverified. No raw captures, cookie values, session URLs or artifacts are retained.\n\n| Request | Query | HTTP | Overview | Time ms | Text chars | Citations | Organic | HTTP calls | Bootstrap | Cookies before/after |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n');
const rows=[];let lastStarted=0,stopped=false;
for(let i=0;i<100;i++){
 const now=performance.now();if(lastStarted&&now-lastStarted<6000)await new Promise(r=>setTimeout(r,6000-(now-lastStarted)));
 const start=performance.now();lastStarted=start;const query=queries[i%queries.length];
 process.env.AI_OVERVIEW_PROFILE_FILE=join(directory,`profile-${i+1}.json`);
 let row;
 try{
  const data=await client.search.get(query,{...profile,resolveSources:false});const ai=data.result?.aioverview;const text=ai?.text?.trim()??'';const sources=ai?.sources??[];
  row={index:i+1,query,startedAt:new Date().toISOString(),elapsedMs:Math.round(performance.now()-start),httpStatus:data.metadata.httpStatus,searchStatus:data.metadata.searchStatus,overviewStatus:data.metadata.aiOverview.status,textLength:text.length,textSha256:text?createHash('sha256').update(text).digest('hex'):undefined,citations:sources.length,labeledCitations:sources.filter(s=>typeof s.label==='string'&&s.label.trim()).length,organicCount:data.result?.organicResults?.length??0,errorCode:data.error?.code};
  row.verifiedAnswer=row.overviewStatus==='present'&&text.length>0&&sources.length>0;
  stopped=row.overviewStatus==='blocked'||row.httpStatus!==200||['BLOCKED','BACKPRESSURE','CIRCUIT_OPEN','BUSY'].includes(row.errorCode??'');
 }catch(error){row={index:i+1,query,elapsedMs:Math.round(performance.now()-start),overviewStatus:'error',errorKind:String(error?.kind??error?.name??'unknown').slice(0,50)};stopped=true;}
 try{const p=JSON.parse(readFileSync(process.env.AI_OVERVIEW_PROFILE_FILE,'utf8'));row.profile={httpRequestCount:p.httpRequestCount,bootstrapExecuted:p.bootstrapExecuted,bootstrapWallMs:p.bootstrapWallMs??0,sessionCookiesBefore:p.sessionCookiesBefore,sessionCookiesAfter:p.sessionCookiesAfter,totalWallMs:p.totalWallMs};}catch{}
 rows.push(row);console.log(JSON.stringify(row));
 summary(`| ${i+1} | ${query.replaceAll('|','&#124;')} | ${row.httpStatus??''} | ${row.overviewStatus} | ${row.elapsedMs} | ${row.textLength??0} | ${row.citations??0} | ${row.organicCount??0} | ${row.profile?.httpRequestCount??''} | ${row.profile?.bootstrapExecuted??''} | ${row.profile?.sessionCookiesBefore??''}/${row.profile?.sessionCookiesAfter??''} |\n`);
 if(stopped)break;
}
const verified=rows.filter(r=>r.verifiedAnswer).length,transportPass=rows.length===100&&rows.every(r=>r.httpStatus===200),oneHttp=rows.filter(r=>r.profile?.httpRequestCount===1).length;
const result={type:'summary',attempted:rows.length,requested:100,transportPass,stoppedOnRestrictionOrError:stopped,verifiedOverviews:verified,oneHttpRequests:oneHttp,twoHttpRequests:rows.filter(r=>r.profile?.httpRequestCount===2).length,totalHttpRequests:rows.reduce((n,r)=>n+(r.profile?.httpRequestCount??0),0),meanElapsedMs:Math.round(rows.reduce((n,r)=>n+r.elapsedMs,0)/rows.length),coverageByQuery:queries.map(query=>({query,attempted:rows.filter(r=>r.query===query).length,verified:rows.filter(r=>r.query===query&&r.verifiedAnswer).length}))};
console.log(JSON.stringify(result));summary(`\nTransport completed HTTP 200 for **${rows.filter(r=>r.httpStatus===200).length}/${rows.length}** attempts. Actual Overview text with citations: **${verified}/${rows.length}**. Requests using one HTTP call: **${oneHttp}**. Full 100-request transport pass: **${transportPass}**. This result does not establish guaranteed Overview availability.\n`);
if(!transportPass)process.exitCode=1;
