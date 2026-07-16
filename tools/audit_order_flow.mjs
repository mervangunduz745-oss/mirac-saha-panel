import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const backupPath = process.argv[2];
const indexPath = process.argv[3] || path.resolve("public/index.html");

if (!backupPath) {
  console.error("Usage: node tools/audit_order_flow.mjs <backup.json> [public/index.html]");
  process.exit(64);
}

const html = fs.readFileSync(indexPath, "utf8");
const input = JSON.parse(fs.readFileSync(backupPath, "utf8"));

function between(start, end) {
  const startIndex = html.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing start marker: ${start}`);
  const endIndex = html.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`Missing end marker: ${end}`);
  return html.slice(startIndex, endIndex);
}

const migrateSource = between("function migrateOrderFlowLinks", "function mergeIncomingState");
const linkAndAuditSource = between("function linkedProductionJobId", "function unlinkFinalizedSale");
const deriveSource = between("function derive()", "function fixedMonthlyAmount");

const context = { state: structuredClone(input) };
vm.createContext(context);
vm.runInContext(`
  function isCanceled(row) { return String(row?.status || "").toLocaleLowerCase("tr-TR").includes("iptal"); }
  function activeTransactions() { return (state.transactions || []).filter(tx => !isCanceled(tx)); }
  function activeProductionJobs() { return (state.productionJobs || []).filter(job => !isCanceled({ status: job?.stage })); }
  function itemName(code) { return code || ""; }
  function stockItemClass(item) { return item?.itemClass || item?.kind || ""; }
  function stockProductionType(item) { return item?.productionType || ""; }
  function isStockAlertItem(item) { return item?.criticalAlert !== false; }
  ${migrateSource}
  ${linkAndAuditSource}
  ${deriveSource}
  globalThis.preIssues = flowIntegrityIssues();
  globalThis.preDerived = derive();
  globalThis.migration = migrateOrderFlowLinks(state);
  globalThis.postIssues = flowIntegrityIssues();
  globalThis.postDerived = derive();
  globalThis.secondMigration = migrateOrderFlowLinks(state);
`, context);

function issueCounts(issues) {
  return Object.fromEntries(
    [...issues.reduce((map, issue) => map.set(issue.title, (map.get(issue.title) || 0) + 1), new Map())]
      .sort(([left], [right]) => left.localeCompare(right, "tr-TR"))
  );
}

function accounting(derived) {
  return {
    sales: derived.customers.reduce((sum, row) => sum + Number(row.sales || 0), 0),
    collections: derived.customers.reduce((sum, row) => sum + Number(row.collections || 0), 0),
    advances: derived.customers.reduce((sum, row) => sum + Number(row.advances || 0), 0),
    receivable: derived.customers.reduce((sum, row) => sum + Number(row.receivable || 0), 0),
    cash: Object.values(derived.cash).reduce((sum, value) => sum + Number(value || 0), 0)
  };
}

const report = {
  sourceVersion: input.meta?.version || "",
  records: {
    transactions: input.transactions?.length || 0,
    orders: input.transactions?.filter(row => row.type === "SIPARIS").length || 0,
    sales: input.transactions?.filter(row => row.type === "SATIS").length || 0,
    productionJobs: input.productionJobs?.length || 0
  },
  preMigration: {
    issueCount: context.preIssues.length,
    issues: issueCounts(context.preIssues),
    accounting: accounting(context.preDerived)
  },
  migration: context.migration,
  postMigration: {
    issueCount: context.postIssues.length,
    issues: issueCounts(context.postIssues),
    accounting: accounting(context.postDerived)
  },
  idempotent: context.secondMigration.changed === 0
};

console.log(JSON.stringify(report, null, 2));
if (!report.idempotent || context.postIssues.some(issue => issue.severity === "bad")) process.exitCode = 2;
