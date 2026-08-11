package com.example.expensebuttontracker.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.FinancePlanStore;
import com.example.expensebuttontracker.ui.BudgetPlanActivity;
import com.example.expensebuttontracker.util.MoneyUtils;

public class BudgetProgressWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) update(context, manager, id);
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        for (int id : appWidgetIds) FinancePlanStore.clearWidget(context, id);
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, BudgetProgressWidget.class));
        for (int id : ids) update(context, manager, id);
    }

    public static void update(Context context, AppWidgetManager manager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_budget_progress);
        FinancePlanStore.Budget budget = FinancePlanStore.resolveWidgetBudget(context, appWidgetId);
        if (budget == null) {
            views.setTextViewText(R.id.widget_budget_title, "Pocket Money");
            views.setTextViewText(R.id.widget_budget_amount, "Set up a budget");
            views.setTextViewText(R.id.widget_budget_detail, "Tap to open monthly plan");
            views.setProgressBar(R.id.widget_budget_progress, 1000, 0, false);
        } else {
            long spent = FinancePlanStore.spentCents(context, budget.id);
            long remaining = budget.amountCents - spent;
            int progress = (int) Math.max(0, Math.min(1000, budget.amountCents <= 0 ? 0 : spent * 1000L / budget.amountCents));
            views.setTextViewText(R.id.widget_budget_title, budget.name);
            views.setTextViewText(R.id.widget_budget_amount, MoneyUtils.formatCents(remaining, budget.currencyCode) + " left");
            views.setTextViewText(R.id.widget_budget_detail, MoneyUtils.formatCents(spent, budget.currencyCode) + " / " + MoneyUtils.formatCents(budget.amountCents, budget.currencyCode));
            views.setProgressBar(R.id.widget_budget_progress, 1000, progress, false);
        }
        Intent open = new Intent(context, BudgetPlanActivity.class);
        PendingIntent pending = PendingIntent.getActivity(context, 9000 + appWidgetId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_budget_root, pending);
        manager.updateAppWidget(appWidgetId, views);
    }
}
