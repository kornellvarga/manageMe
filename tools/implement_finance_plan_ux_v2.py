from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text()


def write(path, text):
    (ROOT / path).write_text(text)


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f"Missing replacement anchor in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def replace_between(path, start, end, new_block):
    text = read(path)
    a = text.find(start)
    if a < 0:
        raise SystemExit(f"Missing start anchor in {path}: {start!r}")
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f"Missing end anchor in {path}: {end!r}")
    write(path, text[:a] + new_block + text[b:])


# Release version.
replace_once(
    "ExpenseButtonTracker/app/build.gradle",
    "        versionCode 13\n        versionName '2.5.1'",
    "        versionCode 14\n        versionName '2.5.2'",
)

# Make the minimal widget explicitly one launcher row on Android 12+ and one-cell-resizable on older hosts.
write(
    "ExpenseButtonTracker/app/src/main/res/xml/widget_budget_minimal.xml",
    '''<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:minWidth="170dp"
    android:minHeight="38dp"
    android:minResizeWidth="120dp"
    android:minResizeHeight="38dp"
    android:maxResizeHeight="50dp"
    android:targetCellWidth="4"
    android:targetCellHeight="1"
    android:updatePeriodMillis="1800000"
    android:initialLayout="@layout/widget_budget_minimal"
    android:previewLayout="@layout/widget_budget_minimal"
    android:resizeMode="horizontal"
    android:widgetCategory="home_screen|keyguard"
    android:configure="com.example.expensebuttontracker.ui.BudgetWidgetConfigureActivity" />
''',
)

# Allow the plan UI to resolve a linked synchronized transaction and show actual-vs-planned variance.
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/data/ExpenseDbHelper.java",
    '''    public String getEntrySyncId(long localId) {
        try (Cursor cursor = getReadableDatabase().query(TABLE_ENTRIES, new String[]{"sync_id"}, "id = ?", new String[]{String.valueOf(localId)}, null, null, null, "1")) {
            return cursor.moveToFirst() ? cursor.getString(0) : "";
        }
    }
''',
    '''    public String getEntrySyncId(long localId) {
        try (Cursor cursor = getReadableDatabase().query(TABLE_ENTRIES, new String[]{"sync_id"}, "id = ?", new String[]{String.valueOf(localId)}, null, null, null, "1")) {
            return cursor.moveToFirst() ? cursor.getString(0) : "";
        }
    }

    public MoneyEntry getEntryBySyncId(String syncId) {
        if (syncId == null || syncId.trim().isEmpty()) return null;
        try (Cursor cursor = getReadableDatabase().query(
                TABLE_ENTRIES,
                new String[]{"id", "type", "category", "amount_cents", "currency_code", "name", "created_at"},
                "sync_id = ? AND " + ACTIVE,
                new String[]{syncId.trim()},
                null,
                null,
                null,
                "1")) {
            return cursor.moveToFirst() ? readEntry(cursor) : null;
        }
    }
''',
)

# Quick Add: expose open planned payments directly, independently from budget allocation.
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java",
    "import android.widget.ArrayAdapter;\nimport android.widget.Button;",
    "import android.widget.AdapterView;\nimport android.widget.ArrayAdapter;\nimport android.widget.Button;",
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java",
    '''    private Spinner budgetSpinner;
    private List<FinancePlanStore.Budget> budgetChoices;
''',
    '''    private Spinner budgetSpinner;
    private List<FinancePlanStore.Budget> budgetChoices;
    private Spinner commitmentSpinner;
    private List<FinancePlanStore.Commitment> commitmentChoices;
    private TextView commitmentHint;
    private EditText amountInputField;
    private EditText nameInputField;
''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java",
    '''        EditText amountInput = new EditText(this);
        amountInput.setHint("Amount, e.g. 12.50");''',
    '''        EditText amountInput = new EditText(this);
        amountInputField = amountInput;
        amountInput.setHint("Amount, e.g. 12.50");''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java",
    '''        EditText nameInput = new EditText(this);
        nameInput.setHint("Optional name - default is " + selectedCategory + " #next");''',
    '''        EditText nameInput = new EditText(this);
        nameInputField = nameInput;
        nameInput.setHint("Optional name - default is " + selectedCategory + " #next");''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java",
    '''        if (EntryType.EXPENSE.equals(selectedType)) {
            root.addView(spacer(10));
            root.addView(label("Budget (optional)", 16, true));
            budgetSpinner = new Spinner(this);
            root.addView(budgetSpinner, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            rebuildBudgetSpinner();
        } else {
            budgetSpinner = null;
            budgetChoices = null;
        }
''',
    '''        if (EntryType.EXPENSE.equals(selectedType)) {
            root.addView(spacer(12));
            root.addView(label("Planned expense / bill (optional)", 16, true));
            commitmentSpinner = new Spinner(this);
            root.addView(commitmentSpinner, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            commitmentHint = new TextView(this);
            commitmentHint.setTextSize(13);
            commitmentHint.setTextColor(color(R.color.text_secondary));
            commitmentHint.setPadding(0, dp(4), 0, dp(2));
            root.addView(commitmentHint);
            rebuildCommitmentSpinner();

            root.addView(spacer(10));
            root.addView(label("Spending budget (optional)", 16, true));
            budgetSpinner = new Spinner(this);
            root.addView(budgetSpinner, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            rebuildBudgetSpinner();
        } else {
            commitmentSpinner = null;
            commitmentChoices = null;
            commitmentHint = null;
            budgetSpinner = null;
            budgetChoices = null;
        }
''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java",
    '''            if (commitmentId != null && !commitmentId.isEmpty()) FinancePlanStore.linkCommitment(this, commitmentId, syncId, selectedCurrency);
            SettingsStore.setEntryCurrency(this, selectedCurrency);
            BudgetProgressWidget.updateAll(this);
            String budgetSuffix = budgetName.isEmpty() ? "" : " · " + budgetName;
            Toast.makeText(this, "Saved " + MoneyUtils.formatCents(cents, selectedCurrency) + " as " + selectedCategory + budgetSuffix, Toast.LENGTH_SHORT).show();''',
    '''            String plannedName = "";
            if (commitmentId != null && !commitmentId.isEmpty()) {
                FinancePlanStore.Commitment planned = FinancePlanStore.getCommitment(this, commitmentId);
                FinancePlanStore.linkCommitment(this, commitmentId, syncId, selectedCurrency);
                plannedName = planned == null ? "planned payment" : planned.name;
            }
            SettingsStore.setEntryCurrency(this, selectedCurrency);
            BudgetProgressWidget.updateAll(this);
            String linkSuffix = budgetName.isEmpty() ? "" : " · budget " + budgetName;
            if (!plannedName.isEmpty()) linkSuffix += " · plan " + plannedName;
            Toast.makeText(this, "Saved " + MoneyUtils.formatCents(cents, selectedCurrency) + " as " + selectedCategory + linkSuffix, Toast.LENGTH_SHORT).show();''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java",
    '''            updateCurrencyButtons(currencyRow);
            rebuildBudgetSpinner();
''',
    '''            updateCurrencyButtons(currencyRow);
            rebuildCommitmentSpinner();
            rebuildBudgetSpinner();
''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/QuickAddActivity.java",
    '''    private void rebuildBudgetSpinner() {
''',
    '''    private void rebuildCommitmentSpinner() {
        if (commitmentSpinner == null) return;
        commitmentChoices = new java.util.ArrayList<>();
        java.util.ArrayList<String> labels = new java.util.ArrayList<>();
        labels.add("No planned expense");
        int selectedIndex = 0;
        for (FinancePlanStore.Commitment planned : FinancePlanStore.listCommitments(this, FinancePlanStore.currentMonth())) {
            if (planned.isPaid() || !planned.currencyCode.equals(selectedCurrency)) continue;
            commitmentChoices.add(planned);
            labels.add(planned.name + " · planned " + MoneyUtils.formatCents(planned.plannedAmountCents, planned.currencyCode));
            if (planned.id.equals(commitmentId)) selectedIndex = labels.size() - 1;
        }
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, labels);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        commitmentSpinner.setAdapter(adapter);
        commitmentSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                applyCommitmentSelection(position);
            }

            @Override
            public void onNothingSelected(android.widget.AdapterView<?> parent) {
                commitmentId = null;
            }
        });
        commitmentSpinner.setSelection(selectedIndex);
        applyCommitmentSelection(selectedIndex);
    }

    private void applyCommitmentSelection(int position) {
        if (commitmentHint == null) return;
        if (position <= 0 || commitmentChoices == null || position > commitmentChoices.size()) {
            commitmentId = null;
            commitmentHint.setText(commitmentChoices == null || commitmentChoices.isEmpty()
                    ? "No open planned expenses in this currency for the current month."
                    : "Leave this unlinked when the purchase was not planned in advance.");
            return;
        }
        FinancePlanStore.Commitment planned = commitmentChoices.get(position - 1);
        commitmentId = planned.id;
        if (amountInputField != null && amountInputField.getText().toString().trim().isEmpty()) {
            amountInputField.setText(MoneyUtils.formatPlainDecimal(planned.plannedAmountCents));
            amountInputField.setSelection(amountInputField.getText().length());
        }
        if (nameInputField != null && nameInputField.getText().toString().trim().isEmpty()) {
            nameInputField.setText(planned.name);
        }
        String categoryNote = planned.category.equalsIgnoreCase(selectedCategory)
                ? ""
                : " · planned category " + planned.category + "; transaction stays " + selectedCategory;
        commitmentHint.setText("Planned " + MoneyUtils.formatCents(planned.plannedAmountCents, planned.currencyCode)
                + " · enter the real amount even when it differs" + categoryNote);
    }

    private void rebuildBudgetSpinner() {
''',
)

# Plan UI: actual-vs-planned variance and a concise month helper.
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    '''import com.example.expensebuttontracker.data.FinancePlanStore;
''',
    '''import com.example.expensebuttontracker.data.ExpenseDbHelper;
import com.example.expensebuttontracker.data.FinancePlanStore;
import com.example.expensebuttontracker.data.MoneyEntry;
''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    '''import java.util.Calendar;
import java.util.List;
''',
    '''import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    '''public class BudgetPlanActivity extends Activity {
    private LinearLayout root;
    private String selectedMonth;
''',
    '''public class BudgetPlanActivity extends Activity {
    private LinearLayout root;
    private String selectedMonth;
    private ExpenseDbHelper db;
''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    '''        super.onCreate(savedInstanceState);
        selectedMonth = FinancePlanStore.currentMonth();
''',
    '''        super.onCreate(savedInstanceState);
        db = new ExpenseDbHelper(this);
        selectedMonth = FinancePlanStore.currentMonth();
''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    '''    private void buildShell() {
''',
    '''    @Override
    protected void onDestroy() {
        if (db != null) db.close();
        super.onDestroy();
    }

    private void buildShell() {
''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    '''        root.addView(monthRow);

        root.addView(sectionTitle("Spending budgets"));
        List<FinancePlanStore.Budget> budgets = FinancePlanStore.listBudgets(this, selectedMonth);
        if (budgets.isEmpty()) root.addView(empty("No spending envelopes yet. Add Pocket Money or another monthly budget."));
        for (FinancePlanStore.Budget budget : budgets) root.addView(budgetCard(budget));
        root.addView(primaryButton("+ Add spending budget", v -> showBudgetDialog(null)));

        root.addView(sectionTitle("Planned payments"));
        List<FinancePlanStore.Commitment> commitments = FinancePlanStore.listCommitments(this, selectedMonth);
        if (commitments.isEmpty()) root.addView(empty("No planned payments yet. Add rent, Telekom, subscriptions, or another expected bill."));
        for (FinancePlanStore.Commitment commitment : commitments) root.addView(commitmentCard(commitment));
        root.addView(primaryButton("+ Add planned payment", v -> showCommitmentDialog(null)));
''',
    '''        root.addView(monthRow);

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
''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    '''        TextView amount = label(MoneyUtils.formatCents(remaining, budget.currencyCode) + " remaining", 20, true);
        amount.setPadding(0, dp(6), 0, dp(4));
        card.addView(amount);
''',
    '''        String amountLabel = remaining >= 0L
                ? MoneyUtils.formatCents(remaining, budget.currencyCode) + " remaining"
                : MoneyUtils.formatCents(Math.abs(remaining), budget.currencyCode) + " over budget";
        TextView amount = label(amountLabel, 20, true);
        if (remaining < 0L) amount.setTextColor(color(R.color.danger));
        amount.setPadding(0, dp(6), 0, dp(4));
        card.addView(amount);
''',
)
replace_between(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    "    private View commitmentCard(FinancePlanStore.Commitment commitment) {",
    "    private void recordPayment(FinancePlanStore.Commitment commitment) {",
    '''    private View commitmentCard(FinancePlanStore.Commitment commitment) {
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

''',
)
replace_once(
    "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/BudgetPlanActivity.java",
    '''    private String dailyAllowance(FinancePlanStore.Budget budget, long remaining) {
''',
    '''    private View planHelper(List<FinancePlanStore.Budget> budgets, List<FinancePlanStore.Commitment> commitments) {
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
            if (text.length() > 0) text.append("\\n");
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
''',
)

# Gateway/assistant plan summaries should expose the same variance and helper classifications.
replace_between(
    "gateway/src/finance.ts",
    "export interface FinancePlanSummary {",
    "export function financePlanSummary(ledger: FinanceLedger, rawMonth: unknown): FinancePlanSummary {",
    '''export interface FinancePlanInsight {
  kind: "budget" | "commitment";
  id: string;
  name: string;
  amountCents: number;
  currencyCode: FinanceCurrency;
}

export interface FinancePlanSummary {
  month: string;
  budgets: Array<FinanceBudget & {
    spentCents: number;
    remainingCents: number;
    percentUsed: number;
    status: "available" | "exhausted" | "overspent";
  }>;
  commitments: Array<FinanceCommitment & {
    paid: boolean;
    actualAmountCents?: number;
    actualEntryName?: string;
    varianceCents?: number;
    status: "unpaid" | "on_plan" | "under_plan" | "over_plan";
  }>;
  insights: {
    overspent: FinancePlanInsight[];
    available: FinancePlanInsight[];
    underPlan: FinancePlanInsight[];
    unpaid: FinancePlanInsight[];
  };
}

''',
)
replace_between(
    "gateway/src/finance.ts",
    "export function financePlanSummary(ledger: FinanceLedger, rawMonth: unknown): FinancePlanSummary {",
    "}",
    '''export function financePlanSummary(ledger: FinanceLedger, rawMonth: unknown): FinancePlanSummary {
  const month = normalizeFinanceMonth(rawMonth);
  const liveEntries = new Map(ledger.entries.filter((entry) => !entry.deletedAtMillis).map((entry) => [entry.id, entry]));
  const allocations = (ledger.allocations || []).filter((allocation) => !allocation.deletedAtMillis);
  const budgets = (ledger.budgets || [])
    .filter((budget) => !budget.deletedAtMillis && budget.month === month)
    .map((budget) => {
      const spentCents = allocations
        .filter((allocation) => allocation.budgetId === budget.id && liveEntries.has(allocation.entryId))
        .reduce((sum, allocation) => sum + allocation.amountCents, 0);
      const remainingCents = budget.amountCents - spentCents;
      return {
        ...budget,
        spentCents,
        remainingCents,
        percentUsed: Math.round((spentCents / budget.amountCents) * 1000) / 10,
        status: remainingCents < 0 ? "overspent" as const : remainingCents === 0 ? "exhausted" as const : "available" as const,
      };
    });
  const commitments = (ledger.commitments || [])
    .filter((commitment) => !commitment.deletedAtMillis && commitment.month === month)
    .map((commitment) => {
      const entry = commitment.linkedEntryId ? liveEntries.get(commitment.linkedEntryId) : undefined;
      const varianceCents = entry ? entry.amountCents - commitment.plannedAmountCents : undefined;
      const status = !entry
        ? "unpaid" as const
        : varianceCents! > 0
          ? "over_plan" as const
          : varianceCents! < 0
            ? "under_plan" as const
            : "on_plan" as const;
      return {
        ...commitment,
        paid: Boolean(entry),
        status,
        ...(entry ? {
          actualAmountCents: entry.amountCents,
          actualEntryName: entry.name,
          varianceCents,
        } : {}),
      };
    });

  const insights = {
    overspent: [] as FinancePlanInsight[],
    available: [] as FinancePlanInsight[],
    underPlan: [] as FinancePlanInsight[],
    unpaid: [] as FinancePlanInsight[],
  };
  for (const budget of budgets) {
    if (budget.status === "overspent") {
      insights.overspent.push({ kind: "budget", id: budget.id, name: budget.name, amountCents: Math.abs(budget.remainingCents), currencyCode: budget.currencyCode });
    } else if (budget.status === "available") {
      insights.available.push({ kind: "budget", id: budget.id, name: budget.name, amountCents: budget.remainingCents, currencyCode: budget.currencyCode });
    }
  }
  for (const commitment of commitments) {
    if (commitment.status === "over_plan") {
      insights.overspent.push({ kind: "commitment", id: commitment.id, name: commitment.name, amountCents: commitment.varianceCents || 0, currencyCode: commitment.currencyCode });
    } else if (commitment.status === "under_plan") {
      insights.underPlan.push({ kind: "commitment", id: commitment.id, name: commitment.name, amountCents: Math.abs(commitment.varianceCents || 0), currencyCode: commitment.currencyCode });
    } else if (commitment.status === "unpaid") {
      insights.unpaid.push({ kind: "commitment", id: commitment.id, name: commitment.name, amountCents: commitment.plannedAmountCents, currencyCode: commitment.currencyCode });
    }
  }
  return { month, budgets, commitments, insights };
}''',
)

# The naive end marker above targets the first closing brace after the function start, so repair the finance file by replacing the old remainder if it survived.
finance_text = read("gateway/src/finance.ts")
legacy_tail = '''    });\n  return { month, budgets, commitments };\n}\n'''
if legacy_tail in finance_text:
    finance_text = finance_text.replace(legacy_tail, "", 1)
    write("gateway/src/finance.ts", finance_text)

replace_once(
    "gateway/src/finance-mcp.ts",
    '''    tool("finance_get_plan", "Read monthly money plan", "Read Kornel's planned bills and spending budgets for one month, including spent, remaining, and paid status. Omit month for the current month in Europe/Istanbul.", {''',
    '''    tool("finance_get_plan", "Read monthly money plan", "Read Kornel's planned bills and spending budgets for one month, including spent/remaining budget status, planned-vs-actual payment variance, overspend, unused capacity, and unpaid items. Omit month for the current month in Europe/Istanbul.", {''',
)
replace_once(
    "gateway/src/finance-mcp.ts",
    '''    const remaining = plan.budgets.map((budget) => `${budget.name}: ${formatAmount(budget.remainingCents, budget.currencyCode)} remaining`).join("; ");
    const unpaid = plan.commitments.filter((item) => !item.paid).length;
    const message = plan.budgets.length || plan.commitments.length
      ? `Plan for ${month}: ${remaining || "no spending envelopes"}; ${unpaid} unpaid planned payment${unpaid === 1 ? "" : "s"}.`
      : `No budgets or planned payments are set for ${month}.`;''',
    '''    const remaining = plan.budgets.map((budget) => budget.status === "overspent"
      ? `${budget.name}: ${formatAmount(Math.abs(budget.remainingCents), budget.currencyCode)} over budget`
      : `${budget.name}: ${formatAmount(budget.remainingCents, budget.currencyCode)} remaining`).join("; ");
    const unpaid = plan.insights.unpaid.length;
    const over = plan.insights.overspent.length;
    const message = plan.budgets.length || plan.commitments.length
      ? `Plan for ${month}: ${remaining || "no spending envelopes"}; ${over} item${over === 1 ? "" : "s"} over plan; ${unpaid} unpaid planned payment${unpaid === 1 ? "" : "s"}.`
      : `No budgets or planned payments are set for ${month}.`;''',
)

# Expand tests to lock in variance/coach semantics.
replace_once(
    "gateway/test/finance-planning.test.ts",
    '''  assert.equal(summary.commitments[0].paid, true);
  assert.equal(summary.commitments[0].actualAmountCents, 18000);
  assert.equal(ledger.entries[0].category, "Coffee");
});
''',
    '''  assert.equal(summary.budgets[0].status, "available");
  assert.equal(summary.commitments[0].paid, true);
  assert.equal(summary.commitments[0].actualAmountCents, 18000);
  assert.equal(summary.commitments[0].varianceCents, -102000);
  assert.equal(summary.commitments[0].status, "under_plan");
  assert.equal(summary.insights.available[0].name, "Pocket Money");
  assert.equal(summary.insights.underPlan[0].name, "Telekom");
  assert.equal(ledger.entries[0].category, "Coffee");
});

test("plan summary highlights overspent budgets, over-plan payments, and unpaid payments", () => {
  let ledger = createEmptyFinanceLedger(new Date("2026-08-12T00:00:00Z"));
  let result = apply(ledger, "add_budget", { name: "Pocket Money", month: "2026-08", amountCents: 10000, currencyCode: "TRY" }, "req_budget_over");
  ledger = result.ledger;
  const budgetId = result.entityId!;

  result = apply(ledger, "add_entry", { type: "EXPENSE", category: "Coffee", amountCents: 12000, currencyCode: "TRY", name: "Coffee" }, "req_entry_over");
  ledger = result.ledger;
  const entryId = result.entityId!;
  result = apply(ledger, "set_allocation", { entryId, budgetId }, "req_allocate_over");
  ledger = result.ledger;

  result = apply(ledger, "add_commitment", { name: "Telekom", month: "2026-08", plannedAmountCents: 10000, currencyCode: "TRY", category: "Bills" }, "req_commit_over");
  ledger = result.ledger;
  const paidId = result.entityId!;
  result = apply(ledger, "link_commitment", { id: paidId, entryId }, "req_link_over");
  ledger = result.ledger;

  result = apply(ledger, "add_commitment", { name: "Rent", month: "2026-08", plannedAmountCents: 50000, currencyCode: "TRY", category: "Rent" }, "req_commit_unpaid");
  ledger = result.ledger;

  const summary = financePlanSummary(ledger, "2026-08");
  assert.equal(summary.budgets[0].status, "overspent");
  assert.equal(summary.budgets[0].remainingCents, -2000);
  assert.equal(summary.commitments.find((item) => item.id === paidId)?.status, "over_plan");
  assert.equal(summary.commitments.find((item) => item.id === paidId)?.varianceCents, 2000);
  assert.equal(summary.insights.overspent.length, 2);
  assert.equal(summary.insights.unpaid.length, 1);
  assert.equal(summary.insights.unpaid[0].name, "Rent");
});
''',
)

print("Finance plan UX v2 implementation applied.")
