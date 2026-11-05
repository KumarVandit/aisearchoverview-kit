import { googleSearch } from '../src/advanced.js';

const query = process.argv.slice(2).join(' ') || 'typescript';
const client = googleSearch({ language: 'en', country: 'us' });

const suggestions = await client.suggest(query);
console.log('Autocomplete:', suggestions.suggestions);

const response = await client.search(query);
console.log(JSON.stringify({
  query: response.query,
  status: response.status,
  organic: response.organic,
  aiOverview: response.aiOverview,
  relatedQuestions: response.relatedQuestions,
  warnings: response.warnings,
}, null, 2));
