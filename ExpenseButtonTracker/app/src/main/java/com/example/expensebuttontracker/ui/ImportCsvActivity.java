package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.widget.Toast;

import com.example.expensebuttontracker.data.EntryType;
import com.example.expensebuttontracker.data.ExpenseDbHelper;
import com.example.expensebuttontracker.sync.FinanceSyncClient;
import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.MoneyUtils;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * One-time, data-preserving bridge for installations that cannot be upgraded
 * because their original APK was signed with a different certificate.
 *
 * The old tracker exports id, created_at, type, category, amount, currency and
 * name. This activity imports those rows into the separately installable
 * ManageMe Sync flavor while preserving dates, categories and currencies.
 */
public class ImportCsvActivity extends Activity {
    private static final int REQUEST_PICK_CSV = 8101;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri supplied = getIntent() == null ? null : getIntent().getData();
        if (supplied != null) {
            confirmImport(supplied);
        } else {
            chooseCsv();
        }
    }

    private void chooseCsv() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("text/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "text/csv",
                "text/comma-separated-values",
                "application/csv",
                "application/vnd.ms-excel",
                "text/plain"
        });
        try {
            startActivityForResult(intent, REQUEST_PICK_CSV);
        } catch (Exception error) {
            Toast.makeText(this, "No file picker is available on this device.", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_PICK_CSV) return;
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            finish();
            return;
        }
        Uri uri = data.getData();
        try {
            int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (Exception ignored) {
            // The temporary picker permission is enough for the immediate import.
        }
        confirmImport(uri);
    }

    private void confirmImport(Uri uri) {
        String fileName = displayName(uri);
        new AlertDialog.Builder(this)
                .setTitle("Import money history?")
                .setMessage("Import entries from " + fileName + " into this app. Existing matching rows will not be duplicated.")
                .setNegativeButton("Cancel", (dialog, which) -> finish())
                .setPositiveButton("Import", (dialog, which) -> runImport(uri))
                .setOnCancelListener(dialog -> finish())
                .show();
    }

    private void runImport(Uri uri) {
        Toast.makeText(this, "Importing money history…", Toast.LENGTH_SHORT).show();
        executor.execute(() -> {
            try {
                ImportResult result = importCsv(uri);
                runOnUiThread(() -> {
                    Toast.makeText(this,
                            "Imported " + result.imported + " entries" +
                                    (result.skipped > 0 ? " · skipped " + result.skipped + " existing/invalid rows" : ""),
                            Toast.LENGTH_LONG).show();
                    FinanceSyncClient.syncAsync(this);
                    startActivity(new Intent(this, MainActivity.class));
                    finish();
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    String detail = error.getMessage() == null ? "The selected file could not be imported." : error.getMessage();
                    new AlertDialog.Builder(this)
                            .setTitle("Import failed")
                            .setMessage(detail + "\n\nYour original app and CSV have not been changed.")
                            .setPositiveButton("Choose another file", (dialog, which) -> chooseCsv())
                            .setNegativeButton("Close", (dialog, which) -> finish())
                            .show();
                });
            }
        });
    }

    private ImportResult importCsv(Uri uri) throws Exception {
        ExpenseDbHelper helper = new ExpenseDbHelper(this);
        SQLiteDatabase db = helper.getWritableDatabase();
        int imported = 0;
        int skipped = 0;
        boolean headerSeen = false;
        SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
        dateFormat.setLenient(false);

        db.beginTransaction();
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            if (stream == null) throw new IllegalArgumentException("The selected CSV could not be opened.");
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (!headerSeen) {
                        headerSeen = true;
                        line = stripBom(line);
                        List<String> header = parseCsvLine(line);
                        if (header.size() < 7 || !"created_at".equalsIgnoreCase(header.get(1).trim())) {
                            throw new IllegalArgumentException("Choose a CSV exported by the Money tracker.");
                        }
                        continue;
                    }
                    if (line.trim().isEmpty()) continue;
                    List<String> fields = parseCsvLine(line);
                    if (fields.size() < 7) {
                        skipped += 1;
                        continue;
                    }
                    try {
                        String sourceId = fields.get(0).trim();
                        Date created = dateFormat.parse(fields.get(1).trim());
                        String type = normalizeType(fields.get(2));
                        String category = fields.get(3).trim();
                        long amountCents = MoneyUtils.parseAmountToCents(fields.get(4));
                        String currency = CurrencyUtils.normalize(fields.get(5));
                        String name = fields.get(6).trim();
                        if (created == null || category.isEmpty() || name.isEmpty() || amountCents <= 0) {
                            skipped += 1;
                            continue;
                        }
                        long createdAt = created.getTime();
                        ensureCategory(db, type, category, createdAt);
                        if (entryExists(db, type, category, amountCents, currency, name, createdAt)) {
                            skipped += 1;
                            continue;
                        }
                        ContentValues values = new ContentValues();
                        values.put("type", type);
                        values.put("category", category);
                        values.put("amount_cents", amountCents);
                        values.put("currency_code", currency);
                        values.put("name", name);
                        values.put("created_at", createdAt);
                        values.put("sync_id", stableId("money", sourceId + "|" + createdAt + "|" + type + "|" + category + "|" + amountCents + "|" + currency + "|" + name));
                        values.put("updated_at", Math.max(1L, createdAt));
                        values.putNull("deleted_at");
                        long row = db.insertWithOnConflict("entries", null, values, SQLiteDatabase.CONFLICT_IGNORE);
                        if (row == -1L) skipped += 1;
                        else imported += 1;
                    } catch (Exception rowError) {
                        skipped += 1;
                    }
                }
            }
            if (!headerSeen) throw new IllegalArgumentException("The selected CSV is empty.");
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
            helper.close();
        }
        return new ImportResult(imported, skipped);
    }

    private void ensureCategory(SQLiteDatabase db, String type, String name, long timestamp) {
        try (Cursor cursor = db.query(
                "categories",
                new String[]{"id", "deleted_at"},
                "type = ? AND name = ? COLLATE NOCASE",
                new String[]{type, name},
                null,
                null,
                null,
                "1")) {
            if (cursor.moveToFirst()) {
                if (!cursor.isNull(1)) {
                    ContentValues restored = new ContentValues();
                    restored.putNull("deleted_at");
                    restored.put("updated_at", Math.max(System.currentTimeMillis(), timestamp));
                    db.update("categories", restored, "id = ?", new String[]{String.valueOf(cursor.getLong(0))});
                }
                return;
            }
        }

        int sortOrder = 0;
        try (Cursor cursor = db.rawQuery(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM categories WHERE type = ?",
                new String[]{type})) {
            if (cursor.moveToFirst()) sortOrder = cursor.getInt(0);
        }
        ContentValues values = new ContentValues();
        values.put("type", type);
        values.put("name", name);
        values.put("sort_order", sortOrder);
        values.put("sync_id", stableId("category", type + "|" + name.toLowerCase(Locale.ROOT)));
        values.put("updated_at", Math.max(1L, timestamp));
        values.putNull("deleted_at");
        db.insertWithOnConflict("categories", null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }

    private boolean entryExists(
            SQLiteDatabase db,
            String type,
            String category,
            long amountCents,
            String currency,
            String name,
            long createdAt) {
        try (Cursor cursor = db.rawQuery(
                "SELECT 1 FROM entries WHERE type = ? AND category = ? AND amount_cents = ? AND currency_code = ? AND name = ? AND created_at = ? LIMIT 1",
                new String[]{type, category, String.valueOf(amountCents), currency, name, String.valueOf(createdAt)})) {
            return cursor.moveToFirst();
        }
    }

    private String normalizeType(String raw) {
        String value = raw == null ? "" : raw.trim();
        if ("income".equalsIgnoreCase(value) || EntryType.INCOME.equalsIgnoreCase(value)) return EntryType.INCOME;
        if ("expense".equalsIgnoreCase(value) || EntryType.EXPENSE.equalsIgnoreCase(value)) return EntryType.EXPENSE;
        throw new IllegalArgumentException("Unknown entry type: " + value);
    }

    private String stableId(String prefix, String source) {
        String value = UUID.nameUUIDFromBytes(source.getBytes(StandardCharsets.UTF_8)).toString().replace("-", "");
        return prefix + "_" + value;
    }

    private List<String> parseCsvLine(String line) {
        ArrayList<String> fields = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < line.length(); index += 1) {
            char character = line.charAt(index);
            if (character == '"') {
                if (quoted && index + 1 < line.length() && line.charAt(index + 1) == '"') {
                    current.append('"');
                    index += 1;
                } else {
                    quoted = !quoted;
                }
            } else if (character == ',' && !quoted) {
                fields.add(current.toString());
                current.setLength(0);
            } else {
                current.append(character);
            }
        }
        fields.add(current.toString());
        return fields;
    }

    private String stripBom(String value) {
        return value != null && !value.isEmpty() && value.charAt(0) == '\ufeff' ? value.substring(1) : value;
    }

    private String displayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String value = cursor.getString(0);
                if (value != null && !value.trim().isEmpty()) return value;
            }
        } catch (Exception ignored) {
        }
        return "the selected CSV";
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private static final class ImportResult {
        final int imported;
        final int skipped;

        ImportResult(int imported, int skipped) {
            this.imported = imported;
            this.skipped = skipped;
        }
    }
}
