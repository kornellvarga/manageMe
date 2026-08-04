from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old[:140]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "ExpenseButtonTracker/app/build.gradle",
    "        versionCode 5\n        versionName '2.3.0'",
    "        versionCode 6\n        versionName '2.3.1'",
)

replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java",
    '''    private void showEntryActions(MoneyEntry entry) {
        String[] actions = new String[]{"Edit", "Archive", "Delete permanently"};
        new AlertDialog.Builder(this)
                .setTitle(entry.name)
                .setMessage("Edit changes the transaction. Archive keeps it outside current totals. Delete removes it from current and archived history.")
                .setItems(actions, (dialog, which) -> {
                    if (which == 0) editEntry(entry);
                    else if (which == 1) archiveEntry(entry);
                    else confirmDelete(entry);
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
''',
    '''    private void showEntryActions(MoneyEntry entry) {
        new AlertDialog.Builder(this)
                .setTitle(entry.name)
                .setMessage("Edit changes the transaction. Archive keeps it outside current totals. Delete removes it from current and archived history.")
                .setPositiveButton("Edit", (dialog, which) -> editEntry(entry))
                .setNeutralButton("Archive", (dialog, which) -> archiveEntry(entry))
                .setNegativeButton("Delete permanently", (dialog, which) -> confirmDelete(entry))
                .show();
    }
''',
)

replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/data/FinanceDuplicateCleaner.java",
    "                + createdAtMillis;",
    "                + (createdAtMillis / 1000L);",
)

replace_once(
    "gateway/src/finance.ts",
    '    String(entry.createdAtMillis),',
    '    String(Math.floor(entry.createdAtMillis / 1000)),',
)

replace_once(
    "gateway/test/finance-dedupe.test.ts",
    'test("exact duplicate entries become deletion tombstones", () => {',
    'test("sub-second duplicate entries become deletion tombstones", () => {',
)
replace_once(
    "gateway/test/finance-dedupe.test.ts",
    '      { id: "money_a", ...duplicate, updatedAtMillis: baseTime + 1000, actor: "android" },\n      { id: "money_b", ...duplicate, updatedAtMillis: baseTime + 2000, actor: "android" },',
    '      { id: "money_a", ...duplicate, createdAtMillis: baseTime + 185, updatedAtMillis: baseTime + 1000, actor: "android" },\n      { id: "money_b", ...duplicate, createdAtMillis: baseTime, updatedAtMillis: baseTime + 2000, actor: "android" },',
)
