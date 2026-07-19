import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

for (const id of [
  "toolsMenuButton",
  "toolsMenu",
  "liveStatusStrip",
  "liveProgress",
  "liveTasksDialog",
  "liveTasksList",
  "closeLiveTasks",
  "resetLiveTasks"
]) {
  assert.ok(html.includes(`id="${id}"`), `${id} must exist`);
}

for (const view of ["production", "stock", "cari", "fixed", "debt", "moves", "settings", "control"]) {
  assert.ok(html.includes(`data-tools-view="${view}"`), `Tools menu must expose ${view}`);
}

assert.ok(
  html.includes("showView(button.dataset.toolsView)"),
  "Tools menu selections must open their target view"
);
assert.ok(
  html.includes('event.target.closest("#openLiveTasks")'),
  "Progress card must open the task dialog"
);
assert.ok(
  html.includes('byId("liveTasksDialog").showModal()'),
  "Task dialog must open modally"
);
assert.ok(
  html.includes("done[input.dataset.liveTask] = input.checked"),
  "Task checkbox changes must update daily state"
);
assert.ok(
  html.includes("localStorage.setItem(DAILY_FLOW_KEY"),
  "Task completion must persist locally"
);
assert.ok(
  html.includes("renderLiveOperations();"),
  "Task completion must refresh live progress"
);
assert.ok(html.includes("<h2>Alarm Merkezi</h2>"), "Command center must expose a single Alarm Merkezi");
for (const priority of ['key: "critical"', 'key: "warning"', 'key: "info"']) {
  assert.ok(html.includes(priority), `Alarm center must include ${priority}`);
}
assert.ok(
  html.includes('alertRows.filter(row => row.severity === group.key)'),
  "Alarm center must group records by priority"
);
for (const label of ["Açık iş emri", "Günün tahsilat hedefi", "Kritik alarmlar"]) {
  assert.ok(html.includes(label), `Fast decision strip must expose ${label}`);
}
assert.ok(html.includes('data-open-daily-collection'), "Collection status card must expose a quick action");
assert.ok(html.includes('data-jump-view="production"'), "Work-order status card must open Production");
assert.ok(html.includes('data-jump-view="control"'), "Critical status card must open Control");
for (const [module, color] of [
  ["command", "#2E7D32"],
  ["tasks", "#1976D2"],
  ["finance", "#6D4C41"],
  ["alarms", "#E53935"],
  ["stock", "#8E24AA"],
  ["reports", "#0288D1"],
  ["settings", "#455A64"]
]) {
  assert.ok(html.includes(`data-module="${module}"`), `Navigation must expose ${module} module semantics`);
  assert.ok(html.includes(color), `${module} must use ${color}`);
}
assert.ok(
  html.includes("Karargâh vitrini: tam parlak siyah arka sahne"),
  "Command center must use the glossy-black backdrop"
);
assert.ok(html.includes("background-color: #000 !important"), "Command center backdrop must be true black");
assert.ok(
  html.includes("radial-gradient(ellipse at 50% -18%, rgba(255,255,255,.20)"),
  "Command center backdrop must retain a visible gloss highlight"
);

console.log("Command center task and tools navigation checks passed");
