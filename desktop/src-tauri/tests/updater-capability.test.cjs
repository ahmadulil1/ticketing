// Run: node tests/updater-capability.test.cjs (from src-tauri)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const capability = JSON.parse(fs.readFileSync(path.join(root, 'capabilities/updater.json')));
assert.deepEqual(capability.windows, ['pet-overlay']);
assert(capability.permissions.includes('updater:default'));
assert(capability.permissions.includes('process:allow-restart'));
assert(!capability.remote);
console.log('PASS updater check/install/restart capability limited to local pet window');
