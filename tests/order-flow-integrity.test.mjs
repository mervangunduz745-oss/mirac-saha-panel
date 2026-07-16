import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = html.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = html.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return html.slice(startIndex, endIndex);
}

const genericTypes = between('<select id="txType">', "</select>");
assert.ok(!genericTypes.includes('value="SIPARIS"'), "Generic movement form must not create orphan orders");
assert.ok(!genericTypes.includes('value="URETIM"'), "Generic movement form must not create orphan production records");

const derive = between("function derive()", "function fixedMonthlyAmount");
const orderAccounting = derive.slice(
  derive.indexOf('if (tx.type === "SIPARIS")'),
  derive.indexOf('if (tx.type === "ALIS")')
);
assert.ok(orderAccounting.includes("c.advances += paid"), "Open-order deposits must be tracked as advances");
assert.ok(!orderAccounting.includes("c.sales += amount"), "Orders must not post sales revenue before delivery");

const addOrder = between("function addOrder(event)", "function advanceProductionJob");
assert.ok(addOrder.includes("tx.productionJobId = job.id"), "Order must store its production job ID");
assert.ok(addOrder.includes("sourceTx: tx.id"), "Production job must store its source order ID");

const finalize = between("function saleFromProductionJob(id)", "function addFixedExpense");
assert.ok(finalize.includes("pendingTradeLink ="), "Delivered production must open a structured sale link");
assert.ok(finalize.includes("sourceOrderId:"), "Sale link must carry the source order ID");
assert.ok(finalize.includes('byId("txDate").value = today'), "Sale date must use the actual delivery day");

const addTransaction = between("function addTransaction(event)", "function undoLastTransaction");
assert.ok(addTransaction.includes("productionJobId: tradeLink?.productionJobId"), "Sale must persist the production job ID");
assert.ok(addTransaction.includes("sourceOrderId: tradeLink?.sourceOrderId"), "Sale must persist the order ID");
assert.ok(addTransaction.includes("işi ${duplicate.id} satışıyla zaten kaydedilmiş"), "Duplicate sale must be blocked");
assert.ok(addTransaction.includes('linkedOrder.status = "Teslim"'), "Final sale must close the source order");
assert.ok(addTransaction.includes("Kapora ile teslimde alınan toplam"), "Order advance plus delivery payment must be bounded");
assert.ok(addTransaction.includes("party: linkedOrder.party"), "Final sale identity must come from the linked order");
assert.ok(addTransaction.includes("amount: Number(linkedOrder.amount || 0)"), "Final sale amount must come from the linked order");
assert.ok(addTransaction.includes("Bağlı sipariş bulunamadı"), "Final sale must stop when its source order is missing");
assert.ok(addTransaction.includes("Sipariş ile üretim işi aynı akışa bağlı değil"), "Final sale must stop on lineage mismatch");

const addWorkOrder = between("function addWorkOrder(event)", "function addOrder(event)");
assert.ok(addWorkOrder.includes("customer: linkedOrder.party"), "Linked production edits must preserve order customer");
assert.ok(addWorkOrder.includes("product: linkedOrder.item"), "Linked production edits must preserve order product");

assert.ok(html.includes("function flowIntegrityIssues()"), "Business-flow integrity audit must exist");
assert.ok(html.includes("function migrateOrderFlowLinks(targetState)"), "Legacy order-flow records must have a deterministic migration");
assert.ok(html.includes("const flowMigration = migrateOrderFlowLinks(state)"), "Cloud-loaded legacy records must run through the flow migration");
assert.ok(html.includes("cloudDirty = canWriteCloudMigrations() && migrationChanged"), "Read-only and worker roles must not push automatic migrations");
assert.ok(html.includes("Akış kritik sorunu"), "Technical status must separate critical business-flow issues");
assert.ok(html.includes("Akış kontrol uyarısı"), "Technical status must expose non-blocking business-flow warnings");
assert.ok(html.includes("Tekrarlı hareket ID"), "Data audit must detect duplicate transaction identities");
assert.ok(html.includes("Tekrarlı üretim işi ID"), "Data audit must detect duplicate production identities, including cancelled rows");
assert.ok(html.includes('data-mobile-view="sales">Satış</button>'), "Mobile workflow must expose Sales");
assert.ok(html.includes('class="flow-rail"'), "Order page must show the three-step workflow");
assert.ok(html.includes("--lv-violet"), "Lovable-inspired design tokens must exist");
assert.ok(html.includes('class="panel technical-panel"'), "Technical details must be collapsible");

const renderControl = between("function renderControl()", "function renderCashPos");
assert.ok(renderControl.includes("safe(issue.title)"), "Integrity issue titles must be HTML-escaped");
assert.ok(renderControl.includes("safe(issue.text)"), "Integrity issue details must be HTML-escaped");
const populateFormLists = between("function populateFormLists()", "function updateFormMode");
assert.ok(populateFormLists.includes("safe(item.code)"), "Imported stock codes must be escaped in form options");
assert.ok(populateFormLists.includes("safe(item.name)"), "Imported stock names must be escaped in form options");
const renderGuide = between("function renderGuide()", "function dailyFlowState");
assert.ok(renderGuide.includes("safe(item.text)"), "Worker-controlled production warnings must be HTML-escaped");

console.log("Order → Production → Sale integrity checks passed");
