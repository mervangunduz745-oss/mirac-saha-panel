import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

for (const marker of [
  'id="liveFieldQueue"',
  'const DEFAULT_PRODUCTION_ASSIGNEE = "Mahmud"',
  'id="workerFinanceNotice"',
  'data-edit-order',
  'data-cancel-tx',
  'data-edit-debt-payment',
  'function editDebtPayment',
  'function editCariCard',
  'function toggleCariCardArchive',
  'function editDebtPlan',
  'function editFixedExpense',
  'id="inventoryEditCode"',
  'byId("salesTable").addEventListener',
  'byId("purchaseTable").addEventListener'
]) {
  assert.ok(html.includes(marker), `Record action marker missing: ${marker}`);
}

assert.ok(html.includes('tx.status = "İptal"'), "Transaction cancellation must be a soft status change");
assert.ok(html.includes("Kayıt silinmez"), "Cancellation copy must state that history is preserved");
assert.ok(html.includes('"ARCHIVE_CARI_CARD"'), "Cari archive must be logged");
assert.ok(html.includes('Object.assign(existingTx, tx)'), "Transaction correction must update the existing record");
assert.ok(html.includes('Object.assign(existing, item)'), "Stock correction must preserve the existing card identity");

console.log("Cross-module correction, cancellation, archive and Mahmud role checks passed");
