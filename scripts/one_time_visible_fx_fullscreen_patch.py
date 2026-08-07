from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


# Hide the Android status bar app-wide while preserving the bottom navigation/gesture surface.
path = "ExpenseButtonTracker/app/src/main/res/values/styles.xml"
text = read(path)
text = replace_once(
    text,
    "        <item name=\"android:fontFamily\">sans</item>\n",
    "        <item name=\"android:fontFamily\">sans</item>\n"
    "        <item name=\"android:windowFullscreen\">true</item>\n",
    "AppTheme fullscreen",
)
write(path, text)


# Make the locked FX date visible on every current transaction card and in its action dialog.
path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java"
text = read(path)
text = replace_once(
    text,
    "        row.setMinimumHeight(dp(126));\n",
    "        row.setMinimumHeight(dp(148));\n",
    "MainActivity entry row height",
)
text = replace_once(
    text,
    "        details.setText(entry.category + \"\\n\" +\n"
    "                DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(entry.createdAtMillis)));\n",
    "        details.setText(entry.category + \"\\n\" +\n"
    "                DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(entry.createdAtMillis)) + \"\\n\" +\n"
    "                fxRateText(entry));\n",
    "MainActivity entry details",
)
text = replace_once(
    text,
    "        details.setMaxLines(2);\n",
    "        details.setMaxLines(3);\n",
    "MainActivity entry detail lines",
)
text = replace_once(
    text,
    "                .setMessage(\"Edit changes the transaction. Archive keeps it outside current totals. Delete removes it from current and archived history.\")\n",
    "                .setMessage(fxRateText(entry) + \"\\n\\nEdit changes the transaction. Archive keeps it outside current totals. Delete removes it from current and archived history.\")\n",
    "MainActivity entry dialog FX",
)
marker = "    private void showEntryActions(MoneyEntry entry) {\n"
helper = """    private String fxRateText(MoneyEntry entry) {
        String rateDate = fxStore.getRateDate(entry);
        if (rateDate == null || rateDate.isEmpty()) {
            return "FX rate: pending historical rate";
        }
        String transactionDate = ExchangeRateStore.formatDate(entry.createdAtMillis);
        if (!rateDate.equals(transactionDate)) {
            return "FX rate: " + rateDate + " (latest available before transaction date)";
        }
        return "FX rate: " + rateDate;
    }

"""
text = replace_once(text, marker, helper + marker, "MainActivity FX helper")
write(path, text)


# Show the same rate date on archived entries.
path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/ArchiveActivity.java"
text = read(path)
text = replace_once(
    text,
    "import com.example.expensebuttontracker.data.EntryType;\n",
    "import com.example.expensebuttontracker.data.EntryType;\n"
    "import com.example.expensebuttontracker.data.EntryFxStore;\n",
    "ArchiveActivity EntryFxStore import",
)
text = replace_once(
    text,
    "    private LinearLayout root;\n",
    "    private LinearLayout root;\n"
    "    private EntryFxStore fxStore;\n",
    "ArchiveActivity fx field",
)
text = replace_once(
    text,
    "        super.onCreate(savedInstanceState);\n",
    "        super.onCreate(savedInstanceState);\n"
    "        fxStore = new EntryFxStore(this);\n",
    "ArchiveActivity fx init",
)
text = replace_once(
    text,
    "        details.setText(entry.category + \" · \" + CurrencyUtils.displayCode(entry.currencyCode) + \"\\n\"\n"
    "                + DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(entry.createdAtMillis)));\n",
    "        details.setText(entry.category + \" · \" + CurrencyUtils.displayCode(entry.currencyCode) + \"\\n\"\n"
    "                + DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(entry.createdAtMillis)) + \"\\n\"\n"
    "                + fxRateText(entry));\n",
    "ArchiveActivity details",
)
text = replace_once(
    text,
    "        details.setPadding(0, dp(7), 0, dp(10));\n",
    "        details.setPadding(0, dp(7), 0, dp(10));\n"
    "        details.setMaxLines(3);\n",
    "ArchiveActivity detail lines",
)
marker = "    private void restoreEntry(MoneyEntry entry) {\n"
helper = """    private String fxRateText(MoneyEntry entry) {
        String rateDate = fxStore.getRateDate(entry);
        return rateDate == null || rateDate.isEmpty()
                ? "FX rate: pending historical rate"
                : "FX rate: " + rateDate;
    }

"""
text = replace_once(text, marker, helper + marker, "ArchiveActivity FX helper")
marker = "    private void toast(String message) {\n"
cleanup = """    @Override
    protected void onDestroy() {
        if (fxStore != null) fxStore.close();
        super.onDestroy();
    }

"""
text = replace_once(text, marker, cleanup + marker, "ArchiveActivity onDestroy")
write(path, text)


# Bump the app so the in-app updater can deliver both fixes.
path = "ExpenseButtonTracker/app/build.gradle"
text = read(path)
text = replace_once(text, "        versionCode 10\n", "        versionCode 11\n", "versionCode")
text = replace_once(text, "        versionName '2.4.2'\n", "        versionName '2.4.3'\n", "versionName")
write(path, text)
