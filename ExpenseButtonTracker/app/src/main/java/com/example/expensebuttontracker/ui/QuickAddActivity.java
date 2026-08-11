package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.Category;
import com.example.expensebuttontracker.data.EntryType;
import com.example.expensebuttontracker.data.ExpenseDbHelper;
import com.example.expensebuttontracker.data.FinancePlanStore;
import com.example.expensebuttontracker.sync.FinanceSyncClient;
import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.MoneyUtils;
import com.example.expensebuttontracker.util.SettingsStore;
import com.example.expensebuttontracker.widget.BudgetProgressWidget;

import java.util.List;
import java.util.Locale;

public class QuickAddActivity extends Activity {
    public static final String EXTRA_ENTRY_TYPE = "com.example.expensebuttontracker.EXTRA_ENTRY_TYPE";
    public static final String EXTRA_BUDGET_ID = "com.example.expensebuttontracker.EXTRA_BUDGET_ID";
    public static final String EXTRA_COMMITMENT_ID = "com.example.expensebuttontracker.EXTRA_COMMITMENT_ID";
    public static final String EXTRA_PRESET_CATEGORY = "com.example.expensebuttontracker.EXTRA_PRESET_CATEGORY";
    public static final String EXTRA_PRESET_AMOUNT_CENTS = "com.example.expensebuttontracker.EXTRA_PRESET_AMOUNT_CENTS";
    public static final String EXTRA_PRESET_CURRENCY = "com.example.expensebuttontracker.EXTRA_PRESET_CURRENCY";
    public static final String EXTRA_PRESET_NAME = "com.example.expensebuttontracker.EXTRA_PRESET_NAME";

    private ExpenseDbHelper db;
    private LinearLayout root;
    private String selectedType = EntryType.EXPENSE;
    private String selectedCategory;
    private String selectedCurrency;
    private String selectedBudgetId;
    private String commitmentId;
    private long presetAmountCents;
    private String presetName = "";
    private Spinner budgetSpinner;
    private List<FinancePlanStore.Budget> budgetChoices;
    private Spinner commitmentSpinner;
    private List<FinancePlanStore.Commitment> commitmentChoices;
    private TextView commitmentHint;
    private EditText amountInputField;
    private EditText nameInputField;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureLockScreenBehavior();
        db = new ExpenseDbHelper(this);
        selectedCurrency = SettingsStore.getEntryCurrency(this);
        Intent source = getIntent();
        selectedBudgetId = source.getStringExtra(EXTRA_BUDGET_ID);
        commitmentId = source.getStringExtra(EXTRA_COMMITMENT_ID);
        presetAmountCents = source.getLongExtra(EXTRA_PRESET_AMOUNT_CENTS, 0L);
        presetName = source.getStringExtra(EXTRA_PRESET_NAME);
        if (presetName == null) presetName = "";
        String presetCurrency = source.getStringExtra(EXTRA_PRESET_CURRENCY);
        if (presetCurrency != null && CurrencyUtils.isSupported(CurrencyUtils.normalize(presetCurrency))) selectedCurrency = CurrencyUtils.normalize(presetCurrency);

        String requestedType = source.getStringExtra(EXTRA_ENTRY_TYPE);
        if (EntryType.isValid(requestedType)) {
            selectedType = requestedType;
        }

        buildShell();
        String presetCategory = source.getStringExtra(EXTRA_PRESET_CATEGORY);
        if (presetCategory != null && !presetCategory.trim().isEmpty()) {
            selectedType = EntryType.EXPENSE;
            selectedCategory = presetCategory.trim();
            showAmountForm();
        } else {
            showCategorySelector();
        }
    }

    protected boolean shouldShowOverLockScreen() {
        return SettingsStore.isLockScreenQuickAddEnabled(this);
    }

    private void configureLockScreenBehavior() {
        if (!shouldShowOverLockScreen()) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
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

    private void showCategorySelector() {
        root.removeAllViews();

        TextView title = label("Choose a category", 28, true);
        root.addView(title);

        TextView helper = new TextView(this);
        helper.setText("Use the large buttons below. Switch to Income when adding money coming in.");
        helper.setTextSize(15);
        helper.setTextColor(color(R.color.text_secondary));
        helper.setPadding(0, dp(6), 0, dp(14));
        root.addView(helper);

        LinearLayout typeRow = new LinearLayout(this);
        typeRow.setOrientation(LinearLayout.HORIZONTAL);
        typeRow.setGravity(Gravity.CENTER);
        typeRow.addView(typeButton("Expense", EntryType.EXPENSE), weightedButtonParams(true));
        typeRow.addView(typeButton("+ Income", EntryType.INCOME), weightedButtonParams(false));
        root.addView(typeRow);
        root.addView(spacer(14));

        List<Category> categories = db.getCategories(selectedType);
        if (categories.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("No categories for " + EntryType.displayName(selectedType).toLowerCase(Locale.ROOT) + " yet.");
            empty.setTextSize(16);
            empty.setTextColor(color(R.color.text_secondary));
            empty.setPadding(0, dp(16), 0, dp(16));
            root.addView(empty);
            root.addView(primaryButton("Manage categories", v -> startActivity(new Intent(this, CategoriesActivity.class))));
        } else {
            LinearLayout categoryGrid = new LinearLayout(this);
            categoryGrid.setOrientation(LinearLayout.VERTICAL);
            for (int i = 0; i < categories.size(); i++) {
                addGridTile(categoryGrid, categoryButton(categories.get(i).name), i, i == categories.size() - 1);
            }
            root.addView(categoryGrid);
        }

        root.addView(spacer(10));
        root.addView(secondaryButton("Cancel", v -> finish()));
    }

    private Button typeButton(String label, String type) {
        boolean selected = type.equals(selectedType);
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setTextSize(16);
        button.setMinHeight(dp(56));
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setTextColor(selected ? color(android.R.color.white) : color(R.color.text_primary));
        button.setBackgroundResource(selected ? R.drawable.rounded_button : R.drawable.rounded_button_secondary);
        button.setOnClickListener(v -> {
            selectedType = type;
            showCategorySelector();
        });
        return button;
    }

    private View categoryButton(String categoryName) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(categoryName);
        button.setTextSize(17);
        button.setMinHeight(dp(94));
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(12), 0, dp(12), 0);
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setTextColor(color(R.color.text_primary));
        button.setBackgroundResource(R.drawable.rounded_tile);
        button.setMaxLines(2);
        button.setEllipsize(TextUtils.TruncateAt.END);
        button.setOnClickListener(v -> {
            selectedCategory = categoryName;
            showAmountForm();
        });
        return button;
    }

    private void showAmountForm() {
        root.removeAllViews();

        TextView title = label("Enter amount", 28, true);
        root.addView(title);

        TextView details = new TextView(this);
        details.setText(EntryType.displayName(selectedType) + " - " + selectedCategory);
        details.setTextSize(17);
        details.setTypeface(Typeface.DEFAULT_BOLD);
        details.setTextColor(EntryType.INCOME.equals(selectedType) ? color(R.color.brand_accent) : color(R.color.danger));
        details.setPadding(0, dp(8), 0, dp(16));
        root.addView(details);

        EditText amountInput = new EditText(this);
        amountInputField = amountInput;
        amountInput.setHint("Amount, e.g. 12.50");
        amountInput.setTextSize(24);
        amountInput.setSingleLine(true);
        amountInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        amountInput.setPadding(dp(12), dp(14), dp(12), dp(14));
        if (presetAmountCents > 0L) amountInput.setText(MoneyUtils.formatPlainDecimal(presetAmountCents));
        root.addView(amountInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(spacer(10));
        TextView currencyLabel = label("Currency", 16, true);
        root.addView(currencyLabel);
        LinearLayout currencyRow = new LinearLayout(this);
        currencyRow.setOrientation(LinearLayout.HORIZONTAL);
        currencyRow.setPadding(0, dp(8), 0, 0);
        for (int i = 0; i < CurrencyUtils.SUPPORTED_CURRENCIES.length; i++) {
            currencyRow.addView(currencyButton(CurrencyUtils.SUPPORTED_CURRENCIES[i], currencyRow), currencyButtonParams(i));
        }
        root.addView(currencyRow);

        root.addView(spacer(10));

        EditText nameInput = new EditText(this);
        nameInputField = nameInput;
        nameInput.setHint("Optional name - default is " + selectedCategory + " #next");
        nameInput.setTextSize(18);
        nameInput.setSingleLine(true);
        nameInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        nameInput.setPadding(dp(12), dp(14), dp(12), dp(14));
        if (!presetName.isEmpty()) nameInput.setText(presetName);
        root.addView(nameInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        if (EntryType.EXPENSE.equals(selectedType)) {
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

        root.addView(spacer(16));
        root.addView(primaryButton("Save", v -> saveEntry(amountInput, nameInput)));
        root.addView(spacer(8));
        LinearLayout actionRow = new LinearLayout(this);
        actionRow.setOrientation(LinearLayout.HORIZONTAL);
        actionRow.addView(secondaryButton("Back", v -> showCategorySelector()), weightedButtonParams(true));
        actionRow.addView(secondaryButton("Cancel", v -> finish()), weightedButtonParams(false));
        root.addView(actionRow);

        amountInput.requestFocus();
        amountInput.postDelayed(() -> {
            InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
            if (imm != null) {
                imm.showSoftInput(amountInput, InputMethodManager.SHOW_IMPLICIT);
            }
        }, 250);
    }

    private void saveEntry(EditText amountInput, EditText nameInput) {
        long cents;
        try {
            cents = MoneyUtils.parseAmountToCents(amountInput.getText().toString());
        } catch (IllegalArgumentException ex) {
            amountInput.setError(ex.getMessage());
            amountInput.requestFocus();
            return;
        }

        try {
            long id = db.addEntry(selectedType, selectedCategory, cents, selectedCurrency, nameInput.getText().toString());
            String syncId = db.getEntrySyncId(id);
            String budgetName = "";
            if (budgetSpinner != null && budgetChoices != null && budgetSpinner.getSelectedItemPosition() > 0) {
                FinancePlanStore.Budget budget = budgetChoices.get(budgetSpinner.getSelectedItemPosition() - 1);
                FinancePlanStore.allocateEntry(this, syncId, budget.id, cents, selectedCurrency);
                selectedBudgetId = budget.id;
                budgetName = budget.name;
            }
            String plannedName = "";
            if (commitmentId != null && !commitmentId.isEmpty()) {
                FinancePlanStore.Commitment planned = FinancePlanStore.getCommitment(this, commitmentId);
                FinancePlanStore.linkCommitment(this, commitmentId, syncId, selectedCurrency);
                plannedName = planned == null ? "planned payment" : planned.name;
            }
            SettingsStore.setEntryCurrency(this, selectedCurrency);
            BudgetProgressWidget.updateAll(this);
            String linkSuffix = budgetName.isEmpty() ? "" : " · budget " + budgetName;
            if (!plannedName.isEmpty()) linkSuffix += " · plan " + plannedName;
            Toast.makeText(this, "Saved " + MoneyUtils.formatCents(cents, selectedCurrency) + " as " + selectedCategory + linkSuffix, Toast.LENGTH_SHORT).show();
            setResult(RESULT_OK, new Intent().putExtra("entry_id", id));
            FinanceSyncClient.syncAsync(this);
            finish();
        } catch (Exception ex) {
            Toast.makeText(this, ex.getMessage() == null ? "Could not save the finance plan link." : ex.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private Button currencyButton(String currencyCode, LinearLayout currencyRow) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(CurrencyUtils.displayCode(currencyCode));
        button.setTextSize(15);
        button.setMinHeight(dp(48));
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setTag(currencyCode);
        styleCurrencyButton(button, currencyCode.equals(selectedCurrency));
        button.setOnClickListener(v -> {
            selectedCurrency = currencyCode;
            SettingsStore.setEntryCurrency(this, currencyCode);
            updateCurrencyButtons(currencyRow);
            rebuildCommitmentSpinner();
            rebuildBudgetSpinner();
        });
        return button;
    }

    private void rebuildCommitmentSpinner() {
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
        if (budgetSpinner == null) return;
        budgetChoices = new java.util.ArrayList<>();
        java.util.ArrayList<String> labels = new java.util.ArrayList<>();
        labels.add("No budget");
        int selectedIndex = 0;
        for (FinancePlanStore.Budget budget : FinancePlanStore.listBudgets(this, FinancePlanStore.currentMonth())) {
            if (!budget.currencyCode.equals(selectedCurrency)) continue;
            budgetChoices.add(budget);
            labels.add(budget.name + " · " + CurrencyUtils.displayCode(budget.currencyCode));
            if (budget.id.equals(selectedBudgetId)) selectedIndex = labels.size() - 1;
        }
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, labels);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        budgetSpinner.setAdapter(adapter);
        budgetSpinner.setSelection(selectedIndex);
    }

    private void updateCurrencyButtons(LinearLayout currencyRow) {
        for (int i = 0; i < currencyRow.getChildCount(); i++) {
            View child = currencyRow.getChildAt(i);
            if (child instanceof Button) {
                Button button = (Button) child;
                Object tag = button.getTag();
                styleCurrencyButton(button, selectedCurrency.equals(tag));
            }
        }
    }

    private void styleCurrencyButton(Button button, boolean selected) {
        button.setTextColor(selected ? color(android.R.color.white) : color(R.color.text_primary));
        button.setBackgroundResource(selected ? R.drawable.rounded_button : R.drawable.rounded_button_secondary);
    }

    private LinearLayout.LayoutParams currencyButtonParams(int index) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        int left = index == 0 ? 0 : dp(4);
        int right = index == CurrencyUtils.SUPPORTED_CURRENCIES.length - 1 ? 0 : dp(4);
        params.setMargins(left, 0, right, 0);
        return params;
    }

    private LinearLayout.LayoutParams weightedButtonParams(boolean left) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        if (left) {
            params.setMargins(0, 0, dp(6), 0);
        } else {
            params.setMargins(dp(6), 0, 0, 0);
        }
        return params;
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

        row.addView(tile, weightedButtonParams(index % 2 == 0));
        if (last && index % 2 == 0) {
            Space empty = new Space(this);
            row.addView(empty, weightedButtonParams(false));
        }
        if (index % 2 != 0 || last) {
            grid.addView(spacer(10));
        }
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
}
