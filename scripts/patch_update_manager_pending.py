from pathlib import Path

path = Path("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/update/UpdateManager.java")
text = path.read_text(encoding="utf-8")
text = text.replace(
    "        resumePendingInstall(activity);\n        if (!CHECKING.compareAndSet(false, true)) return;",
    "        if (hasPendingUpdate(activity)) {\n"
    "            resumePendingInstall(activity);\n"
    "            return;\n"
    "        }\n"
    "        if (!CHECKING.compareAndSet(false, true)) return;",
    1,
)
marker = "    private static SharedPreferences prefs(Context context) {"
helper = (
    "    private static boolean hasPendingUpdate(Context context) {\n"
    "        int pendingVersion = prefs(context).getInt(KEY_PENDING_VERSION, 0);\n"
    "        String pendingPath = prefs(context).getString(KEY_PENDING_PATH, \"\");\n"
    "        return pendingVersion > BuildConfig.VERSION_CODE\n"
    "                && pendingPath != null\n"
    "                && !pendingPath.isEmpty()\n"
    "                && new File(pendingPath).isFile();\n"
    "    }\n\n"
)
if marker not in text:
    raise SystemExit("UpdateManager insertion point not found")
path.write_text(text.replace(marker, helper + marker, 1), encoding="utf-8")
