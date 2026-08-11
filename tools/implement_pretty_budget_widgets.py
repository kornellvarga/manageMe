from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content.strip() + "\n", encoding="utf-8")


write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/widget/BudgetProgressWidget.java", r'''
package com.example.expensebuttontracker.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.FinancePlanStore;
import com.example.expensebuttontracker.ui.BudgetPlanActivity;
import com.example.expensebuttontracker.util.MoneyUtils;

import java.util.Calendar;

/** Shared renderer for the four budget-widget personalities. */
public class BudgetProgressWidget extends AppWidgetProvider {
    protected static final int MODE_MINIMAL = 1;
    protected static final int MODE_COMPACT = 2;
    protected static final int MODE_CARD = 3;
    protected static final int MODE_DETAILED = 4;

    protected int widgetMode() {
        return MODE_CARD;
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        int mode = widgetMode();
        for (int id : appWidgetIds) update(context, manager, id, mode);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int id : appWidgetIds) FinancePlanStore.clearWidget(context, id);
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        updateProvider(context, manager, BudgetMinimalWidget.class, MODE_MINIMAL);
        updateProvider(context, manager, BudgetCompactWidget.class, MODE_COMPACT);
        updateProvider(context, manager, BudgetProgressWidget.class, MODE_CARD);
        updateProvider(context, manager, BudgetDetailedWidget.class, MODE_DETAILED);
    }

    private static void updateProvider(Context context, AppWidgetManager manager, Class<?> provider, int mode) {
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, provider));
        for (int id : ids) update(context, manager, id, mode);
    }

    /** Backward-compatible call used by the original card widget. */
    public static void update(Context context, AppWidgetManager manager, int appWidgetId) {
        update(context, manager, appWidgetId, MODE_CARD);
    }

    /** Update the exact provider style that owns this configured widget id. */
    public static void updateConfiguredWidget(Context context, int appWidgetId) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        AppWidgetProviderInfo info = manager.getAppWidgetInfo(appWidgetId);
        int mode = MODE_CARD;
        if (info != null && info.provider != null) {
            String className = info.provider.getClassName();
            if (BudgetMinimalWidget.class.getName().equals(className)) mode = MODE_MINIMAL;
            else if (BudgetCompactWidget.class.getName().equals(className)) mode = MODE_COMPACT;
            else if (BudgetDetailedWidget.class.getName().equals(className)) mode = MODE_DETAILED;
        }
        update(context, manager, appWidgetId, mode);
    }

    public static String styleNameFor(Context context, int appWidgetId) {
        AppWidgetProviderInfo info = AppWidgetManager.getInstance(context).getAppWidgetInfo(appWidgetId);
        if (info != null && info.provider != null) {
            String className = info.provider.getClassName();
            if (BudgetMinimalWidget.class.getName().equals(className)) return "Minimal · one line";
            if (BudgetCompactWidget.class.getName().equals(className)) return "Compact";
            if (BudgetDetailedWidget.class.getName().equals(className)) return "Detailed";
        }
        return "Card";
    }

    private static void update(Context context, AppWidgetManager manager, int appWidgetId, int mode) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutForMode(mode));
        FinancePlanStore.Budget budget = FinancePlanStore.resolveWidgetBudget(context, appWidgetId);
        if (budget == null) renderEmpty(context, views, mode);
        else renderBudget(context, views, mode, budget);

        Intent open = new Intent(context, BudgetPlanActivity.class);
        PendingIntent pending = PendingIntent.getActivity(
                context,
                9000 + appWidgetId,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_budget_root, pending);
        manager.updateAppWidget(appWidgetId, views);
    }

    private static int layoutForMode(int mode) {
        if (mode == MODE_MINIMAL) return R.layout.widget_budget_minimal;
        if (mode == MODE_COMPACT) return R.layout.widget_budget_compact;
        if (mode == MODE_DETAILED) return R.layout.widget_budget_detailed;
        return R.layout.widget_budget_progress;
    }

    private static void renderEmpty(Context context, RemoteViews views, int mode) {
        if (mode == MODE_MINIMAL) {
            views.setTextViewText(R.id.widget_budget_line, "Pocket Money  ·  set up a budget");
            return;
        }
        views.setTextViewText(R.id.widget_budget_title, "Pocket Money");
        views.setTextViewText(R.id.widget_budget_amount, mode == MODE_DETAILED ? "No budget yet" : "Set up a budget");
        views.setProgressBar(R.id.widget_budget_progress, 1000, 0, false);
        if (mode == MODE_CARD) {
            views.setTextViewText(R.id.widget_budget_detail, "Tap to open Monthly money plan");
        } else if (mode == MODE_DETAILED) {
            views.setTextViewText(R.id.widget_budget_detail, "Create a spending budget");
            views.setTextViewText(R.id.widget_budget_extra, "Tap to open Monthly money plan");
        }
    }

    private static void renderBudget(Context context, RemoteViews views, int mode, FinancePlanStore.Budget budget) {
        long spent = FinancePlanStore.spentCents(context, budget.id);
        long remaining = budget.amountCents - spent;
        int progress = progressPermille(spent, budget.amountCents);
        int usedPercent = budget.amountCents <= 0L ? 0 : (int) Math.round(spent * 100.0 / budget.amountCents);
        boolean over = remaining < 0L;
        String remainingText = remainingText(remaining, budget.currencyCode);

        if (mode == MODE_MINIMAL) {
            views.setTextViewText(R.id.widget_budget_line, budget.name + "  ·  " + remainingText);
            if (over) views.setTextColor(R.id.widget_budget_line, color(context, R.color.danger));
            return;
        }

        views.setTextViewText(R.id.widget_budget_title, budget.name);
        views.setTextViewText(R.id.widget_budget_amount, remainingText);
        views.setProgressBar(R.id.widget_budget_progress, 1000, progress, false);

        if (over) {
            views.setTextColor(
                    R.id.widget_budget_amount,
                    color(context, mode == MODE_DETAILED ? R.color.widget_dark_danger : R.color.danger));
        }

        if (mode == MODE_CARD) {
            String allowance = dailyAllowance(budget, remaining);
            String detail = usedPercent + "% used" + (allowance.isEmpty() ? "" : "  ·  " + allowance);
            views.setTextViewText(R.id.widget_budget_detail, detail);
        } else if (mode == MODE_DETAILED) {
            views.setTextViewText(
                    R.id.widget_budget_detail,
                    MoneyUtils.formatCents(spent, budget.currencyCode)
                            + " spent of " + MoneyUtils.formatCents(budget.amountCents, budget.currencyCode));
            String allowance = dailyAllowance(budget, remaining);
            int daysLeft = daysLeftInCurrentMonth(budget);
            StringBuilder extra = new StringBuilder();
            extra.append(usedPercent).append("% used");
            if (!allowance.isEmpty()) extra.append("  ·  ").append(allowance);
            if (daysLeft > 0) extra.append("  ·  ").append(daysLeft).append(daysLeft == 1 ? " day left" : " days left");
            views.setTextViewText(R.id.widget_budget_extra, extra.toString());
        }
    }

    private static int progressPermille(long spent, long total) {
        if (total <= 0L) return 0;
        return (int) Math.max(0L, Math.min(1000L, spent * 1000L / total));
    }

    private static String remainingText(long remaining, String currencyCode) {
        if (remaining >= 0L) return MoneyUtils.formatCents(remaining, currencyCode) + " left";
        return MoneyUtils.formatCents(Math.abs(remaining), currencyCode) + " over";
    }

    private static String dailyAllowance(FinancePlanStore.Budget budget, long remaining) {
        int daysLeft = daysLeftInCurrentMonth(budget);
        if (remaining <= 0L || daysLeft <= 0) return "";
        return "~" + MoneyUtils.formatCents(remaining / daysLeft, budget.currencyCode) + "/day";
    }

    private static int daysLeftInCurrentMonth(FinancePlanStore.Budget budget) {
        if (!FinancePlanStore.currentMonth().equals(budget.month)) return 0;
        Calendar calendar = Calendar.getInstance();
        return calendar.getActualMaximum(Calendar.DAY_OF_MONTH) - calendar.get(Calendar.DAY_OF_MONTH) + 1;
    }

    private static int color(Context context, int colorId) {
        return context.getResources().getColor(colorId, context.getTheme());
    }
}
''')

write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/widget/BudgetMinimalWidget.java", r'''
package com.example.expensebuttontracker.widget;

/** Ultra-small lock/home-screen budget widget: exactly one line of information. */
public final class BudgetMinimalWidget extends BudgetProgressWidget {
    @Override
    protected int widgetMode() {
        return MODE_MINIMAL;
    }
}
''')

write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/widget/BudgetCompactWidget.java", r'''
package com.example.expensebuttontracker.widget;

/** Small budget widget with name, remaining amount and a slim progress bar. */
public final class BudgetCompactWidget extends BudgetProgressWidget {
    @Override
    protected int widgetMode() {
        return MODE_COMPACT;
    }
}
''')

write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/widget/BudgetDetailedWidget.java", r'''
package com.example.expensebuttontracker.widget;

/** Large information-rich budget widget for a home-screen dashboard. */
public final class BudgetDetailedWidget extends BudgetProgressWidget {
    @Override
    protected int widgetMode() {
        return MODE_DETAILED;
    }
}
''')

write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetWidgetConfigureActivity.java", r'''
package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.FinancePlanStore;
import com.example.expensebuttontracker.util.MoneyUtils;
import com.example.expensebuttontracker.widget.BudgetProgressWidget;

public class BudgetWidgetConfigureActivity extends Activity {
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        appWidgetId = getIntent().getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        root.setBackgroundColor(color(R.color.app_background));
        scroll.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView eyebrow = text("BUDGET WIDGET", 11, true);
        eyebrow.setTextColor(color(R.color.brand_accent));
        root.addView(eyebrow);

        TextView title = text(BudgetProgressWidget.styleNameFor(this, appWidgetId), 27, true);
        title.setPadding(0, dp(3), 0, 0);
        root.addView(title);

        TextView help = text("Choose the current-month budget to show. Automatic prefers Pocket Money and falls back to your first budget.", 14, false);
        help.setTextColor(color(R.color.text_secondary));
        help.setPadding(0, dp(7), 0, dp(18));
        root.addView(help);

        root.addView(button("Automatic", "Pocket Money when available", ""));
        for (FinancePlanStore.Budget budget : FinancePlanStore.listBudgets(this, FinancePlanStore.currentMonth())) {
            long spent = FinancePlanStore.spentCents(this, budget.id);
            long remaining = budget.amountCents - spent;
            String status = remaining >= 0L
                    ? MoneyUtils.formatCents(remaining, budget.currencyCode) + " left"
                    : MoneyUtils.formatCents(Math.abs(remaining), budget.currencyCode) + " over";
            root.addView(button(budget.name, status, budget.id));
        }
        setContentView(scroll);
    }

    private Button button(String label, String subtitle, String budgetId) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label + "\n" + subtitle);
        button.setTextSize(16);
        button.setMinHeight(dp(72));
        button.setGravity(android.view.Gravity.START | android.view.Gravity.CENTER_VERTICAL);
        button.setPadding(dp(16), dp(8), dp(16), dp(8));
        button.setTextColor(color(R.color.text_primary));
        button.setBackgroundResource(R.drawable.rounded_tile);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, dp(10));
        button.setLayoutParams(params);
        button.setOnClickListener(v -> finishWith(budgetId));
        return button;
    }

    private void finishWith(String budgetId) {
        FinancePlanStore.setWidgetBudgetId(this, appWidgetId, budgetId);
        BudgetProgressWidget.updateConfiguredWidget(this, appWidgetId);
        Intent result = new Intent();
        result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    private TextView text(String value, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value);
        t.setTextSize(sp);
        t.setTextColor(color(R.color.text_primary));
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private int color(int id) {
        return getResources().getColor(id, getTheme());
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
''')

write("ExpenseButtonTracker/app/src/main/res/layout/widget_budget_minimal.xml", r'''
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_budget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_bg_minimal"
    android:paddingStart="14dp"
    android:paddingEnd="14dp"
    android:paddingTop="7dp"
    android:paddingBottom="7dp">

    <TextView
        android:id="@+id/widget_budget_line"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:gravity="center_vertical"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="Pocket Money  ·  0 TRY left"
        android:textColor="@color/text_primary"
        android:textSize="14sp"
        android:textStyle="bold" />
</FrameLayout>
''')

write("ExpenseButtonTracker/app/src/main/res/layout/widget_budget_compact.xml", r'''
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_budget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_bg_compact"
    android:orientation="vertical"
    android:paddingStart="14dp"
    android:paddingEnd="14dp"
    android:paddingTop="11dp"
    android:paddingBottom="10dp">

    <TextView
        android:id="@+id/widget_budget_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="Pocket Money"
        android:textColor="@color/text_secondary"
        android:textSize="11sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/widget_budget_amount"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:paddingTop="1dp"
        android:text="0 TRY left"
        android:textColor="@color/text_primary"
        android:textSize="19sp"
        android:textStyle="bold" />

    <ProgressBar
        android:id="@+id/widget_budget_progress"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="6dp"
        android:layout_marginTop="6dp"
        android:max="1000"
        android:progress="0"
        android:progressBackgroundTint="@color/widget_progress_track"
        android:progressTint="@color/brand_accent" />
</LinearLayout>
''')

write("ExpenseButtonTracker/app/src/main/res/layout/widget_budget_progress.xml", r'''
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_budget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/rounded_widget_background"
    android:orientation="vertical"
    android:paddingStart="16dp"
    android:paddingEnd="16dp"
    android:paddingTop="14dp"
    android:paddingBottom="13dp">

    <TextView
        android:id="@+id/widget_budget_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:text="Pocket Money"
        android:textColor="@color/text_secondary"
        android:textSize="12sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/widget_budget_amount"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:paddingTop="2dp"
        android:text="0 TRY left"
        android:textColor="@color/text_primary"
        android:textSize="23sp"
        android:textStyle="bold" />

    <ProgressBar
        android:id="@+id/widget_budget_progress"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="8dp"
        android:layout_marginTop="8dp"
        android:max="1000"
        android:progress="0"
        android:progressBackgroundTint="@color/widget_progress_track"
        android:progressTint="@color/brand_accent" />

    <TextView
        android:id="@+id/widget_budget_detail"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:paddingTop="5dp"
        android:text="0% used"
        android:textColor="@color/text_secondary"
        android:textSize="11sp" />
</LinearLayout>
''')

write("ExpenseButtonTracker/app/src/main/res/layout/widget_budget_detailed.xml", r'''
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/widget_budget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="@drawable/widget_bg_detailed"
    android:orientation="vertical"
    android:paddingStart="18dp"
    android:paddingEnd="18dp"
    android:paddingTop="16dp"
    android:paddingBottom="15dp">

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="MONTHLY BUDGET"
        android:textColor="@color/widget_dark_muted"
        android:textSize="9sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/widget_budget_title"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:paddingTop="2dp"
        android:text="Pocket Money"
        android:textColor="@color/widget_dark_text"
        android:textSize="14sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/widget_budget_amount"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:paddingTop="4dp"
        android:text="0 TRY left"
        android:textColor="@color/widget_dark_text"
        android:textSize="28sp"
        android:textStyle="bold" />

    <TextView
        android:id="@+id/widget_budget_detail"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:paddingTop="2dp"
        android:text="0 spent of 0"
        android:textColor="@color/widget_dark_muted"
        android:textSize="11sp" />

    <ProgressBar
        android:id="@+id/widget_budget_progress"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="9dp"
        android:layout_marginTop="10dp"
        android:max="1000"
        android:progress="0"
        android:progressBackgroundTint="@color/widget_dark_track"
        android:progressTint="@color/widget_dark_progress" />

    <TextView
        android:id="@+id/widget_budget_extra"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:ellipsize="end"
        android:maxLines="1"
        android:paddingTop="7dp"
        android:text="0% used"
        android:textColor="@color/widget_dark_muted"
        android:textSize="11sp" />
</LinearLayout>
''')

write("ExpenseButtonTracker/app/src/main/res/drawable/widget_bg_minimal.xml", r'''
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <corners android:radius="18dp" />
    <gradient android:angle="0" android:startColor="#F8FFFFFF" android:endColor="#F2F6FBFF" />
    <stroke android:width="1dp" android:color="#2A2457A6" />
</shape>
''')

write("ExpenseButtonTracker/app/src/main/res/drawable/widget_bg_compact.xml", r'''
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <corners android:radius="22dp" />
    <gradient android:angle="0" android:startColor="#FFFFFFFF" android:endColor="#FFECF8F4" />
    <stroke android:width="1dp" android:color="#FFD2E7DF" />
</shape>
''')

write("ExpenseButtonTracker/app/src/main/res/drawable/rounded_widget_background.xml", r'''
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <corners android:radius="24dp" />
    <gradient android:angle="0" android:startColor="#FFFFFFFF" android:endColor="#FFEEF4FF" />
    <stroke android:width="1dp" android:color="#FFCAD8F0" />
</shape>
''')

write("ExpenseButtonTracker/app/src/main/res/drawable/widget_bg_detailed.xml", r'''
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <corners android:radius="26dp" />
    <gradient android:angle="0" android:startColor="#FF173C75" android:endColor="#FF2457A6" />
</shape>
''')

write("ExpenseButtonTracker/app/src/main/res/xml/widget_budget_minimal.xml", r'''
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="170dp"
    android:minHeight="38dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_budget_minimal"
    android:previewLayout="@layout/widget_budget_minimal"
    android:resizeMode="horizontal"
    android:widgetCategory="home_screen|keyguard"
    android:configure="com.example.expensebuttontracker.ui.BudgetWidgetConfigureActivity" />
''')

write("ExpenseButtonTracker/app/src/main/res/xml/widget_budget_compact.xml", r'''
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="180dp"
    android:minHeight="72dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_budget_compact"
    android:previewLayout="@layout/widget_budget_compact"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen|keyguard"
    android:configure="com.example.expensebuttontracker.ui.BudgetWidgetConfigureActivity" />
''')

write("ExpenseButtonTracker/app/src/main/res/xml/widget_budget_progress.xml", r'''
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="220dp"
    android:minHeight="96dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_budget_progress"
    android:previewLayout="@layout/widget_budget_progress"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen|keyguard"
    android:configure="com.example.expensebuttontracker.ui.BudgetWidgetConfigureActivity" />
''')

write("ExpenseButtonTracker/app/src/main/res/xml/widget_budget_detailed.xml", r'''
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="280dp"
    android:minHeight="150dp"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_budget_detailed"
    android:previewLayout="@layout/widget_budget_detailed"
    android:resizeMode="horizontal|vertical"
    android:widgetCategory="home_screen|keyguard"
    android:configure="com.example.expensebuttontracker.ui.BudgetWidgetConfigureActivity" />
''')

# Add widget-specific palette while preserving the application's existing palette.
colors_path = ROOT / "ExpenseButtonTracker/app/src/main/res/values/colors.xml"
colors = colors_path.read_text(encoding="utf-8")
marker = "</resources>"
addition = '''    <color name="widget_progress_track">#DCE5F2</color>\n    <color name="widget_dark_text">#FFFFFF</color>\n    <color name="widget_dark_muted">#C9D9F2</color>\n    <color name="widget_dark_progress">#63E6BE</color>\n    <color name="widget_dark_track">#4DFFFFFF</color>\n    <color name="widget_dark_danger">#FFFFB4AB</color>\n'''
if "widget_dark_progress" not in colors:
    colors = colors.replace(marker, addition + marker)
colors_path.write_text(colors, encoding="utf-8")

# Register the three new providers and rename the original provider as the Card variant.
manifest_path = ROOT / "ExpenseButtonTracker/app/src/main/AndroidManifest.xml"
manifest = manifest_path.read_text(encoding="utf-8")
manifest = manifest.replace('android:label="Budget gauge"', 'android:label="Budget Card"')
anchor = '''        <receiver\n            android:name=".widget.BudgetProgressWidget"'''
providers = '''        <receiver\n            android:name=".widget.BudgetMinimalWidget"\n            android:exported="true"\n            android:label="Budget Minimal · one line">\n            <intent-filter>\n                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n            </intent-filter>\n            <meta-data\n                android:name="android.appwidget.provider"\n                android:resource="@xml/widget_budget_minimal" />\n        </receiver>\n\n        <receiver\n            android:name=".widget.BudgetCompactWidget"\n            android:exported="true"\n            android:label="Budget Compact">\n            <intent-filter>\n                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n            </intent-filter>\n            <meta-data\n                android:name="android.appwidget.provider"\n                android:resource="@xml/widget_budget_compact" />\n        </receiver>\n\n        <receiver\n            android:name=".widget.BudgetDetailedWidget"\n            android:exported="true"\n            android:label="Budget Detailed">\n            <intent-filter>\n                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />\n            </intent-filter>\n            <meta-data\n                android:name="android.appwidget.provider"\n                android:resource="@xml/widget_budget_detailed" />\n        </receiver>\n\n'''
if ".widget.BudgetMinimalWidget" not in manifest:
    manifest = manifest.replace(anchor, providers + anchor)
manifest_path.write_text(manifest, encoding="utf-8")

# Make every variant directly pinnable from Monthly money plan.
plan_path = ROOT / "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java"
plan = plan_path.read_text(encoding="utf-8")
plan = plan.replace(
    'import com.example.expensebuttontracker.widget.BudgetProgressWidget;',
    'import com.example.expensebuttontracker.widget.BudgetCompactWidget;\nimport com.example.expensebuttontracker.widget.BudgetDetailedWidget;\nimport com.example.expensebuttontracker.widget.BudgetMinimalWidget;\nimport com.example.expensebuttontracker.widget.BudgetProgressWidget;')
old_widget_section = '''        root.addView(sectionTitle("Widget"));\n        root.addView(secondaryButton("Pin budget gauge", v -> requestPinBudgetWidget()));\n        TextView widgetHelp = empty("The widget automatically shows Pocket Money when present; its setup screen can choose a different budget. It is also available on compatible lock-screen widget surfaces.");\n        root.addView(widgetHelp);'''
new_widget_section = '''        root.addView(sectionTitle("Budget widgets"));\n        root.addView(secondaryButton("Pin Minimal · one line", v -> requestPinBudgetWidget(BudgetMinimalWidget.class)));\n        root.addView(secondaryButton("Pin Compact", v -> requestPinBudgetWidget(BudgetCompactWidget.class)));\n        root.addView(secondaryButton("Pin Card", v -> requestPinBudgetWidget(BudgetProgressWidget.class)));\n        root.addView(secondaryButton("Pin Detailed", v -> requestPinBudgetWidget(BudgetDetailedWidget.class)));\n        TextView widgetHelp = empty("Four layouts share the same live budget data. Minimal is a true one-line widget; Compact adds a slim progress bar; Card balances glanceability and detail; Detailed is a dashboard-style view. Each can choose its own budget and is available on compatible lock-screen widget surfaces.");\n        root.addView(widgetHelp);'''
if old_widget_section not in plan:
    raise SystemExit("Could not find BudgetPlanActivity widget section")
plan = plan.replace(old_widget_section, new_widget_section)
old_method = '''    private void requestPinBudgetWidget() {\n        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { toast("Add Budget gauge from your launcher widget picker."); return; }\n        AppWidgetManager manager = getSystemService(AppWidgetManager.class);\n        if (manager == null || !manager.isRequestPinAppWidgetSupported()) { toast("Add Budget gauge from your launcher widget picker."); return; }\n        manager.requestPinAppWidget(new ComponentName(this, BudgetProgressWidget.class), null, null);\n    }'''
new_method = '''    private void requestPinBudgetWidget(Class<?> providerClass) {\n        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { toast("Add the budget widget from your launcher widget picker."); return; }\n        AppWidgetManager manager = getSystemService(AppWidgetManager.class);\n        if (manager == null || !manager.isRequestPinAppWidgetSupported()) { toast("Add the budget widget from your launcher widget picker."); return; }\n        manager.requestPinAppWidget(new ComponentName(this, providerClass), null, null);\n    }'''
if old_method not in plan:
    raise SystemExit("Could not find BudgetPlanActivity pin method")
plan = plan.replace(old_method, new_method)
plan_path.write_text(plan, encoding="utf-8")

# Bump the Android release for the existing signed auto-update path.
gradle_path = ROOT / "ExpenseButtonTracker/app/build.gradle"
gradle = gradle_path.read_text(encoding="utf-8")
if "versionCode 12" not in gradle or "versionName '2.5.0'" not in gradle:
    raise SystemExit("Unexpected Android version before widget update")
gradle = gradle.replace("versionCode 12", "versionCode 13")
gradle = gradle.replace("versionName '2.5.0'", "versionName '2.5.1'")
gradle_path.write_text(gradle, encoding="utf-8")

print("Pretty budget widget family applied.")
