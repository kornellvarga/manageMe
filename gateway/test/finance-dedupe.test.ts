import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFinanceCommand,
  createEmptyFinanceLedger,
  dedupeFinanceLedger,
  mergeFinanceSnapshot,
  type FinanceCommand,
} from "../src/finance";

function command(requestId: string, payload: Record<string, unknown>): FinanceCommand {
  return {
    requestId,
    profileId: "kornel",
    actor: "assistant",
    type: "add_entry",
    payload,
  };
}

const duplicate = {
  type: "EXPENSE",
  category: "Food",
  amountCents: 320000,
  currencyCode: "HUF",
  name: "Burger",
  createdAtMillis: 1785693833000,
};

test("exact duplicate entries become deletion tombstones", () => {
  const ledger = mergeFinanceSnapshot(createEmptyFinanceLedger(), {
    requestId: "android_sync_dedupe_1",
    entries: [
      { id: "money_a", ...duplicate, updatedAtMillis: 1000, actor: "android" },
      { id: "money_b", ...duplicate, updatedAtMillis: 2000, actor: "android" },
    ],
    categories: [],
  }).ledger;

  const result = dedupeFinanceLedger(ledger, new Date(5000));
  assert.equal(result.changed, true);
  assert.equal(result.affectedCount, 1);
  assert.equal(result.ledger.entries.filter((entry) => !entry.deletedAtMillis).length, 1);
  assert.equal(result.ledger.entries.find((entry) => entry.id === "money_b")?.deletedAtMillis, undefined);
  assert.equal(result.ledger.entries.find((entry) => entry.id === "money_a")?.deletedAtMillis, 5000);
});

test("active duplicate is kept instead of an archived copy", () => {
  const ledger = mergeFinanceSnapshot(createEmptyFinanceLedger(), {
    requestId: "android_sync_dedupe_2",
    entries: [
      { id: "money_active", ...duplicate, updatedAtMillis: 1000, actor: "android" },
      { id: "money_archived", ...duplicate, updatedAtMillis: 3000, archivedAtMillis: 3000, actor: "android" },
    ],
    categories: [],
  }).ledger;

  const result = dedupeFinanceLedger(ledger, new Date(6000));
  assert.equal(result.ledger.entries.find((entry) => entry.id === "money_active")?.deletedAtMillis, undefined);
  assert.equal(result.ledger.entries.find((entry) => entry.id === "money_archived")?.deletedAtMillis, 6000);
});

test("assistant add is idempotent by semantic transaction content", () => {
  const first = applyFinanceCommand(
    createEmptyFinanceLedger(),
    command("finance_add_duplicate_1", duplicate),
    new Date(7000),
  );
  const second = applyFinanceCommand(
    first.ledger,
    command("finance_add_duplicate_2", duplicate),
    new Date(8000),
  );
  assert.equal(second.ledger.entries.filter((entry) => !entry.deletedAtMillis).length, 1);
  assert.equal(second.entityId, first.entityId);
});
