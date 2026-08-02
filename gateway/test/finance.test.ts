import assert from "node:assert/strict";
import test from "node:test";
import { applyFinanceCommand, createEmptyFinanceLedger, financeSummary, mergeFinanceSnapshot, type FinanceCommand } from "../src/finance";

function command(requestId: string, type: FinanceCommand["type"], payload: Record<string, unknown>): FinanceCommand {
  return { requestId, profileId: "kornel", actor: "assistant", type, payload };
}

test("device snapshot merges without duplicating a retry", () => {
  const snapshot = {
    requestId: "android_sync_001",
    entries: [{ id: "money_phone_1", type: "EXPENSE", category: "Food", amountCents: 1200, currencyCode: "HUF", name: "Lunch", createdAtMillis: 1000, updatedAtMillis: 1000, actor: "android" }],
    categories: [{ id: "category_phone_1", type: "EXPENSE", name: "Food", sortOrder: 0, updatedAtMillis: 1000 }],
  };
  const first = mergeFinanceSnapshot(createEmptyFinanceLedger(), snapshot);
  assert.equal(first.changed, true);
  assert.equal(first.ledger.entries.length, 1);
  const retry = mergeFinanceSnapshot(first.ledger, snapshot);
  assert.equal(retry.changed, false);
  assert.equal(retry.ledger.entries.length, 1);
});

test("assistant entry commands are idempotent and preserve original currency", () => {
  const first = applyFinanceCommand(createEmptyFinanceLedger(), command("finance_add_001", "add_entry", {
    id: "money_assistant_1",
    type: "expense",
    category: "Travel",
    amountCents: 3250,
    currencyCode: "TL",
    name: "Taxi",
    createdAtMillis: 1000,
  }), new Date(2000));
  assert.equal(first.ledger.entries[0].currencyCode, "TRY");
  const retry = applyFinanceCommand(first.ledger, command("finance_add_001", "add_entry", { type: "EXPENSE" }), new Date(3000));
  assert.equal(retry.changed, false);
  assert.equal(retry.ledger.entries.length, 1);
});

test("newer server edits win over an older device snapshot", () => {
  let ledger = mergeFinanceSnapshot(createEmptyFinanceLedger(), {
    requestId: "android_sync_001",
    entries: [{ id: "money_phone_1", type: "EXPENSE", category: "Food", amountCents: 1200, currencyCode: "HUF", name: "Lunch", createdAtMillis: 1000, updatedAtMillis: 1000, actor: "android" }],
    categories: [],
  }).ledger;
  ledger = applyFinanceCommand(ledger, command("finance_update_001", "update_entry", { id: "money_phone_1", amountCents: 1500 }), new Date(4000)).ledger;
  const stale = mergeFinanceSnapshot(ledger, {
    requestId: "android_sync_002",
    entries: [{ id: "money_phone_1", type: "EXPENSE", category: "Food", amountCents: 1200, currencyCode: "HUF", name: "Lunch", createdAtMillis: 1000, updatedAtMillis: 1000, actor: "android" }],
    categories: [],
  });
  assert.equal(stale.changed, false);
  assert.equal(stale.ledger.entries[0].amountCents, 1500);
});

test("summary keeps currencies separate", () => {
  let ledger = createEmptyFinanceLedger();
  ledger = applyFinanceCommand(ledger, command("finance_add_001", "add_entry", { type: "EXPENSE", category: "Food", amountCents: 1000, currencyCode: "HUF", name: "Lunch", createdAtMillis: 1000 }), new Date(1000)).ledger;
  ledger = applyFinanceCommand(ledger, command("finance_add_002", "add_entry", { type: "INCOME", category: "Refund", amountCents: 500, currencyCode: "EUR", name: "Refund", createdAtMillis: 2000 }), new Date(2000)).ledger;
  const summary = financeSummary(ledger);
  assert.equal(summary.entryCount, 2);
  assert.deepEqual(summary.byCurrency.map((item) => [item.currencyCode, item.expenseCents, item.incomeCents]), [["EUR", 0, 500], ["HUF", 1000, 0]]);
});
