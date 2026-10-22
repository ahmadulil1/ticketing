// Run on server: TEST_TOKEN=<admin JWT> node tests/chat-images.test.cjs
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const sharp = require('sharp');
const fs = require('node:fs/promises');

(async () => {
  assert(process.env.TEST_TOKEN, 'TEST_TOKEN required');
  const db = new Pool({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'ticketing', password: process.env.DB_PASSWORD || 'ticketing123', database: process.env.DB_NAME || 'ticketing' });
  const device = randomUUID(), secret = randomUUID();
  const api = 'http://127.0.0.1:3000/api';
  const admin = { Authorization: `Bearer ${process.env.TEST_TOKEN}` };
  let ticket;
  let paths = [];
  try {
    await db.query('INSERT INTO device_credentials (device_id, device_secret) VALUES ($1,$2)', [device, secret]);
    const created = await fetch(`${api}/tickets/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: device, title: 'Image integration test', description: 'Detailed image integration test; temporary record cleaned up after checking.' }) });
    assert.equal(created.status, 201);
    ticket = (await created.json()).id;
    const guest = `device_id=${device}&device_secret=${secret}`;
    const png = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#234567' } }).png().toBuffer();
    for (const internal of [false, true]) {
      const form = new FormData();
      form.append('files', new Blob([png], { type: 'image/png' }), 'test.png');
      const upload = await fetch(`${api}/attachments/ticket/${ticket}`, { method: 'POST', headers: admin, body: form });
      assert.equal(upload.status, 201);
      const attachment = (await upload.json())[0];
      const requestId = randomUUID();
      const payload = JSON.stringify({ body: '', message_type: internal ? 'internal' : 'public', attachment_ids: [attachment.id], clientRequestId: requestId });
      const send = () => fetch(`${api}/messages/ticket/${ticket}`, { method: 'POST', headers: { ...admin, 'Content-Type': 'application/json' }, body: payload });
      const sent = await send();
      assert.equal(sent.status, 201);
      assert.equal((await sent.json()).attachments.length, 1);
      assert.equal((await send()).status, 200, 'retry must be idempotent');
      const image = await fetch(`${api}/attachments/${attachment.id}?token=${encodeURIComponent(process.env.TEST_TOKEN)}`);
      assert.equal(image.status, 200);
      const bytes = Buffer.from(await image.arrayBuffer());
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.equal((await fetch(`${api}/attachments/${attachment.id}?${guest}`)).status, internal ? 403 : 200);
      console.log(`PASS ${internal ? 'internal privacy' : 'public image'} + image-only chat + retry`);
    }
    const listing = await (await fetch(`${api}/attachments/ticket/${ticket}?${guest}`)).json();
    assert.equal(listing.length, 1);
    const detail = await (await fetch(`${api}/tickets/${ticket}?device_id=${device}`)).json();
    assert.equal(detail.attachments.length, 1);
    assert.equal(detail.title, 'Image integration test');
    console.log('PASS gallery/ticket internal filtering + distinct title');
  } finally {
    if (ticket) {
      paths = (await db.query('SELECT storage_path FROM attachments WHERE ticket_id=$1', [ticket])).rows;
      await db.query('DELETE FROM tickets WHERE id=$1', [ticket]);
      for (const file of paths) await fs.unlink(file.storage_path).catch(() => {});
    }
    await db.query('DELETE FROM device_credentials WHERE device_id=$1', [device]);
    await db.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
