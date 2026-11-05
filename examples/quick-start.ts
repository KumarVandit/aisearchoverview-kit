import { sdk } from '../src/index.js';

const search = sdk();
const overview = await search.overview.get('why is the sky blue', { country: 'US', language: 'en' });
if (overview.status === 'present') {
  console.log(overview.markdown ?? overview.text);
  for (const source of overview.sources) console.log(source.position, source.title, source.url);
} else console.log(overview.status, overview.reason);
