import {sdk} from '../dist/index.js';
import {createHash} from 'node:crypto';
import {appendFileSync} from 'node:fs';

// Explicit manual integration check; the default test suite never imports this file.
const queries = [
  'The Catherine',
  'apartments in Austin Texas',
  'apartments in austin texas for rent',
  'apartments in austin texas near the university',
  'apartments in austin texas downtown',
  'apartments in austin texas under $1000',
  'apartments in austin texas cheap',
];
const profile = {country:'US',language:'en',location:'Austin,Texas,United States',device:'desktop'};
const session = process.env.AI_SEARCH_LIVE_SESSION ?? 'fresh';
if (!['fresh','reuse'].includes(session)) throw new Error('AI_SEARCH_LIVE_SESSION must be fresh or reuse');
const requested = Number(process.env.AI_SEARCH_LIVE_REQUESTS ?? 7);
if (![7,100].includes(requested)) throw new Error('AI_SEARCH_LIVE_REQUESTS must be 7 or 100');
const intervalMs = requested === 100 ? 6000 : 15000;
const client = sdk({session,ipFamily:'ipv4',traffic:{maxConcurrent:1,minIntervalMs:intervalMs,cooldownMs:60000}});
const summary = text => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,text); };
const cell = value => String(value ?? '').replace(/[&<>|`\r\n]/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','|':'&#124;','`':'&#96;','\r':' ','\n':' '})[character]);
const shortText = (value,max=100) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
function directPublisher(value) {
  try { const url = new URL(value); return url.protocol==='https:' && !/(^|\.)google\.[a-z.]+$/.test(url.hostname) ? url.hostname : undefined; }
  catch { return undefined; }
}
function sourceLocation(value) {
  try { const url = new URL(value); return {origin:url.origin,path:url.pathname}; }
  catch { return undefined; }
}
summary(`## Native Linux live smoke\n\n${requested} fresh requests cycling seven exact queries; US/en/Austin desktop; session mode **${session}**; IPv4; no answer cache or publisher URL resolution. One attempt each, with ${intervalMs/1000}-second start spacing. Stop at the first access denial, redirect or error. No raw HTML, cookies, session URLs, or artifacts are retained.\n\n| Query | Overview | HTTP | Time (ms) | Text characters | Citations | Organic | Verified text + citations |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n`);
let verified = 0, attempted = 0, lastStarted = 0;
const rows = [];
for (let index=0; index<requested; index++) {
  const query=queries[index%queries.length];
  const delay=intervalMs-(performance.now()-lastStarted);
  if(lastStarted && delay>0) await new Promise(resolve=>setTimeout(resolve,delay));
  lastStarted=performance.now();
  const started = performance.now(), startedAt = new Date().toISOString();
  let row;
  try {
    const data = await client.search.get(query,{...profile,resolveSources:false});
    const ai = data.result?.aioverview;
    const text = ai?.text?.trim() ?? '';
    const citations = ai?.sources ?? [];
    const validCitations = citations.filter(source => { try { return /^https?:$/.test(new URL(source.url).protocol); } catch { return false; } });
    const overviewStatus = data.metadata.aiOverview.status;
    const verifiedAnswer = overviewStatus==='present' && text.length>0 && validCitations.length>0;
    if (verifiedAnswer) verified++;
    row = {index:index+1,query,startedAt,elapsedMs:Math.round(performance.now()-started),httpStatus:data.metadata.httpStatus,searchStatus:data.metadata.searchStatus,overviewStatus,verifiedAnswer,textLength:text.length,textSha256:text?createHash('sha256').update(text).digest('hex'):undefined,textPrefix:shortText(text),citations:citations.length,validCitationUrls:validCitations.length,citationSample:citations.slice(0,3).map(source=>({title:shortText(source.label,80),publisher:directPublisher(source.url)})),organicCount:data.result?.organicResults?.length??0,sourceLocation:sourceLocation(data.metadata.sourceUrl),accessReason:overviewStatus==='blocked'?data.metadata.aiOverview.reason:undefined,errorCode:data.error?.code,retryAfterMs:data.metadata.retryAfterMs};
  } catch (error) {
    // Error messages can contain URLs; record stable classification only.
    row = {index:index+1,query,startedAt,elapsedMs:Math.round(performance.now()-started),overviewStatus:'error',verifiedAnswer:false,errorKind:shortText(error?.kind??error?.name,40),errorCode:shortText(error?.code,50)};
  }
  console.log(JSON.stringify(row));
  attempted++; rows.push(row);
  summary(`| ${cell(query)} | ${cell(row.overviewStatus)} | ${cell(row.httpStatus)} | ${row.elapsedMs} | ${row.textLength??0} | ${row.citations??0} | ${row.organicCount??0} | ${row.verifiedAnswer?'yes':'no'} |\n`);
  if (row.overviewStatus==='error' || row.overviewStatus==='blocked' || row.httpStatus!==200) break;
}
summary(`\nVerified actual nonempty Overview text with citation URLs: **${verified}/${requested}**. Google can withhold an Overview or deny access; these outcomes remain explicit. This check is not an availability or latency guarantee.\n`);
const accepted=rows.filter(row=>row.httpStatus===200&&row.searchStatus==='results');
const timings=accepted.map(row=>row.elapsedMs).sort((a,b)=>a-b);
const transportPass=attempted===requested&&accepted.length===requested;
const result={type:'summary',session,verified,attempted,requested,allVerified:verified===requested,transportPass,accepted:accepted.length,medianAcceptedMs:timings[Math.floor(timings.length/2)],p95AcceptedMs:timings[Math.ceil(timings.length*.95)-1],coverage:queries.map(query=>({query,attempted:rows.filter(row=>row.query===query).length,verified:rows.filter(row=>row.query===query&&row.verifiedAnswer).length}))};
console.log(JSON.stringify(result));
summary(`\nAccepted Search responses: **${accepted.length}/${attempted}**. Full requested transport pass: **${transportPass}**. Answer-cache bypass does not control Google's own cache.\n`);
if (verified!==requested) process.exitCode=1;
