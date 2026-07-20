import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sw = fs.readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const start = html.indexOf("function renderAll()");
const end = html.indexOf("function openCashEntry", start);
const render = html.slice(start, end);

assert.ok(render.includes('const activeView = document.querySelector(".tab-view.active")?.id'), "Full render must detect the visible view");
assert.ok(render.includes('if (activeView === "dashboard")'), "Dashboard rendering must be scoped");
assert.ok(render.includes('if (activeView === "catalog") renderCatalog()'), "Catalog must render only when opened");
assert.ok(render.includes('if (activeView === "moves") renderMoves()'), "Full movement table must render only when opened");
assert.ok(html.includes("const movesOpen = document.querySelector"), "Dashboard must not build the hidden full movement table");
assert.ok(html.includes("renderMobileCommandBar();\n      renderAll();"), "Opening a view must render its content on demand");
assert.ok(!html.slice(html.lastIndexOf("clearWorkOrderForm();"), html.indexOf("async function disableOfflineWorker")).includes("renderAll();"), "Startup must wait for validated cloud/local state before rendering business views");
assert.ok(sw.includes('CACHE_NAME = "mirac-erp-shell-v42-pages"'), "Service Worker cache must be refreshed for the performance release");

console.log("Lazy view rendering and cache refresh checks passed");
