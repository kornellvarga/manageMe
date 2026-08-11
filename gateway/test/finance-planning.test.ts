import assert from "node:assert/strict";
import test from "node:test";
import { applyFinanceCommand, createEmptyFinanceLedger, financePlanSummary } from "../src/finance";
import type { FinanceCommand, FinanceLedger } from "../src/finance";

function apply(ledger: FinanceLedger, type: FinanceCommand["type"], payload: Record<string, unknown>, requestId: string) {
  return applyFinanceCommand(ledger, { requestId, profileId: "kornel", actor: "assistant", type, payload }, new Date("2026-08-12T00:00:00Z"));
}

test("monthly budgets, allocations, and planned payments stay independent from categories", () => {
  let ledger = createEmptyFinanceLedger(new Date("2026-08-12T00:00:00Z"));
  let result = apply(ledger, "add_budget", { name: "Pocket Money", month: "2026-08", amountCents: 500000, currencyCode: "TRY" }, "req_budget");
  ledger = result.ledger;
  const budgetId = result.entityId!;

  result = apply(ledger, "add_entry", { type: "EXPENSE", category: "Coffee", amountCents: 18000, currencyCode: "TRY", name: "Coffee" }, "req_entry");
  ledger = result.ledger;
  const entryId = result.entityId!;

  result = apply(ledger, "set_allocation", { entryId, budgetId }, "req_allocate");
  ledger = result.ledger;

  result = apply(ledger, "add_commitment", { name: "Telekom", month: "2026-08", plannedAmountCents: 120000, currencyCode: "TRY", category: "Bills", repeatMonthly: true }, "req_commitment");
  ledger = result.ledger;
  const commitmentId = result.entityId!;

  result = apply(ledger, "link_commitment", { id: commitmentId, entryId }, "req_link");
  ledger = result.ledger;

  const summary = financePlanSummary(ledger, "2026-08");
  assert.equal(summary.budgets[0].name, "Pocket Money");
  assert.equal(summary.budgets[0].spentCents, 18000);
  assert.equal(summary.budgets[0].remainingCents, 482000);
  assert.equal(summary.budgets[0].status, "available");
  assert.equal(summary.commitments[0].paid, true);
  assert.equal(summary.commitments[0].actualAmountCents, 18000);
  assert.equal(summary.commitments[0].varianceCents, -102000);
  assert.equal(summary.commitments[0].status, "under_plan");
  assert.equal(summary.insights.available[0].name, "Pocket Money");
  assert.equal(summary.insights.underPlan[0].name, "Telekom");
  assert.equal(ledger.entries[0].category, "Coffee");
});

test("plan summary highlights overspent budgets, over-plan payments, and unpaid payments", () => {
  let ledger = createEmptyFinanceLedger(new Date("2026-08-12T00:00:00Z"));
  let result = apply(ledger, "add_budget", { name: "Pocket Money", month: "2026-08", amountCents: 10000, currencyCode: "TRY" }, "req_budget_over");
  ledger = result.ledger;
  const budgetId = result.entityId!;

  result = apply(ledger, "add_entry", { type: "EXPENSE", category: "Coffee", amountCents: 12000, currencyCode: "TRY", name: "Coffee" }, "req_entry_over");
  ledger = result.ledger;
  const entryId = result.entityId!;
  result = apply(ledger, "set_allocation", { entryId, budgetId }, "req_allocate_over");
  ledger = result.ledger;

  result = apply(ledger, "add_commitment", { name: "Telekom", month: "2026-08", plannedAmountCents: 10000, currencyCode: "TRY", category: "Bills" }, "req_commit_over");
  ledger = result.ledger;
  const paidId = result.entityId!;
  result = apply(ledger, "link_commitment", { id: paidId, entryId }, "req_link_over");
  ledger = result.ledger;

  result = apply(ledger, "add_commitment", { name: "Rent", month: "2026-08", plannedAmountCents: 50000, currencyCode: "TRY", category: "Rent" }, "req_commit_unpaid");
  ledger = result.ledger;

  const summary = financePlanSummary(ledger, "2026-08");
  assert.equal(summary.budgets[0].status, "overspent");
  assert.equal(summary.budgets[0].remainingCents, -2000);
  assert.equal(summary.commitments.find((item) => item.id === paidId)?.status, "over_plan");
  assert.equal(summary.commitments.find((item) => item.id === paidId)?.varianceCents, 2000);
  assert.equal(summary.insights.overspent.length, 2);
  assert.equal(summary.insights.unpaid.length, 1);
  assert.equal(summary.insights.unpaid[0].name, "Rent");
});
