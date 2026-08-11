package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.app.AlertDialog;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.ExpenseDbHelper;
import com.example.expensebuttontracker.data.FinancePlanStore;
import com.example.expensebuttontracker.data.MoneyEntry;
import com.example.expensebuttontracker.sync.FinanceSyncClient;
import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.MoneyUtils;
import com.example.expensebuttontracker.widget.BudgetCompactWidget;
import com.example.expensebuttontracker.widget.BudgetCompactAddWidget;
import com.example.expensebuttontracker.widget.BudgetDetailedWidget;
import com.example.expensebuttontracker.widget.BudgetMinimalWidget;
import com.example.expensebuttontracker.widget.BudgetProgressWidget;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

public class BudgetPlanActivity extends Activity {
    private LinearLayout root;
    private String selectedMonth;
    private ExpenseDbHelper db;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        db = new ExpenseDbHelper(this);
        selectedMonth = FinancePlanStore.currentMonth();
        buildShell();
        render();
    }

    @Override
    protected void onResume() {
        super.onResume();
        render();
        FinanceSyncClient.syncAsync(this, (synced, message) -> render());
    }

    @Override
    protected void onDestroy() {
        if (db != null) db.close();
        super.onDestroy();
    }

    private void buildShell() {
        ScrollView scroll = new ScrollView(this);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(32));
        root.setBackgroundColor(color(R.color.app_background));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        setContentView(scroll);
    }

    private void render() {
        if (root == null) return;
        root.removeAllViews();
        root.addView(label("Monthly money plan", 28, true));
        TextView helper = label("Plan bills separately from spending envelopes. Actual expenses keep their normal category and can also consume a budget.", 14, false);
        helper.setTextColor(color(R.color.text_secondary));
        helper.setPadding(0, dp(6), 0, dp(14));
        root.addView(helper);

        LinearLayout monthRow = new LinearLayout(this);
        monthRow.setOrientation(LinearLayout.HORIZONTAL);
        monthRow.setGravity(Gravity.CENTER_VERTICAL);
        monthRow.addView(smallButton("‹", v -> { selectedMonth = FinancePlanStore.shiftMonth(selectedMonth, -1); render(); }), weighted(true));
        Button month = smallButton(selectedMonth, v -> { selectedMonth = FinancePlanStore.currentMonth(); render(); });
        monthRow.addView(month, weighted(false));
        monthRow.addView(smallButton("›", v -> { selectedMonth = FinancePlanStore.shiftMonth(selectedMonth, 1); render(); }), weighted(false));
        root.addView(monthRow);

        List<FinancePlanStore.Budget> budgets = FinancePlanStore.listBudgets(this, selectedMonth);
        List<FinancePlanStore.Commitment> commitments = FinancePlanStore.listCommitments(this, selectedMonth);

        root.addView(sectionTitle("Plan helper"));
        root.addView(planHelper(budgets, commitments));

        root.addView(sectionTitle("Spending budgets"));
        if (budgets.isEmpty()) root.addView(empty("No spending envelopes yet. Add Pocket Money or another monthly budget."));
        for (FinancePlanStore.Budget budget : budgets) root.addView(budgetCard(budget));
        root.addView(primaryButton("+ Add spending budget", v -> showBudgetDialog(null)));

        root.addView(sectionTitle("Planned payments"));
        if (commitments.isEmpty()) root.addView(empty("No planned payments yet. Add rent, Telekom, subscriptions, or another expected bill."));
        for (FinancePlanStore.Commitment commitment : commitments) root.addView(commitmentCard(commitment));
        root.addView(primaryButton("+ Add planned payment", v -> showCommitmentDialog(null)));

        root.addView(sectionTitle("Budget widgets"));
        root.addView(secondaryButton("Pin Minimal · one line", v -> requestPinBudgetWidget(BudgetMinimalWidget.class)));
        root.addView(secondaryButton("Pin Compact", v -> requestPinBudgetWidget(BudgetCompactWidget.class)));
        root.addView(secondaryButton("Pin Compact + Add", v -> requestPinBudgetWidget(BudgetCompactAddWidget.class)));
        root.addView(secondaryButton("Pin Card", v -> requestPinBudgetWidget(BudgetProgressWidget.class)));
        root.addView(secondaryButton("Pin Detailed", v -> requestPinBudgetWidget(BudgetDetailedWidget.class)));
        TextView widgetHelp = empty("Five layouts share the same live budget data. Compact + Add keeps the gauge and adds a small square + button that opens Quick Add with this widget's budget preselected. Each widget can choose its own budget.");
        root.addView(widgetHelp);
    }

    private View budgetCard(FinancePlanStore.Budget budget) {
        LinearLayout card = card();
        card.addView(label(budget.name, 18, true));
        long spent = FinancePlanStore.spentCents(this, budget.id);
        long remaining = budget.amountCents - spent;
        String amountLabel = remaining >= 0L
                ? MoneyUtils.formatCents(remaining, budget.currencyCode) + " remaining"
                : MoneyUtils.formatCents(Math.abs(remaining), budget.currencyCode) + " over budget";
        TextView amount = label(amountLabel, 20, true);
        if (remaining < 0L) amount.setTextColor(color(R.color.danger));
        amount.setPadding(0, dp(6), 0, dp(4));
        card.addView(amount);
        TextView detail = empty(MoneyUtils.formatCents(spent, budget.currencyCode) + " of " + MoneyUtils.formatCents(budget.amountCents, budget.currencyCode) + " spent" + dailyAllowance(budget, remaining));
        card.addView(detail);
        ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(1000);
        progress.setProgress((int) Math.max(0, Math.min(1000, budget.amountCents == 0 ? 0 : spent * 1000L / budget.amountCents)));
        card.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(18)));
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(8), 0, 0);
        row.addView(smallButton("Spend from this", v -> {
            Intent intent = new Intent(this, QuickAddActivity.class);
            intent.putExtra(QuickAddActivity.EXTRA_BUDGET_ID, budget.id);
            startActivity(intent);
        }), weighted(true));
        row.addView(smallButton("Edit", v -> showBudgetDialog(budget)), weighted(false));
        card.addView(row);
        return card;
    }

    private View planHelper(List<FinancePlanStore.Budget> budgets, List<FinancePlanStore.Commitment> commitments) {
        LinearLayout helper = card();
        helper.addView(label("This month at a glance", 18, true));

        ArrayList<String> over = new ArrayList<>();
        ArrayList<String> available = new ArrayList<>();
        ArrayList<String> under = new ArrayList<>();
        ArrayList<String> unpaid = new ArrayList<>();

        for (FinancePlanStore.Budget budget : budgets) {
            long remaining = budget.amountCents - FinancePlanStore.spentCents(this, budget.id);
            if (remaining < 0L) {
                over.add(budget.name + " — " + MoneyUtils.formatCents(Math.abs(remaining), budget.currencyCode) + " over budget");
            } else if (remaining > 0L) {
                available.add(budget.name + " — " + MoneyUtils.formatCents(remaining, budget.currencyCode));
            }
        }

        for (FinancePlanStore.Commitment commitment : commitments) {
            MoneyEntry actual = actualEntry(commitment);
            if (actual == null) {
                if (!commitment.isPaid()) {
                    unpaid.add(commitment.name + " — planned " + MoneyUtils.formatCents(commitment.plannedAmountCents, commitment.currencyCode));
                }
                continue;
            }
            long variance = actual.amountCents - commitment.plannedAmountCents;
            if (variance > 0L) {
                over.add(commitment.name + " — " + MoneyUtils.formatCents(variance, commitment.currencyCode) + " above planned");
            } else if (variance < 0L) {
                under.add(commitment.name + " — " + MoneyUtils.formatCents(Math.abs(variance), commitment.currencyCode) + " below planned");
            }
        }

        int monthPosition = selectedMonth.compareTo(FinancePlanStore.currentMonth());
        String availableTitle = monthPosition < 0 ? "Unused at month end" : monthPosition > 0 ? "Planned capacity" : "Still available";
        String summary = over.size() + " over plan · " + available.size() + " " + availableTitle.toLowerCase()
                + " · " + unpaid.size() + " unpaid";
        TextView summaryView = empty(summary);
        summaryView.setPadding(0, dp(6), 0, dp(6));
        helper.addView(summaryView);

        addHelperGroup(helper, "Over plan", over, R.color.danger);
        addHelperGroup(helper, availableTitle, available, R.color.text_secondary);
        addHelperGroup(helper, "Paid below plan", under, R.color.brand_accent);
        addHelperGroup(helper, "Still unpaid", unpaid, R.color.text_secondary);

        if (over.isEmpty() && available.isEmpty() && under.isEmpty() && unpaid.isEmpty()) {
            helper.addView(empty("Everything currently matches the plan exactly."));
        }
        return helper;
    }

    private void addHelperGroup(LinearLayout parent, String title, List<String> lines, int colorId) {
        if (lines.isEmpty()) return;
        TextView heading = label(title, 14, true);
        heading.setTextColor(color(colorId));
        heading.setPadding(0, dp(7), 0, dp(2));
        parent.addView(heading);
        StringBuilder text = new StringBuilder();
        for (String line : lines) {
            if (text.length() > 0) text.append("\n");
            text.append("• ").append(line);
        }
        TextView body = empty(text.toString());
        body.setPadding(0, 0, 0, dp(3));
        parent.addView(body);
    }

    private MoneyEntry actualEntry(FinancePlanStore.Commitment commitment) {
        if (db == null || commitment == null || commitment.linkedEntryId == null || commitment.linkedEntryId.isEmpty()) return null;
        return db.getEntryBySyncId(commitment.linkedEntryId);
    }

    private String dailyAllowance(FinancePlanStore.Budget budget, long remaining) {
        if (!selectedMonth.equals(FinancePlanStore.currentMonth()) || remaining <= 0L) return "";
        Calendar calendar = Calendar.getInstance();
        int daysLeft = calendar.getActualMaximum(Calendar.DAY_OF_MONTH) - calendar.get(Calendar.DAY_OF_MONTH) + 1;
        if (daysLeft <= 0) return "";
        return " · ~" + MoneyUtils.formatCents(remaining / daysLeft, budget.currencyCode) + "/day";
    }

    private View commitmentCard(FinancePlanStore.Commitment commitment) {
        LinearLayout card = card();
        MoneyEntry actual = actualEntry(commitment);
        boolean paid = actual != null || commitment.isPaid();
        card.addView(label((paid ? "✓ " : "○ ") + commitment.name, 18, true));

        TextView planned = label("Planned " + MoneyUtils.formatCents(commitment.plannedAmountCents, commitment.currencyCode), 17, true);
        planned.setPadding(0, dp(5), 0, 0);
        card.addView(planned);

        if (actual != null) {
            card.addView(label("Actual " + MoneyUtils.formatCents(actual.amountCents, actual.currencyCode), 17, true));
            long variance = actual.amountCents - commitment.plannedAmountCents;
            TextView varianceView;
            if (variance > 0L) {
                varianceView = empty(MoneyUtils.formatCents(variance, commitment.currencyCode) + " over plan");
                varianceView.setTextColor(color(R.color.danger));
            } else if (variance < 0L) {
                varianceView = empty(MoneyUtils.formatCents(Math.abs(variance), commitment.currencyCode) + " below plan");
                varianceView.setTextColor(color(R.color.brand_accent));
            } else {
                varianceView = empty("Exactly as planned");
            }
            card.addView(varianceView);
        } else if (commitment.isPaid()) {
            card.addView(empty("Payment link is syncing; actual amount will appear here."));
        }

        String details = commitment.category;
        if (!commitment.dueDate.isEmpty()) details += " · due " + commitment.dueDate;
        if (commitment.repeatMonthly) details += " · repeats monthly";
        details += paid ? " · paid" : " · unpaid";
        card.addView(empty(details));

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(8), 0, 0);
        if (!paid) {
            row.addView(smallButton("Record payment", v -> recordPayment(commitment)), weighted(true));
        }
        row.addView(smallButton("Edit", v -> showCommitmentDialog(commitment)), weighted(!paid));
        card.addView(row);
        return card;
    }

    private void recordPayment(FinancePlanStore.Commitment commitment) {
        Intent intent = new Intent(this, QuickAddActivity.class);
        intent.putExtra(QuickAddActivity.EXTRA_PRESET_CATEGORY, commitment.category);
        intent.putExtra(QuickAddActivity.EXTRA_PRESET_AMOUNT_CENTS, commitment.plannedAmountCents);
        intent.putExtra(QuickAddActivity.EXTRA_PRESET_CURRENCY, commitment.currencyCode);
        intent.putExtra(QuickAddActivity.EXTRA_PRESET_NAME, commitment.name);
        intent.putExtra(QuickAddActivity.EXTRA_COMMITMENT_ID, commitment.id);
        startActivity(intent);
    }

    private void showBudgetDialog(FinancePlanStore.Budget existing) {
        LinearLayout box = dialogBox();
        EditText name = input("Name, e.g. Pocket Money");
        EditText amount = moneyInput("Monthly amount");
        Spinner currency = currencySpinner();
        if (existing != null) {
            name.setText(existing.name);
            amount.setText(MoneyUtils.formatPlainDecimal(existing.amountCents));
            selectCurrency(currency, existing.currencyCode);
        }
        box.addView(name); box.addView(amount); box.addView(currency);
        AlertDialog.Builder builder = new AlertDialog.Builder(this).setTitle(existing == null ? "Add spending budget" : "Edit spending budget").setView(box).setNegativeButton("Cancel", null);
        if (existing != null) builder.setNeutralButton("Delete", (d, w) -> mutate(() -> FinancePlanStore.deleteBudget(this, existing.id)));
        builder.setPositiveButton("Save", (d, w) -> {
            try {
                long cents = MoneyUtils.parseAmountToCents(amount.getText().toString());
                FinancePlanStore.saveBudget(this, existing == null ? null : existing.id, name.getText().toString(), selectedMonth, cents, selectedCurrency(currency));
                afterPlanMutation();
            } catch (Exception error) { toast(error.getMessage()); }
        }).show();
    }

    private void showCommitmentDialog(FinancePlanStore.Commitment existing) {
        LinearLayout box = dialogBox();
        EditText name = input("Payment, e.g. Telekom");
        EditText amount = moneyInput("Expected amount");
        Spinner currency = currencySpinner();
        EditText category = input("Expense category (default Bills)");
        EditText due = input("Optional due date YYYY-MM-DD");
        CheckBox repeat = new CheckBox(this);
        repeat.setText("Repeat monthly");
        repeat.setTextColor(color(R.color.text_primary));
        if (existing != null) {
            name.setText(existing.name);
            amount.setText(MoneyUtils.formatPlainDecimal(existing.plannedAmountCents));
            selectCurrency(currency, existing.currencyCode);
            category.setText(existing.category);
            due.setText(existing.dueDate);
            repeat.setChecked(existing.repeatMonthly);
        } else category.setText("Bills");
        box.addView(name); box.addView(amount); box.addView(currency); box.addView(category); box.addView(due); box.addView(repeat);
        AlertDialog.Builder builder = new AlertDialog.Builder(this).setTitle(existing == null ? "Add planned payment" : "Edit planned payment").setView(box).setNegativeButton("Cancel", null);
        if (existing != null) builder.setNeutralButton("Delete", (d, w) -> mutate(() -> FinancePlanStore.deleteCommitment(this, existing.id)));
        builder.setPositiveButton("Save", (d, w) -> {
            try {
                long cents = MoneyUtils.parseAmountToCents(amount.getText().toString());
                FinancePlanStore.saveCommitment(this, existing == null ? null : existing.id, name.getText().toString(), selectedMonth, cents, selectedCurrency(currency), category.getText().toString(), due.getText().toString(), repeat.isChecked());
                afterPlanMutation();
            } catch (Exception error) { toast(error.getMessage()); }
        }).show();
    }

    private void afterPlanMutation() {
        render();
        BudgetProgressWidget.updateAll(this);
        FinanceSyncClient.syncAsync(this, (synced, message) -> render());
    }

    private interface JsonMutation { void run() throws JSONException; }
    private void mutate(JsonMutation mutation) {
        try { mutation.run(); afterPlanMutation(); } catch (Exception error) { toast(error.getMessage()); }
    }

    private void requestPinBudgetWidget(Class<?> providerClass) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { toast("Add the budget widget from your launcher widget picker."); return; }
        AppWidgetManager manager = getSystemService(AppWidgetManager.class);
        if (manager == null || !manager.isRequestPinAppWidgetSupported()) { toast("Add the budget widget from your launcher widget picker."); return; }
        manager.requestPinAppWidget(new ComponentName(this, providerClass), null, null);
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(16), dp(14), dp(16), dp(14)); card.setBackgroundResource(R.drawable.rounded_tile);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT); params.setMargins(0, 0, 0, dp(10)); card.setLayoutParams(params); return card;
    }
    private TextView sectionTitle(String text) { TextView title = label(text, 20, true); title.setPadding(0, dp(20), 0, dp(8)); return title; }
    private TextView empty(String text) { TextView v = label(text, 14, false); v.setTextColor(color(R.color.text_secondary)); v.setPadding(0, dp(4), 0, dp(8)); return v; }
    private TextView label(String text, int sp, boolean bold) { TextView v = new TextView(this); v.setText(text); v.setTextSize(sp); v.setTextColor(color(R.color.text_primary)); if (bold) v.setTypeface(Typeface.DEFAULT_BOLD); return v; }
    private Button primaryButton(String text, View.OnClickListener listener) { Button b = new Button(this); b.setAllCaps(false); b.setText(text); b.setTextSize(16); b.setTextColor(color(android.R.color.white)); b.setTypeface(Typeface.DEFAULT_BOLD); b.setBackgroundResource(R.drawable.rounded_button); b.setOnClickListener(listener); return b; }
    private Button secondaryButton(String text, View.OnClickListener listener) { Button b = new Button(this); b.setAllCaps(false); b.setText(text); b.setTextSize(16); b.setBackgroundResource(R.drawable.rounded_button_secondary); b.setTextColor(color(R.color.text_primary)); b.setOnClickListener(listener); return b; }
    private Button smallButton(String text, View.OnClickListener listener) { Button b = secondaryButton(text, listener); b.setMinHeight(dp(48)); return b; }
    private LinearLayout.LayoutParams weighted(boolean left) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f); p.setMargins(left ? 0 : dp(4), 0, left ? dp(4) : 0, 0); return p; }
    private LinearLayout dialogBox() { LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); int pad = dp(18); box.setPadding(pad, dp(8), pad, 0); return box; }
    private EditText input(String hint) { EditText e = new EditText(this); e.setHint(hint); e.setSingleLine(true); e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES); return e; }
    private EditText moneyInput(String hint) { EditText e = new EditText(this); e.setHint(hint); e.setSingleLine(true); e.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL); return e; }
    private Spinner currencySpinner() { Spinner spinner = new Spinner(this); ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, new String[]{"HUF", "EUR", "TRY"}); adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item); spinner.setAdapter(adapter); selectCurrency(spinner, "TRY"); return spinner; }
    private void selectCurrency(Spinner spinner, String code) { for (int i = 0; i < spinner.getCount(); i++) if (CurrencyUtils.normalize(String.valueOf(spinner.getItemAtPosition(i))).equals(CurrencyUtils.normalize(code))) spinner.setSelection(i); }
    private String selectedCurrency(Spinner spinner) { return CurrencyUtils.normalize(String.valueOf(spinner.getSelectedItem())); }
    private int color(int id) { return getResources().getColor(id, getTheme()); }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void toast(String message) { Toast.makeText(this, message == null ? "Could not update the plan." : message, Toast.LENGTH_LONG).show(); }
}
