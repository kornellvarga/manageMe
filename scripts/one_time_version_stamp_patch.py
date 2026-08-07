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


# ManageMe home title version stamp.
path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/ManageMeActivity.java"
text = read(path)
text = replace_once(
    text,
    "import com.example.expensebuttontracker.R;\n",
    "import com.example.expensebuttontracker.BuildConfig;\nimport com.example.expensebuttontracker.R;\n",
    "ManageMeActivity BuildConfig import",
)
text = replace_once(
    text,
    "        title.setText(R.string.app_name);\n",
    "        title.setText(getString(R.string.app_name) + \" · v\" + BuildConfig.VERSION_NAME + \" (\" + BuildConfig.VERSION_CODE + \")\");\n",
    "ManageMeActivity title stamp",
)
write(path, text)

# Money tracker title version stamp.
path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java"
text = read(path)
text = replace_once(
    text,
    "import com.example.expensebuttontracker.R;\n",
    "import com.example.expensebuttontracker.BuildConfig;\nimport com.example.expensebuttontracker.R;\n",
    "MainActivity BuildConfig import",
)
text = replace_once(
    text,
    "        setTitle(\"Money tracker\");\n",
    "        setTitle(\"Money tracker · v\" + BuildConfig.VERSION_NAME);\n",
    "MainActivity activity title stamp",
)
text = replace_once(
    text,
    "        title.setText(\"Money tracker\");\n",
    "        title.setText(\"Money tracker · v\" + BuildConfig.VERSION_NAME + \" (\" + BuildConfig.VERSION_CODE + \")\");\n",
    "MainActivity visible title stamp",
)
write(path, text)

# Bump app so the existing in-app updater delivers the visible stamps.
path = "ExpenseButtonTracker/app/build.gradle"
text = read(path)
text = replace_once(text, "        versionCode 9\n", "        versionCode 10\n", "versionCode")
text = replace_once(text, "        versionName '2.4.1'\n", "        versionName '2.4.2'\n", "versionName")
write(path, text)
