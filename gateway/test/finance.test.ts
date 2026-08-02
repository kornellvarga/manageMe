import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFinanceCommand,
  archivedFinanceEntries,
  createEmptyFinanceLedger,
  financeSummary,
  mergeFinanceSnapshot,
  type FinanceCommand,
} from "../src/finance";

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

test("archived entries stop affecting current summaries and can be restored", () => {
  let ledger = createEmptyFinanceLedger();
  ledger = applyFinanceCommand(ledger, command("finance_add_001", "add_entry", {
    id: "money_old_1",
    type: "EXPENSE",
    category: "Food",
    amountCents: 1000,
    currencyCode: "HUF",
    name: "Old lunch",
    createdAtMillis: 1000,
  }), new Date(1000)).ledger;

  ledger = applyFinanceCommand(ledger, command("finance_archive_001", "archive_entry", { id: "money_old_1" }), new Date(3000)).ledger;
  assert.equal(financeSummary(ledger).entryCount, 0);
  assert.equal(financeSummary(ledger, undefined, undefined, "archived").entryCount, 1);
  assert.equal(archivedFinanceEntries(ledger)[0].id, "money_old_1");

  ledger = applyFinanceCommand(ledger, command("finance_restore_001", "restore_entry", { id: "money_old_1" }), new Date(4000)).ledger;
  assert.equal(financeSummary(ledger).entryCount, 1);
  assert.equal(archivedFinanceEntries(ledger).length, 0);
});

test("archive before cutoff archives only older active entries", () => {
  let ledger = createEmptyFinanceLedger();
  ledger = applyFinanceCommand(ledger, command("finance_add_old", "add_entry", {
    id: "money_old_1",
    type: "EXPENSE",
    category: "Food",
    amountCents: 1000,
    currencyCode: "HUF",
    createdAtMillis: 1000,
  }), new Date(1000)).ledger;
  ledger = applyFinanceCommand(ledger, command("finance_add_new", "add_entry", {
    id: "money_new_1",
    type: "EXPENSE",
    category: "Food",
    amountCents: 2000,
    currencyCode: "HUF",
    createdAtMillis: 5000,
  }), new Date(5000)).ledger;

  const result = applyFinanceCommand(ledger, command("finance_archive_before_001", "archive_before", { beforeMillis: 4000 }), new Date(6000));
  assert.equal(result.affectedCount, 1);
  assert.equal(financeSummary(result.ledger).entryCount, 1);
  assert.equal(financeSummary(result.ledger, undefined, undefined, "archived").entryCount, 1);
  assert.equal(result.ledger.entries.find((entry) => entry.id === "money_old_1")?.archivedAtMillis, 6000);
});

test("newer archive state from Android wins and deleted entries cannot remain archived", () => {
  const archived = mergeFinanceSnapshot(createEmptyFinanceLedger(), {
    requestId: "android_sync_archive",
    entries: [{
      id: "money_phone_1",
      type: "EXPENSE",
      category: "Food",
      amountCents: 1200,
      currencyCode: "HUF",
      name: "Lunch",
      createdAtMillis: 1000,
      updatedAtMillis: 2000,
      archivedAtMillis: 2000,
      actor: "android",
    }],
    categories: [],
  }).ledger;
  assert.equal(financeSummary(archived).entryCount, 0);

  const deleted = applyFinanceCommand(archived, command("finance_delete_001", "delete_entry", { id: "money_phone_1" }), new Date(3000)).ledger;
  const entry = deleted.entries[0];
  assert.equal(entry.deletedAtMillis, 3000);
  assert.equal(entry.archivedAtMillis, undefined);
});
