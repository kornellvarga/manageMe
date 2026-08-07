package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.content.ContentValues;
import android.database.Cursor;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.EntryType;
import com.example.expensebuttontracker.data.ExpenseDbHelper;
import com.example.expensebuttontracker.data.EntryFxStore;
import com.example.expensebuttontracker.data.MoneyEntry;
import com.example.expensebuttontracker.sync.FinanceSyncClient;
import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.MoneyUtils;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public final class EditEntryActivity extends Activity {
    public static final String EXTRA_ENTRY_ID = "money_entry_id";
    private static final String DATE_PATTERN = "yyyy-MM-dd HH:mm";
    private static final String FX_DATE_PATTERN = "yyyy-MM-dd";

    private ExpenseDbHelper db;
    private long entryId;
    private String selectedType;
    private String selectedCurrency;
    private Button expenseButton;
    private Button incomeButton;
    private LinearLayout currencyRow;
    private EditText categoryInput;
    private EditText amountInput;
    private EditText nameInput;
    private EditText dateInput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        db = new ExpenseDbHelper(this);
        entryId = getIntent().getLongExtra(EXTRA_ENTRY_ID, -1L);
        EntryRecord entry = loadEntry(entryId);
        if (entry == null) {
            Toast.makeText(this, "This entry is no longer available.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        selectedType = entry.type;
        selectedCurrency = entry.currency;
        buildUi(entry);
    }

    private EntryRecord loadEntry(long id) {
        try (Cursor cursor = db.getReadableDatabase().query(
                "entries",
                new String[]{"type", "category", "amount_cents", "currency_code", "name", "created_at"},
                "id = ? AND deleted_at IS NULL",
                new String[]{String.valueOf(id)},
                null,
                null,
                null,
                "1")) {
            if (!cursor.moveToFirst()) return null;
            return new EntryRecord(
                    cursor.getString(0),
                    cursor.getString(1),
                    cursor.getLong(2),
                    CurrencyUtils.normalize(cursor.getString(3)),
                    cursor.getString(4),
                    cursor.getLong(5));
        }
    }

    private void buildUi(EntryRecord entry) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        root.setBackgroundColor(color(R.color.app_background));
        scroll.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(label("Edit entry", 28, true));
        TextView help = label("Change the fields below. Archive and Delete remain separate actions on the entry menu.", 14, false);
        help.setTextColor(color(R.color.text_secondary));
        help.setPadding(0, dp(6), 0, dp(16));
        root.addView(help);

        LinearLayout typeRow = new LinearLayout(this);
        typeRow.setOrientation(LinearLayout.HORIZONTAL);
        expenseButton = choiceButton("Expense", () -> selectType(EntryType.EXPENSE));
        incomeButton = choiceButton("Income", () -> selectType(EntryType.INCOME));
        typeRow.addView(expenseButton, weighted(true));
        typeRow.addView(incomeButton, weighted(false));
        root.addView(typeRow);
        root.addView(spacer(12));

        categoryInput = textInput("Category", entry.category, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        root.addView(field("Category", categoryInput));
        root.addView(spacer(10));

        amountInput = textInput("Amount", MoneyUtils.formatPlainDecimal(entry.amountCents), InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        root.addView(field("Amount", amountInput));
        root.addView(spacer(10));

        root.addView(label("Currency", 15, true));
        currencyRow = new LinearLayout(this);
        currencyRow.setOrientation(LinearLayout.HORIZONTAL);
        currencyRow.setPadding(0, dp(8), 0, 0);
        for (int i = 0; i < CurrencyUtils.SUPPORTED_CURRENCIES.length; i++) {
            String currency = CurrencyUtils.SUPPORTED_CURRENCIES[i];
            Button button = choiceButton(CurrencyUtils.displayCode(currency), () -> selectCurrency(currency));
            button.setTag(currency);
            currencyRow.addView(button, currencyParams(i));
        }
        root.addView(currencyRow);
        root.addView(spacer(10));

        nameInput = textInput("Name", entry.name, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        root.addView(field("Name", nameInput));
        root.addView(spacer(10));

        SimpleDateFormat format = new SimpleDateFormat(DATE_PATTERN, Locale.getDefault());
        dateInput = textInput("Date and time", format.format(new Date(entry.createdAtMillis)), InputType.TYPE_CLASS_DATETIME);
        root.addView(field("Date and time (" + DATE_PATTERN + ")", dateInput));
        root.addView(spacer(10));
        root.addView(fxRateDateView(entry));
        root.addView(spacer(18));

        root.addView(primaryButton("Save changes", this::save));
        root.addView(spacer(8));
        root.addView(secondaryButton("Cancel", this::finish));

        setContentView(scroll);
        refreshChoices();
    }

    private TextView fxRateDateView(EntryRecord entry) {
        EntryFxStore fxStore = new EntryFxStore(this);
        String rateDate;
        try {
            MoneyEntry moneyEntry = new MoneyEntry(
                    entryId,
                    entry.type,
                    entry.category,
                    entry.amountCents,
                    entry.currency,
                    entry.name,
                    entry.createdAtMillis);
            rateDate = fxStore.getRateDate(moneyEntry);
        } finally {
            fxStore.close();
        }

        String text;
        if (rateDate == null || rateDate.isEmpty()) {
            text = "Exchange rate used: pending historical rate";
        } else {
            SimpleDateFormat dayFormat = new SimpleDateFormat(FX_DATE_PATTERN, Locale.US);
            String transactionDate = dayFormat.format(new Date(entry.createdAtMillis));
            text = "Exchange rate used: " + rateDate;
            if (!rateDate.equals(transactionDate)) {
                text += " (latest available before transaction date)";
            }
        }

        TextView view = label(text, 14, false);
        view.setTextColor(color(R.color.text_secondary));
        return view;
    }

    private void save() {
        String category = categoryInput.getText().toString().trim();
        String name = nameInput.getText().toString().trim();
        if (category.isEmpty()) {
            categoryInput.setError("Category is required.");
            return;
        }

        long amountCents;
        try {
            amountCents = MoneyUtils.parseAmountToCents(amountInput.getText().toString());
        } catch (IllegalArgumentException error) {
            amountInput.setError(error.getMessage());
            return;
        }

        long createdAt;
        SimpleDateFormat format = new SimpleDateFormat(DATE_PATTERN, Locale.getDefault());
        format.setLenient(false);
        try {
            Date parsed = format.parse(dateInput.getText().toString().trim());
            if (parsed == null) throw new ParseException("Invalid date", 0);
            createdAt = parsed.getTime();
        } catch (ParseException error) {
            dateInput.setError("Use " + DATE_PATTERN + ".");
            return;
        }

        ContentValues values = new ContentValues();
        values.put("type", selectedType);
        values.put("category", category);
        values.put("amount_cents", amountCents);
        values.put("currency_code", selectedCurrency);
        values.put("name", name.isEmpty() ? category : name);
        values.put("created_at", createdAt);
        values.put("updated_at", System.currentTimeMillis());
        int updated = db.getWritableDatabase().update(
                "entries",
                values,
                "id = ? AND deleted_at IS NULL",
                new String[]{String.valueOf(entryId)});
        if (updated == 0) {
            Toast.makeText(this, "The entry could not be updated.", Toast.LENGTH_LONG).show();
            return;
        }
        EntryFxStore fxStore = new EntryFxStore(this);
        fxStore.invalidate(entryId);
        fxStore.close();
        db.addCategory(selectedType, category);
        FinanceSyncClient.syncAsync(this);
        setResult(RESULT_OK);
        Toast.makeText(this, "Entry updated.", Toast.LENGTH_SHORT).show();
        finish();
    }

    private void selectType(String type) {
        selectedType = type;
        refreshChoices();
    }

    private void selectCurrency(String currency) {
        selectedCurrency = currency;
        refreshChoices();
    }

    private void refreshChoices() {
        styleChoice(expenseButton, EntryType.EXPENSE.equals(selectedType));
        styleChoice(incomeButton, EntryType.INCOME.equals(selectedType));
        if (currencyRow != null) {
            for (int i = 0; i < currencyRow.getChildCount(); i++) {
                View child = currencyRow.getChildAt(i);
                if (child instanceof Button) {
                    Button button = (Button) child;
                    styleChoice(button, selectedCurrency.equals(button.getTag()));
                }
            }
        }
    }

    private LinearLayout field(String title, EditText input) {
        LinearLayout field = new LinearLayout(this);
        field.setOrientation(LinearLayout.VERTICAL);
        field.addView(label(title, 15, true));
        input.setPadding(dp(12), dp(12), dp(12), dp(12));
        field.addView(input, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        return field;
    }

    private EditText textInput(String hint, String value, int inputType) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setText(value);
        input.setTextSize(18);
        input.setSingleLine(true);
        input.setInputType(inputType);
        return input;
    }

    private Button choiceButton(String text, Runnable action) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(text);
        button.setTextSize(16);
        button.setMinHeight(dp(52));
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setOnClickListener(v -> action.run());
        return button;
    }

    private void styleChoice(Button button, boolean selected) {
        if (button == null) return;
        button.setTextColor(selected ? color(android.R.color.white) : color(R.color.text_primary));
        button.setBackgroundResource(selected ? R.drawable.rounded_button : R.drawable.rounded_button_secondary);
    }

    private Button primaryButton(String text, Runnable action) {
        Button button = choiceButton(text, action);
        button.setTextColor(color(android.R.color.white));
        button.setBackgroundResource(R.drawable.rounded_button);
        return button;
    }

    private Button secondaryButton(String text, Runnable action) {
        Button button = choiceButton(text, action);
        button.setTextColor(color(R.color.text_primary));
        button.setBackgroundResource(R.drawable.rounded_button_secondary);
        return button;
    }

    private TextView label(String text, int sp, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(sp);
        view.setTextColor(color(R.color.text_primary));
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private LinearLayout.LayoutParams weighted(boolean left) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        if (left) params.setMargins(0, 0, dp(5), 0);
        else params.setMargins(dp(5), 0, 0, 0);
        return params;
    }

    private LinearLayout.LayoutParams currencyParams(int index) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        params.setMargins(index == 0 ? 0 : dp(4), 0,
                index == CurrencyUtils.SUPPORTED_CURRENCIES.length - 1 ? 0 : dp(4), 0);
        return params;
    }

    private Space spacer(int size) {
        Space space = new Space(this);
        space.setLayoutParams(new LinearLayout.LayoutParams(1, dp(size)));
        return space;
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private int color(int resource) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) return getColor(resource);
        return getResources().getColor(resource);
    }

    @Override
    protected void onDestroy() {
        if (db != null) db.close();
        super.onDestroy();
    }

    private static final class EntryRecord {
        final String type;
        final String category;
        final long amountCents;
        final String currency;
        final String name;
        final long createdAtMillis;

        EntryRecord(String type, String category, long amountCents, String currency, String name, long createdAtMillis) {
            this.type = type;
            this.category = category;
            this.amountCents = amountCents;
            this.currency = currency;
            this.name = name;
            this.createdAtMillis = createdAtMillis;
        }
    }
}
