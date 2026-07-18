import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const start = html.indexOf("async function resetFinanceCloudData()");
const end = html.indexOf('byId("nav").addEventListener', start);
const reset = html.slice(start, end);

assert.notEqual(start, -1, "Finance and production cloud reset must exist");
assert.ok(html.includes('id="resetFinanceCloud"'), "Settings must expose the reset button");
assert.ok(reset.includes('confirmation !== "KAYITLARI SİL"'), "Permanent deletion must require exact typed confirmation");
assert.ok(reset.includes('cloud.saveBackup(clone(state), clientId, "finans-uretim-sifirlama-oncesi")'), "Cloud backup must precede deletion");
for (const collection of ["transactions", "cariCards", "debtPlans", "fixedExpenses", "productionJobs", "logs"]) {
  assert.ok(reset.includes(`state.${collection} = []`), `${collection} must be cleared`);
}
for (const collection of ["accounts", "items", "recipes"]) {
  assert.ok(!reset.includes(`state.${collection} = []`), `${collection} must be preserved`);
}
assert.ok(reset.includes("await pushCloudState()"), "Deletion must be pushed to Firebase immediately");
assert.ok(reset.includes("if (remaining) throw new Error"), "Deletion must verify that records did not return");

console.log("Finance and production Firebase reset checks passed");
