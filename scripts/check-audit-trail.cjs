const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");

// 1. Check server routes in server/src/routes/tickets.ts
const serverCode = readFileSync(resolve(root, "server/src/routes/tickets.ts"), "utf8");

assert(serverCode.includes('fastify.get("/:id/audit"'), "Audit trail GET route missing");
assert(serverCode.includes("SELECT a.id, a.action, a.old_value, a.new_value"), "Audit log query missing fields");
assert(serverCode.includes("FROM audit_logs a"), "Audit log query must read from audit_logs");
assert(serverCode.includes("LEFT JOIN users u ON u.id = a.actor_id"), "Audit log query must join users");

// Check audit insertion on assign
const assignSection = serverCode.split('fastify.patch("/:id/assign"')[1]?.split('fastify.get("/:id/audit"')[0];
assert(assignSection && assignSection.includes("INSERT INTO audit_logs"), "Assign route must log to audit_logs");
assert(assignSection.includes("'assigned'"), "Assign route must log 'assigned' action");

// Check audit insertion on ticket creation
assert(serverCode.includes("'ticket_created'"), "Ticket creation must log 'ticket_created' to audit_logs");

// 2. Check web frontend in web/src/pages/TicketDetail.tsx
const webCode = readFileSync(resolve(root, "web/src/pages/TicketDetail.tsx"), "utf8");
assert(webCode.includes("/tickets/${id}/audit"), "TicketDetail must fetch audit logs from /audit");
assert(webCode.includes("ticket-audit"), "TicketDetail must render ticket-audit section");
assert(webCode.includes("Riwayat Aktivitas"), "TicketDetail must show Riwayat Aktivitas label");

// 3. Check CSS in web/src/index.css
const cssCode = readFileSync(resolve(root, "web/src/index.css"), "utf8");
assert(cssCode.includes(".ticket-audit"), "CSS must style .ticket-audit");
assert(cssCode.includes(".ticket-audit-item"), "CSS must style .ticket-audit-item");

console.log("PASS: Audit trail checks passed.");
