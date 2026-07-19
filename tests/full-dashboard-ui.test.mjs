import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

assert.ok(html.includes('data-view="analytics">Dashboard</button>'), "Main navigation must expose Dashboard");
assert.ok(html.includes('id="analytics"'), "Dashboard must be a separate view");
assert.ok(html.includes("function renderFullDashboard()"), "Dashboard must render live metrics");
assert.ok(html.includes('if (activeView === "analytics") renderFullDashboard()'), "Dashboard must render on demand");

for (const id of [
  "fullDashboardHealth",
  "fullStatGrid",
  "fullFinanceBars",
  "fullOrderPulse",
  "fullProductionStats",
  "fullRecentList"
]) {
  assert.ok(html.includes(`id="${id}"`), `${id} must exist`);
}

for (const view of ["entry", "sales", "production", "stock", "cari", "fixed", "moves"]) {
  assert.ok(html.includes(`data-full-view="${view}"`), `Dashboard must link to ${view}`);
}

assert.ok(html.includes("showView(button.dataset.fullView)"), "Dashboard action buttons must open their pages");
assert.ok(html.includes("activeTransactions()"), "Dashboard must calculate from active records");
assert.ok(html.includes("m.openOrders.length"), "Dashboard must expose open orders");
assert.ok(html.includes("m.jobs.open.length"), "Dashboard must expose active production");
assert.ok(html.includes("m.lowCount"), "Dashboard must expose stock alerts");

console.log("Full-color dashboard data and navigation checks passed");
