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
