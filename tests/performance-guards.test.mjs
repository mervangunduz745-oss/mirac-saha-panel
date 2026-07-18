import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

assert.ok(html.includes('class="auth-locked dashboard-dark performance-mode"'), "Device-safe performance mode must be enabled by default");
assert.ok(html.includes("body.performance-mode *::after"), "Performance mode must stop continuous pseudo-element animation");
assert.ok(html.includes("backdrop-filter: none !important"), "Performance mode must disable expensive backdrop blur");
assert.ok(html.includes("if (renderCycleActive && renderMetricsCache) return renderMetricsCache"), "One render cycle must reuse computed metrics");
assert.ok(html.includes("if (renderCycleActive) return;"), "Nested full renders must be blocked");
assert.ok(html.includes("setTimeout(renderSearchView, 220)"), "Search rendering must be debounced and scoped to the active view");
assert.ok(html.includes('document.querySelector(".tab-view.active")?.id'), "Search must detect and update only the active view");
assert.ok(html.includes('byId("search").addEventListener("input", queueSearchRender)'), "Search must use the controlled render queue");
assert.ok(!html.includes("cloud.subscribeState(handleRemoteSnapshot"), "Continuous Firebase listeners must stay disabled in device-safe mode");
assert.ok(!html.includes('navigator.serviceWorker.register("./sw.js")'), "Service Worker registration must stay disabled");
assert.ok(html.includes("registration.unregister()"), "Existing Service Workers must be removed safely");
assert.ok(html.includes('key.startsWith("mirac-erp-shell-")'), "Old ERP caches must be deleted");

console.log("Performance and device-safety guards passed");
