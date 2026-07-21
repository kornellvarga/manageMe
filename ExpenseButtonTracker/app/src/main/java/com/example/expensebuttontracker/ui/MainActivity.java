package com.example.expensebuttontracker.ui;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.StatusBarManager;
import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.CurrencyTotal;
import com.example.expensebuttontracker.data.EntryType;
import com.example.expensebuttontracker.data.ExpenseDbHelper;
import com.example.expensebuttontracker.data.MoneyEntry;
import com.example.expensebuttontracker.data.Totals;
import com.example.expensebuttontracker.notification.LockScreenQuickAddNotification;
import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.ExchangeRateStore;
import com.example.expensebuttontracker.util.ExchangeRates;
import com.example.expensebuttontracker.qs.ExpenseTileService;
import com.example.expensebuttontracker.util.MoneyUtils;
import com.example.expensebuttontracker.util.SettingsStore;
import com.example.expensebuttontracker.widget.ExpenseQuickAddWidget;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.DateFormat;
import java.util.Date;
import java.util.List;
import java.util.concurrent.Executor;

public class MainActivity extends Activity {
    private static final int REQUEST_EXPORT_CSV = 7001;
    private static final int REQUEST_POST_NOTIFICATIONS = 7002;

    private ExpenseDbHelper db;
    private TextView balanceText;
    private TextView incomeText;
    private TextView expenseText;
    private TextView rateStatusText;
    private LinearLayout displayCurrencyRow;
    private LinearLayout recentEntriesContainer;
    private Switch lockScreenSwitch;
    private Switch lockScreenNotificationSwitch;
    private String displayCurrency;
    private ExchangeRates exchangeRates;
    private boolean ratesLoading;
    private boolean missingRateForDashboard;
    private String rateErrorMessage;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        db = new ExpenseDbHelper(this);
        displayCurrency = SettingsStore.getDisplayCurrency(this);
        exchangeRates = ExchangeRateStore.loadCached(this);
        setTitle("Money tracker");
        buildUi();
        LockScreenQuickAddNotification.update(this);
        if (exchangeRates == null || exchangeRates.isStale(System.currentTimeMillis())) {
            refreshRates(false);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshDashboard();
    }

    private void buildUi() {
        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        root.setBackgroundColor(color(R.color.app_background));
        scrollView.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = new TextView(this);
        title.setText("Money tracker");
        title.setTextSize(28);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setTextColor(color(R.color.text_primary));
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Tap the widget or Quick Settings tile, choose a category, enter the amount, and save.");
        subtitle.setTextSize(15);
        subtitle.setTextColor(color(R.color.text_secondary));
        subtitle.setPadding(0, dp(6), 0, dp(16));
        root.addView(subtitle);

        LinearLayout summaryCard = card(R.drawable.rounded_summary_card);
        TextView balanceLabel = smallCapsLabel("Total balance");
        balanceText = label("$0.00", 32, true);
        balanceText.setPadding(0, dp(4), 0, dp(16));
        summaryCard.addView(balanceLabel);
        summaryCard.addView(balanceText);

        LinearLayout statRow = new LinearLayout(this);
        statRow.setOrientation(LinearLayout.HORIZONTAL);
        incomeText = addStatTile(statRow, "Income", color(R.color.brand_accent), true);
        expenseText = addStatTile(statRow, "Expenses", color(R.color.danger), false);
        summaryCard.addView(statRow);
        root.addView(summaryCard);

        root.addView(spacer(16));
        root.addView(currencyCard());

        TextView actionTitle = label("Actions", 20, true);
        actionTitle.setPadding(0, dp(18), 0, dp(8));
        root.addView(actionTitle);

        LinearLayout actionsGrid = new LinearLayout(this);
        actionsGrid.setOrientation(LinearLayout.VERTICAL);
        addGridTile(actionsGrid, actionTile("Quick add", "Expense or income", R.drawable.rounded_income_tile, v -> openQuickAdd()), 0, false);
        addGridTile(actionsGrid, actionTile("Statistics", "Charts", R.drawable.rounded_tile, v -> startActivity(new Intent(this, StatisticsActivity.class))), 1, false);
        addGridTile(actionsGrid, actionTile("Categories", "Edit tiles", R.drawable.rounded_tile, v -> startActivity(new Intent(this, CategoriesActivity.class))), 2, false);
        addGridTile(actionsGrid, actionTile("Widget", "Pin to home", R.drawable.rounded_tile, v -> requestPinWidget()), 3, false);
        addGridTile(actionsGrid, actionTile("Quick tile", "Android shortcut", R.drawable.rounded_tile, v -> requestQuickSettingsTile()), 4, false);
        addGridTile(actionsGrid, actionTile("Export CSV", "Save entries", R.drawable.rounded_tile, v -> exportCsv()), 5, true);
        root.addView(actionsGrid);

        LinearLayout settingsCard = card(R.drawable.rounded_tile);
        TextView lockTitle = label("Lock-screen quick add", 18, true);
        TextView lockHelp = new TextView(this);
        lockHelp.setText("Allows quick-add screens launched from lock-screen surfaces to appear over the locked phone.");
        lockHelp.setTextSize(14);
        lockHelp.setTextColor(color(R.color.text_secondary));
        lockHelp.setPadding(0, dp(4), 0, dp(8));
        lockScreenSwitch = new Switch(this);
        lockScreenSwitch.setText("Allow quick add while locked");
        lockScreenSwitch.setTextSize(16);
        lockScreenSwitch.setChecked(SettingsStore.isLockScreenQuickAddEnabled(this));
        lockScreenSwitch.setOnCheckedChangeListener(this::onLockSwitchChanged);
        settingsCard.addView(lockTitle);
        settingsCard.addView(lockHelp);
        settingsCard.addView(lockScreenSwitch);

        TextView notificationTitle = label("Lock-screen card", 18, true);
        notificationTitle.setPadding(0, dp(18), 0, 0);
        TextView notificationHelp = new TextView(this);
        notificationHelp.setText("Shows a persistent notification on the lock screen with Expense and Income actions.");
        notificationHelp.setTextSize(14);
        notificationHelp.setTextColor(color(R.color.text_secondary));
        notificationHelp.setPadding(0, dp(4), 0, dp(8));
        lockScreenNotificationSwitch = new Switch(this);
        lockScreenNotificationSwitch.setText("Show lock-screen add card");
        lockScreenNotificationSwitch.setTextSize(16);
        lockScreenNotificationSwitch.setChecked(SettingsStore.isLockScreenNotificationEnabled(this));
        lockScreenNotificationSwitch.setOnCheckedChangeListener(this::onLockNotificationSwitchChanged);
        settingsCard.addView(notificationTitle);
        settingsCard.addView(notificationHelp);
        settingsCard.addView(lockScreenNotificationSwitch);
        root.addView(spacer(16));
        root.addView(settingsCard);

        TextView recentTitle = label("Recent entries", 20, true);
        recentTitle.setPadding(0, dp(18), 0, dp(8));
        root.addView(recentTitle);

        recentEntriesContainer = new LinearLayout(this);
        recentEntriesContainer.setOrientation(LinearLayout.VERTICAL);
        root.addView(recentEntriesContainer);

        setContentView(scrollView);
    }

    private LinearLayout currencyCard() {
        LinearLayout card = card(R.drawable.rounded_tile);
        TextView title = label("Currency", 18, true);
        card.addView(title);

        displayCurrencyRow = new LinearLayout(this);
        displayCurrencyRow.setOrientation(LinearLayout.HORIZONTAL);
        displayCurrencyRow.setPadding(0, dp(10), 0, dp(10));
        rebuildDisplayCurrencyRow();
        card.addView(displayCurrencyRow);

        rateStatusText = new TextView(this);
        rateStatusText.setTextSize(14);
        rateStatusText.setTextColor(color(R.color.text_secondary));
        rateStatusText.setPadding(0, dp(2), 0, dp(8));
        card.addView(rateStatusText);

        card.addView(secondaryButton("Refresh rates", v -> refreshRates(true)));
        refreshRateStatus();
        return card;
    }

    private void rebuildDisplayCurrencyRow() {
        if (displayCurrencyRow == null) {
            return;
        }
        displayCurrencyRow.removeAllViews();
        for (int i = 0; i < CurrencyUtils.SUPPORTED_CURRENCIES.length; i++) {
            String currencyCode = CurrencyUtils.SUPPORTED_CURRENCIES[i];
            displayCurrencyRow.addView(displayCurrencyButton(currencyCode), currencyButtonParams(i));
        }
    }

    private Button displayCurrencyButton(String currencyCode) {
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
            rebuildDisplayCurrencyRow();
            refreshDashboard();
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

    private void refreshDashboard() {
        List<CurrencyTotal> totalsByCurrency = db.getTotalsByCurrency();
        Totals totals = convertTotals(totalsByCurrency);
        balanceText.setText(MoneyUtils.formatCents(totals.balanceCents(), displayCurrency));
        incomeText.setText(MoneyUtils.formatCents(totals.incomeCents, displayCurrency));
        expenseText.setText(MoneyUtils.formatCents(totals.expenseCents, displayCurrency));
        refreshRateStatus();

        recentEntriesContainer.removeAllViews();
        List<MoneyEntry> entries = db.getRecentEntries(40);
        if (entries.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("No entries yet. Use Quick add to create your first expense or income item.");
            empty.setTextSize(15);
            empty.setTextColor(color(R.color.text_secondary));
            empty.setPadding(0, dp(8), 0, dp(8));
            recentEntriesContainer.addView(empty);
            return;
        }

        for (int i = 0; i < entries.size(); i++) {
            addGridTile(recentEntriesContainer, entryRow(entries.get(i)), i, i == entries.size() - 1);
        }
    }

    private Totals convertTotals(List<CurrencyTotal> totalsByCurrency) {
        missingRateForDashboard = false;
        long expense = 0L;
        long income = 0L;
        for (CurrencyTotal total : totalsByCurrency) {
            Long convertedExpense = convertCents(total.expenseCents, total.currencyCode, displayCurrency);
            Long convertedIncome = convertCents(total.incomeCents, total.currencyCode, displayCurrency);
            if (convertedExpense != null) {
                expense += convertedExpense;
            }
            if (convertedIncome != null) {
                income += convertedIncome;
            }
            if (convertedExpense == null || convertedIncome == null) {
                missingRateForDashboard = true;
            }
        }
        return new Totals(expense, income);
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

    private void refreshRates(boolean userRequested) {
        if (ratesLoading) {
            return;
        }
        ratesLoading = true;
        refreshRateStatus();
        ExchangeRateStore.fetchLatest(this, new ExchangeRateStore.Callback() {
            @Override
            public void onSuccess(ExchangeRates rates) {
                ratesLoading = false;
                rateErrorMessage = null;
                exchangeRates = rates;
                refreshDashboard();
                if (userRequested) {
                    toast("Exchange rates updated.");
                }
            }

            @Override
            public void onError(String message) {
                ratesLoading = false;
                rateErrorMessage = message;
                refreshRateStatus();
                refreshDashboard();
                if (userRequested) {
                    toast(message);
                }
            }
        });
    }

    private void refreshRateStatus() {
        if (rateStatusText == null) {
            return;
        }
        if (ratesLoading) {
            rateStatusText.setText("Rates: updating from Frankfurter...");
        } else if (rateErrorMessage != null) {
            rateStatusText.setText("Rates: update failed - " + rateErrorMessage);
        } else if (exchangeRates == null) {
            if (missingRateForDashboard) {
                rateStatusText.setText("Rates: not loaded yet. Refresh to convert every currency.");
            } else {
                rateStatusText.setText("Rates: not loaded yet. Same-currency totals still work offline.");
            }
        } else {
            String date = exchangeRates.date.isEmpty() ? "" : " | " + exchangeRates.date;
            String missing = missingRateForDashboard ? " | refresh needed for every currency" : "";
            rateStatusText.setText("Rates: " + exchangeRates.describe() + date + missing);
        }
    }

    private View entryRow(MoneyEntry entry) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(126));
        row.setPadding(dp(14), dp(14), dp(14), dp(14));
        row.setBackgroundResource(EntryType.INCOME.equals(entry.type)
                ? R.drawable.rounded_income_tile
                : R.drawable.rounded_expense_tile);

        TextView name = new TextView(this);
        name.setText(entry.name);
        name.setTextSize(16);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setTextColor(color(R.color.text_primary));
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        row.addView(name);

        TextView amount = new TextView(this);
        String prefix = EntryType.INCOME.equals(entry.type) ? "+" : "-";
        String amountText = prefix + MoneyUtils.formatCents(entry.amountCents, entry.currencyCode);
        Long convertedAmount = convertCents(entry.amountCents, entry.currencyCode, displayCurrency);
        if (convertedAmount != null && !CurrencyUtils.normalize(entry.currencyCode).equals(displayCurrency)) {
            amountText += " (" + prefix + MoneyUtils.formatCents(convertedAmount, displayCurrency) + ")";
        }
        amount.setText(amountText);
        amount.setTextSize(18);
        amount.setTypeface(Typeface.DEFAULT_BOLD);
        amount.setTextColor(EntryType.INCOME.equals(entry.type) ? color(R.color.brand_accent) : color(R.color.danger));
        amount.setPadding(0, dp(8), 0, 0);
        amount.setMaxLines(2);
        amount.setEllipsize(TextUtils.TruncateAt.END);
        row.addView(amount);

        TextView details = new TextView(this);
        details.setText(entry.category + "\n" +
                DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(entry.createdAtMillis)));
        details.setTextSize(12);
        details.setTextColor(color(R.color.text_secondary));
        details.setPadding(0, dp(8), 0, 0);
        details.setMaxLines(2);
        row.addView(details);

        row.setOnLongClickListener(v -> {
            confirmDelete(entry);
            return true;
        });
        return row;
    }

    private void confirmDelete(MoneyEntry entry) {
        new AlertDialog.Builder(this)
                .setTitle("Delete entry?")
                .setMessage(entry.name + " will be removed.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Delete", (dialog, which) -> {
                    db.deleteEntry(entry.id);
                    refreshDashboard();
                })
                .show();
    }

    private void openQuickAdd() {
        startActivity(new Intent(this, QuickAddActivity.class));
    }

    private void requestPinWidget() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            toast("Long-press your home screen, choose Widgets, then add Expense Button Tracker.");
            return;
        }

        AppWidgetManager manager = getSystemService(AppWidgetManager.class);
        if (manager == null || !manager.isRequestPinAppWidgetSupported()) {
            toast("Your launcher does not support automatic widget pinning. Add it from the launcher widget picker.");
            return;
        }

        ComponentName provider = new ComponentName(this, ExpenseQuickAddWidget.class);
        manager.requestPinAppWidget(provider, null, null);
    }

    private void requestQuickSettingsTile() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            toast("Quick Settings tiles need Android 7.0 or newer.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            StatusBarManager manager = getSystemService(StatusBarManager.class);
            if (manager == null) {
                toastManualTileInstructions();
                return;
            }
            ComponentName component = new ComponentName(this, ExpenseTileService.class);
            Icon icon = Icon.createWithResource(this, R.drawable.ic_tile_add);
            Executor mainExecutor = command -> new Handler(Looper.getMainLooper()).post(command);
            manager.requestAddTileService(component, getString(R.string.qs_tile_label), icon, mainExecutor, result -> {
                if (result == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ADDED) {
                    toast("Quick Settings tile added.");
                } else if (result == StatusBarManager.TILE_ADD_REQUEST_RESULT_TILE_ALREADY_ADDED) {
                    toast("Quick Settings tile is already added.");
                } else {
                    toastManualTileInstructions();
                }
            });
        } else {
            toastManualTileInstructions();
        }
    }

    private void toastManualTileInstructions() {
        toast("Swipe down twice, tap edit, then drag \"Add money entry\" into Quick Settings.");
    }

    private void exportCsv() {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/csv");
        intent.putExtra(Intent.EXTRA_TITLE, "expense-button-tracker.csv");
        try {
            startActivityForResult(intent, REQUEST_EXPORT_CSV);
        } catch (ActivityNotFoundException ex) {
            toast("No file picker is available on this device.");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_EXPORT_CSV && resultCode == RESULT_OK && data != null) {
            Uri uri = data.getData();
            if (uri == null) {
                toast("Export cancelled.");
                return;
            }
            try (OutputStream stream = getContentResolver().openOutputStream(uri)) {
                if (stream == null) {
                    toast("Could not open export file.");
                    return;
                }
                stream.write(db.buildCsv().getBytes(StandardCharsets.UTF_8));
                toast("CSV exported.");
            } catch (IOException ex) {
                toast("Export failed: " + ex.getMessage());
            }
        }
    }

    private void onLockSwitchChanged(CompoundButton buttonView, boolean isChecked) {
        SettingsStore.setLockScreenQuickAddEnabled(this, isChecked);
        ExpenseQuickAddWidget.updateAllWidgets(this);
        LockScreenQuickAddNotification.update(this);
    }

    private void onLockNotificationSwitchChanged(CompoundButton buttonView, boolean isChecked) {
        if (isChecked) {
            SettingsStore.setLockScreenQuickAddEnabled(this, true);
            if (lockScreenSwitch != null && !lockScreenSwitch.isChecked()) {
                lockScreenSwitch.setOnCheckedChangeListener(null);
                lockScreenSwitch.setChecked(true);
                lockScreenSwitch.setOnCheckedChangeListener(this::onLockSwitchChanged);
            }
        }
        if (isChecked && !hasNotificationPermission()) {
            SettingsStore.setLockScreenNotificationEnabled(this, true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_POST_NOTIFICATIONS);
            }
            return;
        }
        SettingsStore.setLockScreenNotificationEnabled(this, isChecked);
        LockScreenQuickAddNotification.update(this);
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true;
        }
        return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_POST_NOTIFICATIONS) {
            return;
        }
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        SettingsStore.setLockScreenNotificationEnabled(this, granted);
        if (lockScreenNotificationSwitch != null) {
            lockScreenNotificationSwitch.setOnCheckedChangeListener(null);
            lockScreenNotificationSwitch.setChecked(granted);
            lockScreenNotificationSwitch.setOnCheckedChangeListener(this::onLockNotificationSwitchChanged);
        }
        LockScreenQuickAddNotification.update(this);
        if (!granted) {
            toast("Notification permission is needed for a lock-screen card.");
        }
    }

    private TextView addStatTile(LinearLayout row, String title, int amountColor, boolean left) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setPadding(dp(14), dp(12), dp(14), dp(12));
        tile.setBackgroundResource(R.drawable.rounded_tile);

        TextView label = smallCapsLabel(title);
        tile.addView(label);

        TextView value = label("$0.00", 18, true);
        value.setTextColor(amountColor);
        value.setPadding(0, dp(4), 0, 0);
        tile.addView(value);

        row.addView(tile, weightedParams(left));
        return value;
    }

    private View actionTile(String title, String subtitle, int backgroundRes, View.OnClickListener listener) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setGravity(Gravity.CENTER_VERTICAL);
        tile.setMinimumHeight(dp(104));
        tile.setPadding(dp(16), dp(16), dp(16), dp(16));
        tile.setBackgroundResource(backgroundRes);
        tile.setClickable(true);
        tile.setFocusable(true);
        tile.setOnClickListener(listener);

        TextView titleView = label(title, 17, true);
        titleView.setSingleLine(true);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        tile.addView(titleView);

        TextView subtitleView = new TextView(this);
        subtitleView.setText(subtitle);
        subtitleView.setTextSize(13);
        subtitleView.setTextColor(color(R.color.text_secondary));
        subtitleView.setPadding(0, dp(6), 0, 0);
        subtitleView.setMaxLines(2);
        tile.addView(subtitleView);

        return tile;
    }

    private void addGridTile(LinearLayout grid, View tile, int index, boolean last) {
        LinearLayout row;
        if (index % 2 == 0) {
            row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            grid.addView(row, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT));
        } else {
            row = (LinearLayout) grid.getChildAt(grid.getChildCount() - 1);
        }

        row.addView(tile, weightedParams(index % 2 == 0));
        if (last && index % 2 == 0) {
            Space empty = new Space(this);
            row.addView(empty, weightedParams(false));
        }
        if (index % 2 != 0 || last) {
            grid.addView(spacer(10));
        }
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

    private Button primaryButton(String text, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setMinHeight(dp(58));
        button.setText(text);
        button.setTextSize(17);
        button.setTextColor(color(android.R.color.white));
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setBackgroundResource(R.drawable.rounded_button);
        button.setOnClickListener(listener);
        button.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        return button;
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
}
