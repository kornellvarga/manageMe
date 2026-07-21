package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.EntryType;
import com.example.expensebuttontracker.data.ExpenseDbHelper;
import com.example.expensebuttontracker.data.MoneyEntry;
import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.ExchangeRateStore;
import com.example.expensebuttontracker.util.ExchangeRates;
import com.example.expensebuttontracker.util.MoneyUtils;
import com.example.expensebuttontracker.util.SettingsStore;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class StatisticsActivity extends Activity {
    private static final int[] CHART_COLORS = new int[]{
            0xFF2457A6, 0xFF0F7B63, 0xFFB3261E, 0xFFC06C00,
            0xFF6D4C9A, 0xFF2F7D8A, 0xFF806000, 0xFF4C566A
    };

    private ExpenseDbHelper db;
    private LinearLayout root;
    private String displayCurrency;
    private ExchangeRates exchangeRates;
    private boolean ratesLoading;
    private boolean missingRates;
    private String rateErrorMessage;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        db = new ExpenseDbHelper(this);
        displayCurrency = SettingsStore.getDisplayCurrency(this);
        exchangeRates = ExchangeRateStore.loadCached(this);
        buildShell();
        refreshStats();
        if (exchangeRates == null || exchangeRates.isStale(System.currentTimeMillis())) {
            refreshRates(false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStats();
    }

    private void buildShell() {
        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        root.setBackgroundColor(color(R.color.app_background));
        scrollView.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scrollView);
    }

    private void refreshStats() {
        List<MoneyEntry> entries = db.getAllEntries();
        StatsSnapshot stats = buildSnapshot(entries);

        root.removeAllViews();
        TextView title = label("Statistics", 28, true);
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("All time");
        subtitle.setTextSize(15);
        subtitle.setTextColor(color(R.color.text_secondary));
        subtitle.setPadding(0, dp(6), 0, dp(16));
        root.addView(subtitle);

        root.addView(summaryCard(stats));
        root.addView(spacer(16));
        root.addView(currencyCard(stats));
        root.addView(spacer(16));
        root.addView(chartCard("Expenses by category", stats.expenseItems, stats.expenseTotalCents));
        root.addView(spacer(16));
        root.addView(chartCard("Income by category", stats.incomeItems, stats.incomeTotalCents));
        root.addView(spacer(16));
        root.addView(secondaryButton("Back", v -> finish()));
    }

    private StatsSnapshot buildSnapshot(List<MoneyEntry> entries) {
        missingRates = false;
        StatsSnapshot stats = new StatsSnapshot();
        stats.entryCount = entries.size();

        LinkedHashMap<String, StatsItem> expenses = new LinkedHashMap<>();
        LinkedHashMap<String, StatsItem> income = new LinkedHashMap<>();

        for (MoneyEntry entry : entries) {
            Long converted = convertCents(entry.amountCents, entry.currencyCode, displayCurrency);
            if (converted == null) {
                missingRates = true;
                stats.skippedEntryCount++;
                continue;
            }

            if (EntryType.INCOME.equals(entry.type)) {
                stats.incomeTotalCents += converted;
                addToBucket(income, entry.category, converted);
            } else {
                stats.expenseTotalCents += converted;
                addToBucket(expenses, entry.category, converted);
            }
        }

        stats.expenseItems = sortedItems(expenses);
        stats.incomeItems = sortedItems(income);
        return stats;
    }

    private void addToBucket(Map<String, StatsItem> buckets, String label, long amountCents) {
        StatsItem item = buckets.get(label);
        if (item == null) {
            item = new StatsItem(label);
            buckets.put(label, item);
        }
        item.valueCents += amountCents;
        item.count++;
    }

    private ArrayList<StatsItem> sortedItems(Map<String, StatsItem> buckets) {
        ArrayList<StatsItem> items = new ArrayList<>(buckets.values());
        Collections.sort(items, (left, right) -> Long.compare(right.valueCents, left.valueCents));
        return items;
    }

    private LinearLayout summaryCard(StatsSnapshot stats) {
        LinearLayout card = card(R.drawable.rounded_summary_card);
        card.addView(smallCapsLabel("Net balance"));
        TextView balance = label(MoneyUtils.formatCents(stats.balanceCents(), displayCurrency), 32, true);
        balance.setPadding(0, dp(4), 0, dp(16));
        card.addView(balance);

        LinearLayout statRow = new LinearLayout(this);
        statRow.setOrientation(LinearLayout.HORIZONTAL);
        statRow.addView(summaryTile("Income", MoneyUtils.formatCents(stats.incomeTotalCents, displayCurrency), color(R.color.brand_accent)), weightedParams(true));
        statRow.addView(summaryTile("Expenses", MoneyUtils.formatCents(stats.expenseTotalCents, displayCurrency), color(R.color.danger)), weightedParams(false));
        card.addView(statRow);

        LinearLayout countRow = new LinearLayout(this);
        countRow.setOrientation(LinearLayout.HORIZONTAL);
        countRow.setPadding(0, dp(10), 0, 0);
        countRow.addView(summaryTile("Entries", String.valueOf(stats.entryCount), color(R.color.text_primary)), weightedParams(true));
        countRow.addView(summaryTile("Average expense", MoneyUtils.formatCents(stats.averageExpenseCents(), displayCurrency), color(R.color.text_primary)), weightedParams(false));
        card.addView(countRow);
        return card;
    }

    private LinearLayout summaryTile(String title, String value, int valueColor) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setPadding(dp(14), dp(12), dp(14), dp(12));
        tile.setBackgroundResource(R.drawable.rounded_tile);

        tile.addView(smallCapsLabel(title));
        TextView valueView = label(value, 17, true);
        valueView.setTextColor(valueColor);
        valueView.setPadding(0, dp(4), 0, 0);
        valueView.setSingleLine(true);
        valueView.setEllipsize(TextUtils.TruncateAt.END);
        tile.addView(valueView);
        return tile;
    }

    private LinearLayout currencyCard(StatsSnapshot stats) {
        LinearLayout card = card(R.drawable.rounded_tile);
        card.addView(label("Display currency", 18, true));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(10), 0, dp(10));
        for (int i = 0; i < CurrencyUtils.SUPPORTED_CURRENCIES.length; i++) {
            String currencyCode = CurrencyUtils.SUPPORTED_CURRENCIES[i];
            row.addView(currencyButton(currencyCode), currencyButtonParams(i));
        }
        card.addView(row);

        TextView rateStatus = new TextView(this);
        rateStatus.setText(rateStatusText());
        rateStatus.setTextSize(14);
        rateStatus.setTextColor(color(R.color.text_secondary));
        rateStatus.setPadding(0, 0, 0, dp(8));
        card.addView(rateStatus);

        if (stats.skippedEntryCount > 0) {
            TextView skipped = new TextView(this);
            skipped.setText(stats.skippedEntryCount + " entries need rates before they can be included in " + CurrencyUtils.displayCode(displayCurrency) + ".");
            skipped.setTextSize(13);
            skipped.setTextColor(color(R.color.danger));
            skipped.setPadding(0, 0, 0, dp(10));
            card.addView(skipped);
        }

        card.addView(secondaryButton("Refresh rates", v -> refreshRates(true)));
        return card;
    }

    private LinearLayout chartCard(String title, List<StatsItem> items, long totalCents) {
        LinearLayout card = card(R.drawable.rounded_tile);
        card.addView(label(title, 18, true));

        PieChartView chart = new PieChartView(this);
        chart.setPadding(0, dp(8), 0, dp(8));
        chart.setSlices(toSlices(items));
        card.addView(chart, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(220)));

        if (items.isEmpty() || totalCents <= 0L) {
            TextView empty = new TextView(this);
            empty.setText("No data yet.");
            empty.setTextSize(14);
            empty.setTextColor(color(R.color.text_secondary));
            card.addView(empty);
            return card;
        }

        int limit = Math.min(items.size(), 8);
        for (int i = 0; i < limit; i++) {
            card.addView(legendRow(items.get(i), totalCents, colorForIndex(i)));
        }
        return card;
    }

    private List<PieChartView.Slice> toSlices(List<StatsItem> items) {
        ArrayList<PieChartView.Slice> slices = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            StatsItem item = items.get(i);
            slices.add(new PieChartView.Slice(item.label, item.valueCents, colorForIndex(i)));
        }
        return slices;
    }

    private View legendRow(StatsItem item, long totalCents, int swatchColor) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, dp(8), 0, 0);

        TextView swatch = new TextView(this);
        swatch.setText("");
        swatch.setBackgroundColor(swatchColor);
        LinearLayout.LayoutParams swatchParams = new LinearLayout.LayoutParams(dp(14), dp(14));
        swatchParams.setMargins(0, 0, dp(10), 0);
        row.addView(swatch, swatchParams);

        TextView label = new TextView(this);
        label.setText(item.label + " (" + item.count + ")");
        label.setTextSize(14);
        label.setTextColor(color(R.color.text_primary));
        label.setSingleLine(true);
        label.setEllipsize(TextUtils.TruncateAt.END);
        row.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView amount = new TextView(this);
        amount.setText(MoneyUtils.formatCents(item.valueCents, displayCurrency) + " | " + percent(item.valueCents, totalCents));
        amount.setTextSize(13);
        amount.setTextColor(color(R.color.text_secondary));
        amount.setGravity(Gravity.END);
        row.addView(amount, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        return row;
    }

    private String percent(long value, long total) {
        if (total <= 0L) {
            return "0%";
        }
        return Math.round(100.0 * value / total) + "%";
    }

    private Button currencyButton(String currencyCode) {
        boolean selected = currencyCode.equals(displayCurrency);
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(CurrencyUtils.displayCode(currencyCode));
        button.setTextSize(15);
        button.setMinHeight(dp(48));
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setTextColor(selected ? color(android.R.color.white) : color(R.color.text_primary));
        button.setBackgroundResource(selected ? R.drawable.rounded_button : R.drawable.rounded_button_secondary);
        button.setOnClickListener(v -> {
            displayCurrency = currencyCode;
            SettingsStore.setDisplayCurrency(this, currencyCode);
            refreshStats();
        });
        return button;
    }

    private LinearLayout.LayoutParams currencyButtonParams(int index) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        int left = index == 0 ? 0 : dp(4);
        int right = index == CurrencyUtils.SUPPORTED_CURRENCIES.length - 1 ? 0 : dp(4);
        params.setMargins(left, 0, right, 0);
        return params;
    }

    private void refreshRates(boolean userRequested) {
        if (ratesLoading) {
            return;
        }
        ratesLoading = true;
        refreshStats();
        ExchangeRateStore.fetchLatest(this, new ExchangeRateStore.Callback() {
            @Override
            public void onSuccess(ExchangeRates rates) {
                ratesLoading = false;
                rateErrorMessage = null;
                exchangeRates = rates;
                refreshStats();
                if (userRequested) {
                    toast("Exchange rates updated.");
                }
            }

            @Override
            public void onError(String message) {
                ratesLoading = false;
                rateErrorMessage = message;
                refreshStats();
                if (userRequested) {
                    toast(message);
                }
            }
        });
    }

    private String rateStatusText() {
        if (ratesLoading) {
            return "Rates: updating from Frankfurter...";
        }
        if (rateErrorMessage != null) {
            return "Rates: update failed - " + rateErrorMessage;
        }
        if (exchangeRates == null) {
            return missingRates
                    ? "Rates: not loaded yet. Refresh to convert every currency."
                    : "Rates: not loaded yet. Same-currency values still work offline.";
        }
        String date = exchangeRates.date.isEmpty() ? "" : " | " + exchangeRates.date;
        String missing = missingRates ? " | refresh needed for every currency" : "";
        return "Rates: " + exchangeRates.describe() + date + missing;
    }

    private Long convertCents(long amountCents, String fromCurrency, String toCurrency) {
        String from = CurrencyUtils.normalize(fromCurrency);
        String to = CurrencyUtils.normalize(toCurrency);
        if (from.equals(to)) {
            return amountCents;
        }
        if (exchangeRates == null) {
            return null;
        }
        return exchangeRates.convertCents(amountCents, from, to);
    }

    private int colorForIndex(int index) {
        return CHART_COLORS[index % CHART_COLORS.length];
    }

    private LinearLayout.LayoutParams weightedParams(boolean left) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        if (left) {
            params.setMargins(0, 0, dp(5), 0);
        } else {
            params.setMargins(dp(5), 0, 0, 0);
        }
        return params;
    }

    private TextView smallCapsLabel(String text) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(12);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setTextColor(color(R.color.text_secondary));
        view.setAllCaps(true);
        return view;
    }

    private LinearLayout card(int backgroundRes) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        card.setBackgroundResource(backgroundRes);
        card.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        return card;
    }

    private TextView label(String text, int sp, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(sp);
        view.setTextColor(color(R.color.text_primary));
        if (bold) {
            view.setTypeface(Typeface.DEFAULT_BOLD);
        }
        return view;
    }

    private Button secondaryButton(String text, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setMinHeight(dp(54));
        button.setText(text);
        button.setTextSize(16);
        button.setTextColor(color(R.color.text_primary));
        button.setBackgroundResource(R.drawable.rounded_button_secondary);
        button.setOnClickListener(listener);
        button.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        return button;
    }

    private Space spacer(int dp) {
        Space space = new Space(this);
        space.setLayoutParams(new LinearLayout.LayoutParams(1, dp(dp)));
        return space;
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private int color(int resId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return getColor(resId);
        }
        return getResources().getColor(resId);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }

    private static class StatsSnapshot {
        long incomeTotalCents;
        long expenseTotalCents;
        int entryCount;
        int skippedEntryCount;
        List<StatsItem> expenseItems = new ArrayList<>();
        List<StatsItem> incomeItems = new ArrayList<>();

        long balanceCents() {
            return incomeTotalCents - expenseTotalCents;
        }

        long averageExpenseCents() {
            int count = 0;
            for (StatsItem item : expenseItems) {
                count += item.count;
            }
            if (count == 0) {
                return 0L;
            }
            return Math.round((double) expenseTotalCents / count);
        }
    }

    private static class StatsItem {
        final String label;
        long valueCents;
        int count;

        StatsItem(String label) {
            this.label = label;
        }
    }
}
