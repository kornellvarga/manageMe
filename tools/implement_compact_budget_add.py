from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)

def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f"Anchor not found in {path}: {old[:80]!r}")
    write(path, text.replace(old, new, 1))

# Release bump.
replace_once("ExpenseButtonTracker/app/build.gradle", "versionCode 14\n        versionName '2.5.2'", "versionCode 15\n        versionName '2.5.3'")

# Register a new widget provider, leaving the existing Compact widget untouched.
manifest_anchor = '''        <receiver\n            android:name=".widget.BudgetCompactWidget"\n            android:exported="true"\n            android:label="Budget Compact">\n            <intent-filter>\n                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n            </intent-filter>\n            <meta-data\n                android:name="android.appwidget.provider"\n                android:resource="@xml/widget_budget_compact" />\n        </receiver>\n'''
manifest_insert = manifest_anchor + '''\n        <receiver\n            android:name=".widget.BudgetCompactAddWidget"\n            android:exported="true"\n            android:label="Budget Compact + Add">\n            <intent-filter>\n                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n            </intent-filter>\n            <meta-data\n                android:name="android.appwidget.provider"\n                android:resource="@xml/widget_budget_compact_add" />\n        </receiver>\n'''
replace_once("ExpenseButtonTracker/app/src/main/AndroidManifest.xml", manifest_anchor, manifest_insert)

# Add direct pinning from Monthly money plan.
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    "import com.example.expensebuttontracker.widget.BudgetCompactWidget;",
    "import com.example.expensebuttontracker.widget.BudgetCompactWidget;\nimport com.example.expensebuttontracker.widget.BudgetCompactAddWidget;",
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    '''        root.addView(secondaryButton("Pin Compact", v -> requestPinBudgetWidget(BudgetCompactWidget.class)));\n        root.addView(secondaryButton("Pin Card", v -> requestPinBudgetWidget(BudgetProgressWidget.class)));''',
    '''        root.addView(secondaryButton("Pin Compact", v -> requestPinBudgetWidget(BudgetCompactWidget.class)));\n        root.addView(secondaryButton("Pin Compact + Add", v -> requestPinBudgetWidget(BudgetCompactAddWidget.class)));\n        root.addView(secondaryButton("Pin Card", v -> requestPinBudgetWidget(BudgetProgressWidget.class)));''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    '''        TextView widgetHelp = empty("Four layouts share the same live budget data. Minimal is a true one-line widget; Compact adds a slim progress bar; Card balances glanceability and detail; Detailed is a dashboard-style view. Each can choose its own budget and is available on compatible lock-screen widget surfaces.");''',
    '''        TextView widgetHelp = empty("Five layouts share the same live budget data. Compact + Add keeps the gauge and adds a small square + button that opens Quick Add with this widget's budget preselected. Each widget can choose its own budget.");''',
)

# Extend the shared renderer with a Compact + Add personality and quick-add pending intent.
progress_path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/widget/BudgetProgressWidget.java"
replace_once(
    progress_path,
    "import android.content.Intent;\nimport android.widget.RemoteViews;",
    "import android.content.Intent;\nimport android.os.Build;\nimport android.widget.RemoteViews;",
)
replace_once(
    progress_path,
    "import com.example.expensebuttontracker.ui.BudgetPlanActivity;\nimport com.example.expensebuttontracker.util.MoneyUtils;",
    "import com.example.expensebuttontracker.ui.BudgetPlanActivity;\nimport com.example.expensebuttontracker.ui.LockScreenQuickAddActivity;\nimport com.example.expensebuttontracker.ui.QuickAddActivity;\nimport com.example.expensebuttontracker.util.MoneyUtils;\nimport com.example.expensebuttontracker.util.SettingsStore;",
)
replace_once(
    progress_path,
    "/** Shared renderer for the four budget-widget personalities. */",
    "/** Shared renderer for the budget-widget personalities. */",
)
replace_once(
    progress_path,
    "    protected static final int MODE_DETAILED = 4;",
    "    protected static final int MODE_DETAILED = 4;\n    protected static final int MODE_COMPACT_ADD = 5;",
)
replace_once(
    progress_path,
    '''        updateProvider(context, manager, BudgetCompactWidget.class, MODE_COMPACT);\n        updateProvider(context, manager, BudgetProgressWidget.class, MODE_CARD);''',
    '''        updateProvider(context, manager, BudgetCompactWidget.class, MODE_COMPACT);\n        updateProvider(context, manager, BudgetCompactAddWidget.class, MODE_COMPACT_ADD);\n        updateProvider(context, manager, BudgetProgressWidget.class, MODE_CARD);''',
)
replace_once(
    progress_path,
    '''            if (BudgetMinimalWidget.class.getName().equals(className)) mode = MODE_MINIMAL;\n            else if (BudgetCompactWidget.class.getName().equals(className)) mode = MODE_COMPACT;\n            else if (BudgetDetailedWidget.class.getName().equals(className)) mode = MODE_DETAILED;''',
    '''            if (BudgetMinimalWidget.class.getName().equals(className)) mode = MODE_MINIMAL;\n            else if (BudgetCompactWidget.class.getName().equals(className)) mode = MODE_COMPACT;\n            else if (BudgetCompactAddWidget.class.getName().equals(className)) mode = MODE_COMPACT_ADD;\n            else if (BudgetDetailedWidget.class.getName().equals(className)) mode = MODE_DETAILED;''',
)
replace_once(
    progress_path,
    '''            if (BudgetMinimalWidget.class.getName().equals(className)) return "Minimal · one line";\n            if (BudgetCompactWidget.class.getName().equals(className)) return "Compact";\n            if (BudgetDetailedWidget.class.getName().equals(className)) return "Detailed";''',
    '''            if (BudgetMinimalWidget.class.getName().equals(className)) return "Minimal · one line";\n            if (BudgetCompactWidget.class.getName().equals(className)) return "Compact";\n            if (BudgetCompactAddWidget.class.getName().equals(className)) return "Compact + Add";\n            if (BudgetDetailedWidget.class.getName().equals(className)) return "Detailed";''',
)
replace_once(
    progress_path,
    '''        views.setOnClickPendingIntent(R.id.widget_budget_root, pending);\n        manager.updateAppWidget(appWidgetId, views);''',
    '''        views.setOnClickPendingIntent(R.id.widget_budget_root, pending);\n        if (mode == MODE_COMPACT_ADD) {\n            views.setOnClickPendingIntent(\n                    R.id.widget_budget_add_button,\n                    buildQuickAddPendingIntent(context, appWidgetId, budget));\n        }\n        manager.updateAppWidget(appWidgetId, views);''',
)
replace_once(
    progress_path,
    '''        if (mode == MODE_COMPACT) return R.layout.widget_budget_compact;\n        if (mode == MODE_DETAILED) return R.layout.widget_budget_detailed;''',
    '''        if (mode == MODE_COMPACT) return R.layout.widget_budget_compact;\n        if (mode == MODE_COMPACT_ADD) return R.layout.widget_budget_compact_add;\n        if (mode == MODE_DETAILED) return R.layout.widget_budget_detailed;''',
)
replace_once(
    progress_path,
    '''    private static int color(Context context, int colorId) {\n        return context.getResources().getColor(colorId, context.getTheme());\n    }''',
    '''    private static PendingIntent buildQuickAddPendingIntent(Context context, int appWidgetId, FinancePlanStore.Budget budget) {\n        Class<?> targetActivity = SettingsStore.isLockScreenQuickAddEnabled(context)\n                ? LockScreenQuickAddActivity.class\n                : QuickAddActivity.class;\n        Intent intent = new Intent(context, targetActivity);\n        intent.setAction("com.example.expensebuttontracker.action.BUDGET_WIDGET_QUICK_ADD." + appWidgetId);\n        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);\n        if (budget != null) intent.putExtra(QuickAddActivity.EXTRA_BUDGET_ID, budget.id);\n        int flags = PendingIntent.FLAG_UPDATE_CURRENT;\n        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;\n        return PendingIntent.getActivity(context, 14000 + appWidgetId, intent, flags);\n    }\n\n    private static int color(Context context, int colorId) {\n        return context.getResources().getColor(colorId, context.getTheme());\n    }''',
)

write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/widget/BudgetCompactAddWidget.java", '''package com.example.expensebuttontracker.widget;\n\n/** Compact budget gauge with a square Quick Add expense button beside it. */\npublic final class BudgetCompactAddWidget extends BudgetProgressWidget {\n    @Override\n    protected int widgetMode() {\n        return MODE_COMPACT_ADD;\n    }\n}\n''')

write("ExpenseButtonTracker/app/src/main/res/layout/widget_budget_compact_add.xml", '''<?xml version="1.0" encoding="utf-8"?>\n<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"\n    android:id="@+id/widget_budget_root"\n    android:layout_width="match_parent"\n    android:layout_height="match_parent"\n    android:gravity="center_vertical"\n    android:orientation="horizontal">\n\n    <LinearLayout\n        android:layout_width="0dp"\n        android:layout_height="match_parent"\n        android:layout_weight="1"\n        android:background="@drawable/widget_bg_compact"\n        android:orientation="vertical"\n        android:paddingStart="14dp"\n        android:paddingEnd="14dp"\n        android:paddingTop="11dp"\n        android:paddingBottom="10dp">\n\n        <TextView\n            android:id="@+id/widget_budget_title"\n            android:layout_width="match_parent"\n            android:layout_height="wrap_content"\n            android:ellipsize="end"\n            android:maxLines="1"\n            android:text="Pocket Money"\n            android:textColor="@color/text_secondary"\n            android:textSize="11sp"\n            android:textStyle="bold" />\n\n        <TextView\n            android:id="@+id/widget_budget_amount"\n            android:layout_width="match_parent"\n            android:layout_height="wrap_content"\n            android:ellipsize="end"\n            android:maxLines="1"\n            android:paddingTop="1dp"\n            android:text="0 TRY left"\n            android:textColor="@color/text_primary"\n            android:textSize="19sp"\n            android:textStyle="bold" />\n\n        <ProgressBar\n            android:id="@+id/widget_budget_progress"\n            style="?android:attr/progressBarStyleHorizontal"\n            android:layout_width="match_parent"\n            android:layout_height="6dp"\n            android:layout_marginTop="6dp"\n            android:max="1000"\n            android:progress="0"\n            android:progressBackgroundTint="@color/widget_progress_track"\n            android:progressTint="@color/brand_accent" />\n    </LinearLayout>\n\n    <TextView\n        android:id="@+id/widget_budget_add_button"\n        android:layout_width="64dp"\n        android:layout_height="match_parent"\n        android:layout_marginStart="8dp"\n        android:background="@drawable/widget_add_expense_button"\n        android:contentDescription="Quick add expense"\n        android:gravity="center"\n        android:text="+"\n        android:textColor="@android:color/white"\n        android:textSize="28sp"\n        android:textStyle="bold" />\n</LinearLayout>\n''')

write("ExpenseButtonTracker/app/src/main/res/drawable/widget_add_expense_button.xml", '''<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n    <corners android:radius="20dp" />\n    <solid android:color="@color/brand_accent" />\n</shape>\n''')

write("ExpenseButtonTracker/app/src/main/res/xml/widget_budget_compact_add.xml", '''<?xml version="1.0" encoding="utf-8"?>\n<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"\n    android:minWidth="250dp"\n    android:minHeight="72dp"\n    android:minResizeWidth="220dp"\n    android:minResizeHeight="72dp"\n    android:maxResizeHeight="80dp"\n    android:targetCellWidth="5"\n    android:targetCellHeight="1"\n    android:updatePeriodMillis="1800000"\n    android:initialLayout="@layout/widget_budget_compact_add"\n    android:previewLayout="@layout/widget_budget_compact_add"\n    android:resizeMode="horizontal"\n    android:widgetCategory="home_screen|keyguard"\n    android:configure="com.example.expensebuttontracker.ui.BudgetWidgetConfigureActivity" />\n''')

print("Compact + Add budget widget implementation applied.")
