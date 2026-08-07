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


# Expose the already persisted rate_date from the local FX lock cache.
path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/data/EntryFxStore.java"
text = read(path)
text = replace_once(
    text,
    "    public boolean hasCompleteLock(MoneyEntry entry) {\n        return readRow(entry) != null;\n    }\n\n",
    "    public boolean hasCompleteLock(MoneyEntry entry) {\n        return readRow(entry) != null;\n    }\n\n"
    "    public String getRateDate(MoneyEntry entry) {\n"
    "        LockedRow row = readRow(entry);\n"
    "        return row == null ? null : row.rateDate;\n"
    "    }\n\n",
    "EntryFxStore getRateDate",
)
write(path, text)

# Show the actual locked FX date on the Edit entry screen.
path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/EditEntryActivity.java"
text = read(path)
text = replace_once(
    text,
    "import com.example.expensebuttontracker.data.EntryFxStore;\n",
    "import com.example.expensebuttontracker.data.EntryFxStore;\n"
    "import com.example.expensebuttontracker.data.MoneyEntry;\n",
    "EditEntryActivity MoneyEntry import",
)
text = replace_once(
    text,
    "    private static final String DATE_PATTERN = \"yyyy-MM-dd HH:mm\";\n",
    "    private static final String DATE_PATTERN = \"yyyy-MM-dd HH:mm\";\n"
    "    private static final String FX_DATE_PATTERN = \"yyyy-MM-dd\";\n",
    "EditEntryActivity FX date pattern",
)
old = """        SimpleDateFormat format = new SimpleDateFormat(DATE_PATTERN, Locale.getDefault());
        dateInput = textInput("Date and time", format.format(new Date(entry.createdAtMillis)), InputType.TYPE_CLASS_DATETIME);
        root.addView(field("Date and time (" + DATE_PATTERN + ")", dateInput));
        root.addView(spacer(18));

        root.addView(primaryButton("Save changes", this::save));
"""
new = """        SimpleDateFormat format = new SimpleDateFormat(DATE_PATTERN, Locale.getDefault());
        dateInput = textInput("Date and time", format.format(new Date(entry.createdAtMillis)), InputType.TYPE_CLASS_DATETIME);
        root.addView(field("Date and time (" + DATE_PATTERN + ")", dateInput));
        root.addView(spacer(10));
        root.addView(fxRateDateView(entry));
        root.addView(spacer(18));

        root.addView(primaryButton("Save changes", this::save));
"""
text = replace_once(text, old, new, "EditEntryActivity FX date view placement")
marker = """    private void save() {
"""
helper = """    private TextView fxRateDateView(EntryRecord entry) {
        EntryFxStore fxStore = new EntryFxStore(this);
        String rateDate;
        try {
            MoneyEntry moneyEntry = new MoneyEntry(
                    entryId,
                    entry.type,
                    entry.category,
                    entry.amountCents,
                    entry.currency,
                    entry.name,
                    entry.createdAtMillis);
            rateDate = fxStore.getRateDate(moneyEntry);
        } finally {
            fxStore.close();
        }

        String text;
        if (rateDate == null || rateDate.isEmpty()) {
            text = "Exchange rate used: pending historical rate";
        } else {
            SimpleDateFormat dayFormat = new SimpleDateFormat(FX_DATE_PATTERN, Locale.US);
            String transactionDate = dayFormat.format(new Date(entry.createdAtMillis));
            text = "Exchange rate used: " + rateDate;
            if (!rateDate.equals(transactionDate)) {
                text += " (latest available before transaction date)";
            }
        }

        TextView view = label(text, 14, false);
        view.setTextColor(color(R.color.text_secondary));
        return view;
    }

"""
text = replace_once(text, marker, helper + marker, "EditEntryActivity FX date helper")
write(path, text)

# Bump the Android build so the existing in-app updater recognizes this release.
path = "ExpenseButtonTracker/app/build.gradle"
text = read(path)
text = replace_once(text, "        versionCode 8\n", "        versionCode 9\n", "versionCode")
text = replace_once(text, "        versionName '2.4.0'\n", "        versionName '2.4.1'\n", "versionName")
write(path, text)
