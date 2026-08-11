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
