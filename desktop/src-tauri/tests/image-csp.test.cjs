// Run: node tests/image-csp.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../tauri.conf.json')));
const policy = config.app.security.csp;
const sources = policy.split(';').map(part => part.trim()).find(part => part.startsWith('img-src ')).split(/\s+/).slice(1);
assert(sources.includes('https://ticketing.marisoncloud.com'));
assert(!sources.includes('*'));
assert(!sources.includes('https:'));
console.log('PASS attachment images allowed only from trusted Ticketing origin');
