const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");

// 1. Database table & seeding
const dbCode = readFileSync(resolve(root, "server/src/database.ts"), "utf8");
assert(dbCode.includes("CREATE TABLE IF NOT EXISTS ticket_templates"), "ticket_templates table missing");
assert(dbCode.includes("seedTicketTemplates"), "seedTicketTemplates function missing");
assert(dbCode.includes("Restart Printer / Spooler"), "Default printer template missing in seed");

// 2. Templates route
const routeCode = readFileSync(resolve(root, "server/src/routes/templates.ts"), "utf8");
assert(routeCode.includes('fastify.get("/"'), "GET / route missing in templates.ts");
assert(routeCode.includes('fastify.post("/"'), "POST / route missing in templates.ts");
assert(routeCode.includes('fastify.patch("/:id"'), "PATCH /:id route missing in templates.ts");
assert(routeCode.includes('fastify.delete("/:id"'), "DELETE /:id route missing in templates.ts");

// 3. App registration
const appCode = readFileSync(resolve(root, "server/src/app.ts"), "utf8");
assert(appCode.includes('import templateRoutes from "./routes/templates.js"'), "templateRoutes import missing in app.ts");
assert(appCode.includes('prefix: "/api/templates"'), "templateRoutes registration missing in app.ts");

// 4. Web components
const pickerCode = readFileSync(resolve(root, "web/src/components/TemplatePicker.tsx"), "utf8");
assert(pickerCode.includes("/templates"), "TemplatePicker must query /templates");
assert(pickerCode.includes("template-picker"), "TemplatePicker class missing");

const ticketDetailCode = readFileSync(resolve(root, "web/src/pages/TicketDetail.tsx"), "utf8");
assert(ticketDetailCode.includes("<TemplatePicker"), "TemplatePicker must be mounted in TicketDetail");

// 5. CSS
const cssCode = readFileSync(resolve(root, "web/src/index.css"), "utf8");
assert(cssCode.includes(".template-picker"), "CSS must style .template-picker");
assert(cssCode.includes(".template-menu"), "CSS must style .template-menu");

console.log("PASS: Template (canned response) checks passed.");
