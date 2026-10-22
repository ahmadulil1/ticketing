// Run: node tests/chat-layout.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../../src');
const chat = fs.readFileSync(path.join(root, 'components/ChatView.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
assert(!chat.includes('scrollIntoView'));
assert(chat.includes('if (followBottom.current)'));
assert(chat.includes('ResizeObserver'));
assert(chat.indexOf('className="chat-scroll"') < chat.indexOf('className="ticket-header-info"'));
assert.match(css, /\.chat-scroll \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
assert.match(css, /\.chat-scroll \.attachment-gallery\.compact button \{ width: 80px; height: 60px;/);
console.log('PASS chat layout: bounded scroll, compact report gallery, no unconditional scrollIntoView');
