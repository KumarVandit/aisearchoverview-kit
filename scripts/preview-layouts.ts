import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { marked } from 'marked';
import { sdk } from '../src/index.js';

const flag = process.argv.indexOf('--output');
if (flag < 0 || !process.argv[flag + 1]) throw new Error('Pass --output DIRECTORY');
const output = resolve(process.argv[flag + 1]!);
const client = sdk();
const sections: string[] = [];
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
for (const [name, file, query] of [
  ['Python code and table', 'aio-python-expanded-projection.html', 'python list comprehension examples'],
  ['Comparison and videos', 'aio-induction-expanded-projection.html', 'induction vs gas stove pros and cons'],
  ['Shopping references', 'aio-shoes-expanded-projection.html', 'running shoes for flat feet'],
]) {
  const html = await readFile(resolve('tests/fixtures/google-search', file!), 'utf8');
  const result = client.overview.parse(html, {sourceUrl: 'https://www.google.com/search?q='+encodeURIComponent(query!)});
  const markdown = result.markdown ?? '';
  sections.push(`<section><h2>${escape(name!)}</h2><p>${result.status}; ${result.sources.length} sources; ${result.status === 'present' ? result.videos?.length ?? 0 : 0} videos</p><details><summary>Structured assets</summary><pre>${escape(JSON.stringify(result.status === 'present' ? {videos:result.videos,productLinks:result.productLinks} : {},null,2))}</pre></details><div class="columns"><pre>${escape(markdown)}</pre><article>${marked.parse(markdown,{async:false,gfm:true})}</article></div></section>`);
}
const followup = client.aiMode.parse(await readFile(resolve('tests/fixtures/ai-mode/local-followup-projection.html'),'utf8'),{sourceUrl:'https://www.google.com/search?udm=50&q=best+breakfast+restaurants+in+Austin+Texas'});
for(const [index,turn] of followup.turns.entries()) sections.push(`<section><h2>AI Mode turn ${index+1}</h2><p>${turn.places?.length??0} place cards; ${turn.images?.length??0} image references</p><div class="columns"><pre>${escape(turn.markdown??'')}</pre><article>${marked.parse(turn.markdown??'',{async:false,gfm:true})}</article></div></section>`);
await mkdir(output,{recursive:true});
await writeFile(join(output,'index.html'),`<!doctype html><html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Google layout regression preview</title><style>body{font:16px system-ui;line-height:1.6;margin:32px;color:#18212b}section{border-top:1px solid #ccd3dc;padding:24px 0}.columns{display:grid;grid-template-columns:1fr 1fr;gap:32px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f8;padding:16px;font:13px ui-monospace,monospace}table{border-collapse:collapse}th,td{border:1px solid #bbc4cf;padding:8px}img{max-width:220px;max-height:160px}a{color:#155ac5}@media(max-width:800px){.columns{grid-template-columns:1fr}}</style><h1>Captured Google layouts → SDK Markdown</h1><p>Sanitized real fixtures: Markdown source beside a GFM rendering. This preview checks structure, not Google's pixel layout. Asset references may expire; some are deliberately redacted in fixtures. Opening this page may load public image URLs. Live AI Mode retrieval remains experimental.</p>${sections.join('')}</html>`);
console.log(join(output,'index.html'));
