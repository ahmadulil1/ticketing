const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = p => readFileSync(resolve(__dirname, '..', p), 'utf8');
const server = read('server/src/app.ts');
const condition = server.match(/if \((data.type === "remote_frame" && target.bufferedAmount > 1024 \* 1024)\) continue;/);
assert(condition, 'Video relay must bound outbound queue');
const drop = new Function('data', 'target', `return ${condition[1]}`);
assert.equal(drop({ type: 'remote_frame' }, { bufferedAmount: 2 ** 21 }), true);
assert.equal(drop({ type: 'remote_frame' }, { bufferedAmount: 0 }), false);
assert.equal(drop({ type: 'remote_input' }, { bufferedAmount: 2 ** 21 }), false);
const desktop = read('desktop/src/components/PetOverlay.tsx');
assert(desktop.includes('if (capturing ||'));
assert(desktop.includes('finally {\n          capturing = false;'));
assert(desktop.includes('if (disposed) u();'));
const rust = read('desktop/src-tauri/src/remote_stream.rs');
assert(!rust.includes('app.emit("remote-frame", payload)'), 'Do not broadcast duplicate targeted frame');
assert(read('web/src/components/RemoteControl.tsx').includes('clearTimeout(retryTimer)'));
const viewer = read('web/src/components/RemoteControl.tsx');
for (const handler of ['handleMouseDown', 'handleMouseUp']) {
  const section = viewer.split(`const ${handler} =`)[1].split('[sendInput]')[0];
  assert(section.indexOf('type: "MouseMove"') < section.indexOf(`type: "${handler === 'handleMouseDown' ? 'MouseDown' : 'MouseUp'}"`));
}
assert.equal(read('desktop/src-tauri/src/remote_windows.rs').split('flag | MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE').length - 1, 2);
assert(viewer.includes('image.decode().then('), 'Decode replacement before presenting it');
assert(viewer.includes('draggable={false}'), 'Remote clicks must not start browser image drag');
assert(viewer.includes('screenRef.current?.focus({ preventScroll: true })'));
console.log('PASS: remote queue limits, capture guard, listener cleanup, reconnect cleanup');
