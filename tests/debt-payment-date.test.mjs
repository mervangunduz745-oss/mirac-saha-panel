import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

assert.ok(html.includes('id="debtPaymentDate" type="date" required'), "Debt payment must offer a required date picker");
assert.ok(html.includes('byId("debtPaymentDate").value = today'), "Payment date must default to today");
assert.ok(html.includes("const paymentDate = byId(\"debtPaymentDate\").value"), "Selected date must be read on submit");
assert.ok(html.includes("date: paymentDate"), "Debt transaction must persist the selected payment date");
assert.ok(html.includes("date: paymentDate, amount: payAmount"), "Audit log must include the selected payment date");
assert.ok(!html.slice(html.indexOf("function payDebtPlan"), html.indexOf("function submitDebtPayment")).includes("prompt("), "Debt payment must use the dated form, not a prompt");

console.log("Debt payment date checks passed");
