import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

for (const id of [
  "toolsMenuButton",
  "toolsMenu",
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

console.log("Command center task and tools navigation checks passed");
