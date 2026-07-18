import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const renderStart = html.indexOf("function renderAll()");
const renderEnd = html.indexOf("function renderSearchView", renderStart);
const render = html.slice(renderStart, renderEnd);

assert.ok(html.includes("body.performance-mode * { filter: none !important; }"), "Strict safe mode must disable filter effects");
assert.ok(html.includes("transition: none !important"), "Strict safe mode must disable transitions");
assert.ok(!render.includes("renderLiveRhythm()"), "Hidden live rhythm must not compute on the dashboard");
assert.ok(!render.includes("renderActionCompass()"), "Hidden action compass must not compute on the dashboard");
assert.ok(!render.includes("renderDailyFlow()"), "Hidden daily flow must not compute on the dashboard");
assert.ok(!render.includes("renderAutomations()"), "Hidden automations must not compute on the dashboard");
assert.ok(!html.includes('behavior: "smooth"'), "Programmatic smooth scrolling must be disabled");
assert.ok(html.includes("Sürekli Firebase dinlemesi kapalı"), "UI must disclose manual remote refresh mode");

console.log("Strict device-safe mode checks passed");
