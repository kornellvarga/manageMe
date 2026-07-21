package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.text.TextUtils;
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
import com.example.expensebuttontracker.data.Category;
import com.example.expensebuttontracker.data.EntryType;
import com.example.expensebuttontracker.data.ExpenseDbHelper;

import java.util.List;

public class CategoriesActivity extends Activity {
    private ExpenseDbHelper db;
    private LinearLayout root;
    private LinearLayout listContainer;
    private EditText categoryInput;
    private String selectedType = EntryType.EXPENSE;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        db = new ExpenseDbHelper(this);
        buildUi();
        refreshList();
    }

    private void buildUi() {
        ScrollView scrollView = new ScrollView(this);
        scrollView.setFillViewport(true);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        root.setBackgroundColor(color(R.color.app_background));
        scrollView.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = label("Manage categories", 28, true);
        root.addView(title);

        TextView helper = new TextView(this);
        helper.setText("Categories are used by the widget quick-add selector. Deleting a category does not delete old entries.");
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

        LinearLayout addCard = card();
        categoryInput = new EditText(this);
        categoryInput.setHint("New category name");
        categoryInput.setSingleLine(true);
        categoryInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        categoryInput.setTextSize(18);
        categoryInput.setPadding(dp(12), dp(12), dp(12), dp(12));
        addCard.addView(categoryInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
        addCard.addView(spacer(10));
        addCard.addView(primaryButton("Add category", v -> addCategory()));
        root.addView(addCard);

        TextView listTitle = label("Current categories", 20, true);
        listTitle.setPadding(0, dp(18), 0, dp(8));
        root.addView(listTitle);

        listContainer = new LinearLayout(this);
        listContainer.setOrientation(LinearLayout.VERTICAL);
        root.addView(listContainer);

        root.addView(spacer(14));
        root.addView(secondaryButton("Done", v -> finish()));

        setContentView(scrollView);
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
            rebuildTypeRow();
            refreshList();
        });
        return button;
    }

    private void rebuildTypeRow() {
        buildUi();
        refreshList();
    }

    private void addCategory() {
        boolean added = db.addCategory(selectedType, categoryInput.getText().toString());
        if (added) {
            categoryInput.setText("");
            refreshList();
        } else {
            Toast.makeText(this, "Enter a new unique category name.", Toast.LENGTH_LONG).show();
        }
    }

    private void refreshList() {
        if (listContainer == null) {
            return;
        }
        listContainer.removeAllViews();
        List<Category> categories = db.getCategories(selectedType);
        if (categories.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("No categories yet.");
            empty.setTextSize(15);
            empty.setTextColor(color(R.color.text_secondary));
            listContainer.addView(empty);
            return;
        }
        for (int i = 0; i < categories.size(); i++) {
            addGridTile(listContainer, categoryRow(categories.get(i)), i, i == categories.size() - 1);
        }
    }

    private View categoryRow(Category category) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(126));
        row.setPadding(dp(14), dp(14), dp(14), dp(14));
        row.setBackgroundResource(R.drawable.rounded_tile);

        TextView name = new TextView(this);
        name.setText(category.name);
        name.setTextSize(17);
        name.setTypeface(Typeface.DEFAULT_BOLD);
        name.setTextColor(color(R.color.text_primary));
        name.setGravity(Gravity.CENTER);
        name.setMaxLines(2);
        name.setEllipsize(TextUtils.TruncateAt.END);
        row.addView(name, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        Button delete = new Button(this);
        delete.setAllCaps(false);
        delete.setText("Delete");
        delete.setTextSize(14);
        delete.setTextColor(color(R.color.danger));
        delete.setBackgroundResource(R.drawable.rounded_button_secondary);
        delete.setOnClickListener(v -> confirmDelete(category));
        LinearLayout.LayoutParams deleteParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        deleteParams.setMargins(0, dp(10), 0, 0);
        row.addView(delete, deleteParams);
        return row;
    }

    private void confirmDelete(Category category) {
        new AlertDialog.Builder(this)
                .setTitle("Delete category?")
                .setMessage("Old entries in " + category.name + " will stay in history.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Delete", (dialog, which) -> {
                    db.deleteCategory(category.id);
                    refreshList();
                })
                .show();
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

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        card.setBackgroundResource(R.drawable.rounded_tile);
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

    private LinearLayout.LayoutParams weightedButtonParams(boolean left) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        if (left) {
            params.setMargins(0, 0, dp(6), 0);
        } else {
            params.setMargins(dp(6), 0, 0, 0);
        }
        return params;
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
