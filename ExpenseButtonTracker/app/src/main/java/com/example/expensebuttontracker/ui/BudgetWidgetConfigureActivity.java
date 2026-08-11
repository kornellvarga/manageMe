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
import com.example.expensebuttontracker.widget.BudgetProgressWidget;

public class BudgetWidgetConfigureActivity extends Activity {
    private int appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        appWidgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return; }

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        root.setBackgroundColor(getResources().getColor(R.color.app_background, getTheme()));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        TextView title = text("Budget gauge", 26, true); root.addView(title);
        TextView help = text("Choose which current-month budget this widget should show. Automatic prefers Pocket Money.", 14, false); help.setPadding(0, dp(6), 0, dp(14)); root.addView(help);
        root.addView(button("Automatic · Pocket Money", ""));
        for (FinancePlanStore.Budget budget : FinancePlanStore.listBudgets(this, FinancePlanStore.currentMonth())) root.addView(button(budget.name, budget.id));
        setContentView(scroll);
    }

    private Button button(String label, String budgetId) {
        Button button = new Button(this); button.setAllCaps(false); button.setText(label); button.setTextSize(17); button.setMinHeight(dp(58)); button.setBackgroundResource(R.drawable.rounded_tile);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); params.setMargins(0, 0, 0, dp(10)); button.setLayoutParams(params);
        button.setOnClickListener(v -> finishWith(budgetId)); return button;
    }

    private void finishWith(String budgetId) {
        FinancePlanStore.setWidgetBudgetId(this, appWidgetId, budgetId);
        BudgetProgressWidget.update(this, AppWidgetManager.getInstance(this), appWidgetId);
        Intent result = new Intent(); result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId); setResult(RESULT_OK, result); finish();
    }
    private TextView text(String value, int sp, boolean bold) { TextView t = new TextView(this); t.setText(value); t.setTextSize(sp); t.setTextColor(getResources().getColor(R.color.text_primary, getTheme())); if (bold) t.setTypeface(Typeface.DEFAULT_BOLD); return t; }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
