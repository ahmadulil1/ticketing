// Run: node src/lib/devices.test.mjs
import assert from 'node:assert/strict';
import { deviceRows } from './devices.mjs';
const rows = deviceRows([{ device_id: 'a', device_name: 'PC-A' }, { device_id: 'b' }], [{ id: '1', device_id: 'a' }, { id: '2', device_id: 'a' }, { id: '3', device_id: null }]);
assert.equal(rows.length, 4);
assert.equal(rows.filter(row => row.device_id === 'a').length, 2);
assert.equal(rows.find(row => row.rowId === '1').device_name, 'PC-A');
assert(rows.some(row => row.rowId === '3'));
assert(rows.some(row => row.rowId === 'b'));
console.log('PASS device/inventory join preserves duplicates, unlinked assets and devices');
