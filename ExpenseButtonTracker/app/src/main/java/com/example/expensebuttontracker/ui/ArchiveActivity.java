package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DatePickerDialog;
import android.content.Intent;
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
import com.example.expensebuttontracker.data.FinanceArchiveStore;
import com.example.expensebuttontracker.data.MoneyEntry;
import com.example.expensebuttontracker.sync.FinanceSyncClient;
import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.MoneyUtils;
import com.example.expensebuttontracker.util.SettingsStore;

import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class ArchiveActivity extends Activity {
    private LinearLayout root;
    private LinearLayout archivedContainer;
    private TextView cutoffText;
    private TextView syncStatusText;
    private long cutoffMillis;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        cutoffMillis = calendar.getTimeInMillis();
        buildUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshArchive();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        root.setBackgroundColor(color(R.color.app_background));
        scroll.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(label("Archive", 28, true));
        TextView subtitle = new TextView(this);
        subtitle.setText("Archived entries stay synchronized and restorable, but do not affect current balances or statistics.");
        subtitle.setTextSize(15);
        subtitle.setTextColor(color(R.color.text_secondary));
        subtitle.setPadding(0, dp(6), 0, dp(16));
        root.addView(subtitle);

        LinearLayout bulkCard = card();
        bulkCard.addView(label("Archive everything before a date", 18, true));
        cutoffText = new TextView(this);
        cutoffText.setTextSize(15);
        cutoffText.setTextColor(color(R.color.text_secondary));
        cutoffText.setPadding(0, dp(8), 0, dp(10));
        bulkCard.addView(cutoffText);
        bulkCard.addView(secondaryButton("Choose cutoff date", v -> chooseCutoffDate()));
        bulkCard.addView(spacer(8));
        bulkCard.addView(primaryButton("Archive older current entries", v -> confirmBulkArchive()));
        root.addView(bulkCard);

        root.addView(spacer(16));
        LinearLayout syncCard = card();
        syncCard.addView(label("Finance sync", 18, true));
        syncStatusText = new TextView(this);
        syncStatusText.setTextSize(14);
        syncStatusText.setTextColor(color(R.color.text_secondary));
        syncStatusText.setPadding(0, dp(6), 0, dp(10));
        syncCard.addView(syncStatusText);
        syncCard.addView(secondaryButton("Sync now", v -> syncNow(true)));
        root.addView(syncCard);

        TextView archivedTitle = label("Archived entries", 20, true);
        archivedTitle.setPadding(0, dp(18), 0, dp(8));
        root.addView(archivedTitle);

        archivedContainer = new LinearLayout(this);
        archivedContainer.setOrientation(LinearLayout.VERTICAL);
        root.addView(archivedContainer);

        root.addView(spacer(14));
        root.addView(secondaryButton("Back to Money", v -> finish()));
        setContentView(scroll);
        updateCutoffText();
        refreshArchive();
    }

    private void chooseCutoffDate() {
        Calendar selected = Calendar.getInstance();
        selected.setTimeInMillis(cutoffMillis);
        DatePickerDialog dialog = new DatePickerDialog(
                this,
                (view, year, month, dayOfMonth) -> {
                    Calendar cutoff = Calendar.getInstance();
                    cutoff.set(year, month, dayOfMonth, 0, 0, 0);
                    cutoff.set(Calendar.MILLISECOND, 0);
                    cutoffMillis = cutoff.getTimeInMillis();
                    updateCutoffText();
                },
                selected.get(Calendar.YEAR),
                selected.get(Calendar.MONTH),
                selected.get(Calendar.DAY_OF_MONTH));
        dialog.show();
    }

    private void updateCutoffText() {
        if (cutoffText == null) return;
        String date = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date(cutoffMillis));
        cutoffText.setText("Entries before " + date + " will be archived. Entries on that date remain current.");
    }

    private void confirmBulkArchive() {
        int count = FinanceArchiveStore.countActiveBefore(this, cutoffMillis);
        String date = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date(cutoffMillis));
        if (count == 0) {
            toast("No current entries are older than " + date + ".");
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Archive " + count + " entries?")
                .setMessage("This archives all current entries before " + date + ". They will stop affecting current totals, but can be restored here later.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Archive", (dialog, which) -> {
                    int archived = FinanceArchiveStore.archiveBefore(this, cutoffMillis);
                    refreshArchive();
                    syncNow(false);
                    toast("Archived " + archived + " entries.");
                })
                .show();
    }

    private void refreshArchive() {
        updateCutoffText();
        refreshSyncStatus();
        if (archivedContainer == null) return;
        archivedContainer.removeAllViews();
        List<MoneyEntry> entries = FinanceArchiveStore.getArchivedEntries(this, 500);
        if (entries.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("Nothing is archived yet. Long-press a current entry in Money, or choose a cutoff date above.");
            empty.setTextSize(15);
            empty.setTextColor(color(R.color.text_secondary));
            empty.setPadding(0, dp(8), 0, dp(8));
            archivedContainer.addView(empty);
            return;
        }
        for (MoneyEntry entry : entries) {
            archivedContainer.addView(archivedRow(entry));
            archivedContainer.addView(spacer(10));
        }
    }

    private View archivedRow(MoneyEntry entry) {
        LinearLayout row = card();
        TextView name = label(entry.name, 17, true);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        row.addView(name);

        String sign = EntryType.INCOME.equals(entry.type) ? "+" : "-";
        TextView amount = label(sign + MoneyUtils.formatCents(entry.amountCents, entry.currencyCode), 18, true);
        amount.setTextColor(EntryType.INCOME.equals(entry.type) ? color(R.color.brand_accent) : color(R.color.danger));
        amount.setPadding(0, dp(7), 0, 0);
        row.addView(amount);

        TextView details = new TextView(this);
        details.setText(entry.category + " · " + CurrencyUtils.displayCode(entry.currencyCode) + "\n"
                + DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(entry.createdAtMillis)));
        details.setTextSize(12);
        details.setTextColor(color(R.color.text_secondary));
        details.setPadding(0, dp(7), 0, dp(10));
        row.addView(details);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.addView(secondaryButton("Restore", v -> restoreEntry(entry)), weightedParams(true));
        actions.addView(dangerButton("Delete", v -> confirmDelete(entry)), weightedParams(false));
        row.addView(actions);
        return row;
    }

    private void restoreEntry(MoneyEntry entry) {
        if (FinanceArchiveStore.restoreEntry(this, entry.id)) {
            refreshArchive();
            syncNow(false);
            toast("Restored " + entry.name + ".");
        }
    }

    private void confirmDelete(MoneyEntry entry) {
        new AlertDialog.Builder(this)
                .setTitle("Delete archived entry permanently?")
                .setMessage(entry.name + " will be removed from archived history. This is different from keeping it archived.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Delete", (dialog, which) -> {
                    try (ExpenseDbHelper db = new ExpenseDbHelper(this)) {
                        db.deleteEntry(entry.id);
                    }
                    refreshArchive();
                    syncNow(false);
                })
                .show();
    }

    private void refreshSyncStatus() {
        if (syncStatusText == null) return;
        if (!SettingsStore.hasFinanceSyncCredentials(this)) {
            syncStatusText.setText("Not connected. Return to ManageMe and connect GitHub once.");
            return;
        }
        String error = SettingsStore.getFinanceLastSyncError(this);
        if (!error.isEmpty()) {
            syncStatusText.setText("Last sync failed: " + error);
            return;
        }
        long lastSync = SettingsStore.getFinanceLastSyncAt(this);
        long revision = SettingsStore.getFinanceLastRevision(this);
        if (lastSync <= 0L) {
            syncStatusText.setText("Connected. Waiting for the first money sync.");
        } else {
            String when = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(lastSync));
            syncStatusText.setText("Synced " + when + " · revision " + revision);
        }
    }

    private void syncNow(boolean userRequested) {
        if (!SettingsStore.hasFinanceSyncCredentials(this)) {
            refreshSyncStatus();
            if (userRequested) toast("Open ManageMe and connect GitHub first.");
            return;
        }
        if (syncStatusText != null) syncStatusText.setText("Syncing money data…");
        FinanceSyncClient.syncAsync(this, (synced, message) -> {
            refreshArchive();
            if (userRequested) toast(message);
        });
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
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private Button primaryButton(String text, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setMinHeight(dp(54));
        button.setText(text);
        button.setTextSize(16);
        button.setTextColor(color(android.R.color.white));
        button.setTypeface(Typeface.DEFAULT_BOLD);
        button.setBackgroundResource(R.drawable.rounded_button);
        button.setOnClickListener(listener);
        return button;
    }

    private Button secondaryButton(String text, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setMinHeight(dp(50));
        button.setText(text);
        button.setTextSize(15);
        button.setTextColor(color(R.color.text_primary));
        button.setBackgroundResource(R.drawable.rounded_button_secondary);
        button.setOnClickListener(listener);
        return button;
    }

    private Button dangerButton(String text, View.OnClickListener listener) {
        Button button = secondaryButton(text, listener);
        button.setTextColor(color(R.color.danger));
        return button;
    }

    private LinearLayout.LayoutParams weightedParams(boolean left) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        params.setMargins(left ? 0 : dp(5), 0, left ? dp(5) : 0, 0);
        return params;
    }

    private Space spacer(int value) {
        Space space = new Space(this);
        space.setLayoutParams(new LinearLayout.LayoutParams(1, dp(value)));
        return space;
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private int color(int resource) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) return getColor(resource);
        return getResources().getColor(resource);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}
