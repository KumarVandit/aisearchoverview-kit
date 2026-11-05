import { readFile } from 'node:fs/promises';
import { sdk } from '../src/index.js';

const path = process.argv[2];
if (!path) throw new Error('Provide a saved HTML file');
const result = sdk().overview.parse(await readFile(path, 'utf8'), { sourceUrl: 'https://www.google.com/search?q=why+is+the+sky+blue&hl=en&gl=us' });
console.log(JSON.stringify(result, null, 2));
