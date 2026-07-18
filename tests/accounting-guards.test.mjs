import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

const addStart = html.indexOf("function addTransaction(event)");
const addEnd = html.indexOf("function undoLastTransaction", addStart);
const add = html.slice(addStart, addEnd);
assert.ok(add.includes('!tx.party) return alert("Cari / kişi gerekli.'), "Generic movements must reject an empty party");
assert.ok(!add.includes('|| "Tanımsız"'), "Generic movements must not create polluted placeholder parties");
assert.ok(add.includes("tx.amount <= 0"), "Direct movements must reject zero and negative amounts");
assert.ok(add.includes("tx.qty <= 0"), "Trade movements must reject zero and negative quantities");
assert.ok(add.includes("tx.paid < 0"), "Trade movements must reject negative paid amounts");

for (const [start, end, check, message] of [
  ["function addOrder(event)", "function advanceProductionJob", "unitPrice <= 0", "Orders must reject missing or negative prices"],
  ["function addWorkOrder(event)", "function addOrder(event)", "job.qty <= 0", "Production jobs must reject non-positive quantities"],
  ["function addFixedExpense(event)", "function addCariCard(event)", "row.amount <= 0", "Fixed expenses must reject non-positive amounts"],
  ["function addCariOpening(event)", "function addDebtPlan(event)", "amount <= 0", "Opening balances must reject non-positive amounts"]
]) {
  const block = html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  assert.ok(block.includes(check), message);
}

const undoStart = html.indexOf("function undoLastTransaction()");
const undoEnd = html.indexOf("function cancelTransaction", undoStart);
const undo = html.slice(undoStart, undoEnd);
assert.ok(undo.includes('!isCanceled(removed) && removed.type === "BORC_ODEME"'), "Undo must not reverse an already-cancelled debt payment twice");

const debtRenderStart = html.indexOf("function renderDebtPlans()");
const debtRenderEnd = html.indexOf("function renderStock()", debtRenderStart);
const debtRender = html.slice(debtRenderStart, debtRenderEnd);
for (const field of ["row.id", "row.type", "row.party", "row.account"]) {
  assert.ok(debtRender.includes(`safe(${field}`), `Debt table must escape ${field}`);
}

console.log("Accounting guards and debt rendering checks passed");
