import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

assert.ok(html.includes('<option value="MAHSUP">Mahsup</option>'), "Mahsup must be selectable");
assert.ok(html.includes('id="mahsupDirection"'), "Mahsup direction must be explicit");
assert.ok(html.includes('mahsupDirection: type === "MAHSUP"'), "Mahsup direction must be persisted");

const deriveStart = html.indexOf("function derive()");
const deriveEnd = html.indexOf("function fixedMonthlyAmount", deriveStart);
const derive = html.slice(deriveStart, deriveEnd);
const mahsupStart = derive.indexOf('if (tx.type === "MAHSUP")');
assert.notEqual(mahsupStart, -1, "Mahsup accounting must exist");
const mahsup = derive.slice(mahsupStart, derive.indexOf("\n        if (tx.type", mahsupStart + 1));
assert.ok(mahsup.includes("c.payments += amount"), "Supplier mahsup must reduce payable balance");
assert.ok(mahsup.includes("c.collections += amount"), "Customer mahsup must reduce receivable balance");
assert.ok(!mahsup.includes("cashAdd("), "Mahsup must not affect cash or bank balances");

console.log("Mahsup accounting checks passed");
