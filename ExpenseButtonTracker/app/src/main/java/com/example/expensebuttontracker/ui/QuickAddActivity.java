package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.Category;
import com.example.expensebuttontracker.data.EntryType;
import com.example.expensebuttontracker.data.ExpenseDbHelper;
import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.MoneyUtils;
import com.example.expensebuttontracker.util.SettingsStore;

import java.util.List;
import java.util.Locale;

public class QuickAddActivity extends Activity {
    public static final String EXTRA_ENTRY_TYPE = "com.example.expensebuttontracker.EXTRA_ENTRY_TYPE";

    private ExpenseDbHelper db;
    private LinearLayout root;
    private String selectedType = EntryType.EXPENSE;
    private String selectedCategory;
    private String selectedCurrency;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureLockScreenBehavior();
        db = new ExpenseDbHelper(this);
        selectedCurrency = SettingsStore.getEntryCurrency(this);

        String requestedType = getIntent().getStringExtra(EXTRA_ENTRY_TYPE);
        if (EntryType.isValid(requestedType)) {
            selectedType = requestedType;
        }

        buildShell();
        showCategorySelector();
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
        amountInput.setHint("Amount, e.g. 12.50");
        amountInput.setTextSize(24);
        amountInput.setSingleLine(true);
        amountInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        amountInput.setPadding(dp(12), dp(14), dp(12), dp(14));
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
        nameInput.setHint("Optional name - default is " + selectedCategory + " #next");
        nameInput.setTextSize(18);
        nameInput.setSingleLine(true);
        nameInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        nameInput.setPadding(dp(12), dp(14), dp(12), dp(14));
        root.addView(nameInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

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
            SettingsStore.setEntryCurrency(this, selectedCurrency);
            Toast.makeText(this, "Saved " + MoneyUtils.formatCents(cents, selectedCurrency) + " as " + selectedCategory, Toast.LENGTH_SHORT).show();
            setResult(RESULT_OK, new Intent().putExtra("entry_id", id));
            finish();
        } catch (IllegalArgumentException ex) {
            Toast.makeText(this, ex.getMessage(), Toast.LENGTH_LONG).show();
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
        });
        return button;
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
