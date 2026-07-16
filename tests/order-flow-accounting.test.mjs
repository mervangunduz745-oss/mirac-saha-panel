import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = html.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = html.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return html.slice(startIndex, endIndex);
}

const productionLinks = between("function linkedProductionJobId", "function unlinkFinalizedSale");
const derive = between("function derive()", "function fixedMonthlyAmount");
const migrateOrderFlowLinks = between("function migrateOrderFlowLinks", "function mergeIncomingState");

function evaluateScenario(state) {
  const context = { state: structuredClone(state) };
  vm.createContext(context);
  vm.runInContext(`
    function isCanceled(row) { return String(row?.status || "").toLocaleLowerCase("tr-TR").includes("iptal"); }
    function activeTransactions() { return (state.transactions || []).filter(tx => !isCanceled(tx)); }
    function activeProductionJobs() { return (state.productionJobs || []).filter(job => !isCanceled({ status: job?.stage })); }
    function itemName(code) { return code || ""; }
    function stockItemClass() { return "Mamül"; }
    function stockProductionType() { return ""; }
    function isStockAlertItem() { return false; }
    ${productionLinks}
    ${derive}
    globalThis.result = { derived: derive(), issues: flowIntegrityIssues() };
  `, context);
  return context.result;
}

function baseState() {
  return {
    accounts: [{ name: "Kasa", opening: 0 }],
    items: [{ code: "M-001", name: "Baza", opening: 0, cost: 0, min: 0, kind: "Mamül" }],
    recipes: [],
    transactions: [],
    productionJobs: []
  };
}

{
  const state = baseState();
  state.transactions.push({
    id: "TX-ORDER-1", type: "SIPARIS", party: "Ali", item: "M-001", qty: 1,
    amount: 1000, paid: 200, account: "Kasa", status: "Sipariş"
  });
  state.productionJobs.push({
    id: "IS-1", sourceTx: "TX-ORDER-1", product: "M-001", customer: "Ali", qty: 1, stage: "İşleme Alındı"
  });
  const { derived, issues } = evaluateScenario(state);
  assert.equal(derived.customers[0].sales, 0, "Open order must not be counted as sale revenue");
  assert.equal(derived.customers[0].collections, 0, "Open-order deposit must not be counted as final collection");
  assert.equal(derived.customers[0].advances, 200, "Open-order deposit must remain an advance");
  assert.equal(derived.customers[0].receivable, 0, "Open order must not create receivable before sale");
  assert.equal(derived.cash.Kasa, 200, "Deposit must enter cash exactly once");
  assert.equal(issues.length, 0, `A valid open order and production link must pass integrity checks: ${JSON.stringify(issues)}`);
}

{
  const state = baseState();
  state.transactions.push(
    {
      id: "TX-ORDER-2", type: "SIPARIS", party: "Ayşe", item: "M-001", qty: 1,
      amount: 1000, paid: 200, account: "Kasa", status: "Teslim", saleTx: "TX-SALE-2"
    },
    {
      id: "TX-SALE-2", type: "SATIS", party: "Ayşe", item: "M-001", qty: 1,
      amount: 1000, paid: 300, account: "Kasa", status: "Kısmi",
      sourceOrderId: "TX-ORDER-2", productionJobId: "IS-2"
    }
  );
  state.productionJobs.push({
    id: "IS-2", sourceTx: "TX-ORDER-2", saleTx: "TX-SALE-2", product: "M-001",
    customer: "Ayşe", qty: 1, stage: "Teslim Edildi"
  });
  const { derived, issues } = evaluateScenario(state);
  assert.equal(derived.customers[0].sales, 1000, "Final sale must post revenue exactly once");
  assert.equal(derived.customers[0].collections, 500, "Advance and delivery payment must combine once");
  assert.equal(derived.customers[0].advances, 0, "Finalized order must no longer remain in advances");
  assert.equal(derived.customers[0].receivable, 500, "Receivable must equal sale less total collection");
  assert.equal(derived.cash.Kasa, 500, "Cash must equal advance plus delivery payment");
  assert.equal(issues.length, 0, "A finalized linked flow must pass integrity checks");
}

{
  const state = baseState();
  state.transactions.push(
    { id: "TX-ORDER-3", type: "SIPARIS", party: "Mehmet", amount: 800, paid: 0, account: "Kasa", status: "Teslim" },
    { id: "TX-SALE-3A", type: "SATIS", party: "Mehmet", amount: 800, paid: 0, account: "Kasa", status: "Vadeli", sourceOrderId: "TX-ORDER-3", productionJobId: "IS-3" },
    { id: "TX-SALE-3B", type: "SATIS", party: "Mehmet", amount: 800, paid: 0, account: "Kasa", status: "Vadeli", sourceOrderId: "TX-ORDER-3", productionJobId: "IS-3" }
  );
  state.productionJobs.push({ id: "IS-3", sourceTx: "TX-ORDER-3", product: "M-001", customer: "Mehmet", stage: "Teslim Edildi" });
  const { issues } = evaluateScenario(state);
  assert.ok(issues.some(issue => issue.title === "Aynı üretim iki kez satılmış"), "Duplicate sales for one job must be detected");
}

console.log("Order-flow accounting scenarios passed");

{
  const context = {
    targetState: {
      transactions: [
        { id: "TX-ORDER-LEGACY", type: "SIPARIS", party: "Zeynep", status: "İptal", cancelledAt: "2026-07-16T09:00:00.000Z", note: "Özel üretim | İptal edildi; hesap etkisi kaldırıldı.", sizeVariant: "160x200", colorVariant: "Gri" },
        { id: "TX-SALE-LEGACY", type: "SATIS", party: "Zeynep", date: "2026-07-16", note: "Teslim edildi | Üretim işi: IS-LEGACY" }
      ],
      productionJobs: [
        { id: "IS-LEGACY", sourceTx: "TX-ORDER-LEGACY", stage: "Teslim Edildi", sizeVariant: "160x200", colorVariant: "Gri" }
      ]
    }
  };
  vm.createContext(context);
  vm.runInContext(`
    function isCanceled(row) { return String(row?.status || "").toLocaleLowerCase("tr-TR").includes("iptal"); }
    ${migrateOrderFlowLinks}
    globalThis.first = migrateOrderFlowLinks(targetState);
    globalThis.second = migrateOrderFlowLinks(targetState);
  `, context);
  const [order, sale] = context.targetState.transactions;
  const [job] = context.targetState.productionJobs;
  assert.equal(sale.productionJobId, "IS-LEGACY", "Legacy note marker must migrate to productionJobId");
  assert.equal(sale.sourceOrderId, "TX-ORDER-LEGACY", "Legacy sale must recover its source order");
  assert.equal(order.productionJobId, "IS-LEGACY", "Legacy order must recover its production job");
  assert.equal(order.saleTx, "TX-SALE-LEGACY", "Legacy order must recover its final sale");
  assert.equal(job.saleTx, "TX-SALE-LEGACY", "Legacy production job must recover its final sale");
  assert.equal(order.status, "Teslim", "Legacy finalized order must close deterministically");
  assert.equal(order.cancelledAt, undefined, "A uniquely sold legacy order must no longer remain cancelled");
  assert.equal(order.note, "Özel üretim", "Automatic cancellation marker must be removed after safe relinking");
  assert.ok(context.first.changed > 0, "First legacy migration must change records");
  assert.equal(context.second.changed, 0, "Order-flow migration must be idempotent");
}

console.log("Legacy order-flow migration scenarios passed");
