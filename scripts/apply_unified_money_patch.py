from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# Money dashboard: clean exact duplicates, make tap actionable, and expose editing.
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java",
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\n",
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\n"
    "import com.example.expensebuttontracker.data.FinanceDuplicateCleaner;\n",
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java",
    "        db = new ExpenseDbHelper(this);\n        displayCurrency = SettingsStore.getDisplayCurrency(this);",
    "        db = new ExpenseDbHelper(this);\n"
    "        int duplicatesRemoved = FinanceDuplicateCleaner.dedupeExact(this);\n"
    "        displayCurrency = SettingsStore.getDisplayCurrency(this);",
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java",
    "        buildUi();\n        LockScreenQuickAddNotification.update(this);",
    "        buildUi();\n"
    "        if (duplicatesRemoved > 0) {\n"
    "            toast(\"Removed \" + duplicatesRemoved + \" exact duplicate entr\" + (duplicatesRemoved == 1 ? \"y.\" : \"ies.\"));\n"
    "        }\n"
    "        LockScreenQuickAddNotification.update(this);",
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java",
    "        row.setOnLongClickListener(v -> {\n            showEntryActions(entry);\n            return true;\n        });",
    "        row.setOnClickListener(v -> showEntryActions(entry));\n"
    "        row.setOnLongClickListener(v -> {\n"
    "            showEntryActions(entry);\n"
    "            return true;\n"
    "        });",
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java",
    "    private void showEntryActions(MoneyEntry entry) {\n"
    "        String[] actions = new String[]{\"Archive\", \"Delete permanently\"};\n"
    "        new AlertDialog.Builder(this)\n"
    "                .setTitle(entry.name)\n"
    "                .setMessage(\"Archive keeps the entry but removes it from current totals. Delete creates a deletion tombstone.\")\n"
    "                .setItems(actions, (dialog, which) -> {\n"
    "                    if (which == 0) archiveEntry(entry);\n"
    "                    else confirmDelete(entry);\n"
    "                })\n"
    "                .setNegativeButton(\"Cancel\", null)\n"
    "                .show();\n"
    "    }\n\n"
    "    private void archiveEntry(MoneyEntry entry) {",
    "    private void showEntryActions(MoneyEntry entry) {\n"
    "        String[] actions = new String[]{\"Edit\", \"Archive\", \"Delete permanently\"};\n"
    "        new AlertDialog.Builder(this)\n"
    "                .setTitle(entry.name)\n"
    "                .setMessage(\"Edit changes the transaction. Archive keeps it outside current totals. Delete removes it from current and archived history.\")\n"
    "                .setItems(actions, (dialog, which) -> {\n"
    "                    if (which == 0) editEntry(entry);\n"
    "                    else if (which == 1) archiveEntry(entry);\n"
    "                    else confirmDelete(entry);\n"
    "                })\n"
    "                .setNegativeButton(\"Cancel\", null)\n"
    "                .show();\n"
    "    }\n\n"
    "    private void editEntry(MoneyEntry entry) {\n"
    "        Intent intent = new Intent(this, EditEntryActivity.class);\n"
    "        intent.putExtra(EditEntryActivity.EXTRA_ENTRY_ID, entry.id);\n"
    "        startActivity(intent);\n"
    "    }\n\n"
    "    private void archiveEntry(MoneyEntry entry) {",
)

# Native synchronization: clean before upload and after download.
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/sync/FinanceSyncClient.java",
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\n",
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\n"
    "import com.example.expensebuttontracker.data.FinanceDuplicateCleaner;\n",
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/sync/FinanceSyncClient.java",
    "        ExpenseDbHelper db = new ExpenseDbHelper(context);\n        String payload = db.buildFinanceSyncPayload();",
    "        FinanceDuplicateCleaner.dedupeExact(context);\n"
    "        ExpenseDbHelper db = new ExpenseDbHelper(context);\n"
    "        String payload = db.buildFinanceSyncPayload();",
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/sync/FinanceSyncClient.java",
    "        db.applyFinanceLedger(ledger.toString());\n        SettingsStore.markFinanceSyncSuccess(context, ledger.optLong(\"revision\", 0L));",
    "        db.applyFinanceLedger(ledger.toString());\n"
    "        int duplicatesRemoved = FinanceDuplicateCleaner.dedupeExact(context);\n"
    "        if (duplicatesRemoved > 0) PENDING.set(true);\n"
    "        SettingsStore.markFinanceSyncSuccess(context, ledger.optLong(\"revision\", 0L));",
)

# Server canonicalization: exact imported/retried duplicates become deletion tombstones.
finance_path = Path("gateway/src/finance.ts")
finance = finance_path.read_text(encoding="utf-8")
marker = "export function mergeFinanceSnapshot(current: FinanceLedger, snapshot: FinanceSnapshot): { ledger: FinanceLedger; changed: boolean } {"
if marker not in finance:
    raise SystemExit("Finance merge marker not found")
helper = r'''
function normalizeFingerprintText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function entryFingerprint(entry: FinanceEntry): string {
  return [
    entry.type,
    normalizeFingerprintText(entry.category),
    String(entry.amountCents),
    entry.currencyCode,
    normalizeFingerprintText(entry.name),
    String(entry.createdAtMillis),
  ].join("\u0000");
}

export function dedupeFinanceLedger(
  current: FinanceLedger,
  now = new Date(),
): { ledger: FinanceLedger; changed: boolean; affectedCount: number } {
  const next = structuredClone(current);
  const candidates = next.entries
    .filter((entry) => !entry.deletedAtMillis)
    .sort((left, right) => {
      const leftArchived = left.archivedAtMillis ? 1 : 0;
      const rightArchived = right.archivedAtMillis ? 1 : 0;
      return leftArchived - rightArchived
        || right.updatedAtMillis - left.updatedAtMillis
        || left.id.localeCompare(right.id);
    });
  const seen = new Set<string>();
  const nowMillis = now.getTime();
  let affectedCount = 0;
  for (const entry of candidates) {
    const fingerprint = entryFingerprint(entry);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      continue;
    }
    entry.deletedAtMillis = nowMillis;
    entry.archivedAtMillis = undefined;
    entry.updatedAtMillis = nowMillis;
    entry.actor = "system";
    affectedCount += 1;
  }
  if (affectedCount === 0) return { ledger: current, changed: false, affectedCount: 0 };
  next.revision += 1;
  next.entries = sortedEntries(next.entries);
  next.updatedAt = now.toISOString();
  return { ledger: next, changed: true, affectedCount };
}

'''
finance = finance.replace(marker, helper + marker, 1)
old = "      if (next.entries.some((item) => item.id === entry.id)) throw new Error(\"Finance entry id already exists.\");\n      next.entries.unshift(entry);"
new = "      if (next.entries.some((item) => item.id === entry.id)) throw new Error(\"Finance entry id already exists.\");\n      const semanticDuplicate = next.entries.find((item) => !item.deletedAtMillis && entryFingerprint(item) === entryFingerprint(entry));\n      if (semanticDuplicate) {\n        entityId = semanticDuplicate.id;\n        break;\n      }\n      next.entries.unshift(entry);"
if old not in finance:
    raise SystemExit("Finance add-entry marker not found")
finance_path.write_text(finance.replace(old, new, 1), encoding="utf-8")
