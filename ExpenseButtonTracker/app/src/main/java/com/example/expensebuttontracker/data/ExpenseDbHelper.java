package com.example.expensebuttontracker.data;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.MoneyUtils;
import com.example.expensebuttontracker.util.SettingsStore;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

public class ExpenseDbHelper extends SQLiteOpenHelper {
    private static final String DB_NAME = "expense_button_tracker.db";
    private static final int DB_VERSION = 4;
    private static final long CURRENCY_FEATURE_DEPLOYED_AT_MILLIS = 1780130610000L;

    private static final String TABLE_CATEGORIES = "categories";
    private static final String TABLE_ENTRIES = "entries";
    private static final String ACTIVE = "deleted_at IS NULL";

    private final Context appContext;

    public ExpenseDbHelper(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
        appContext = context.getApplicationContext();
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE " + TABLE_CATEGORIES + " (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "type TEXT NOT NULL CHECK(type IN ('EXPENSE','INCOME'))," +
                "name TEXT NOT NULL," +
                "sort_order INTEGER NOT NULL DEFAULT 0," +
                "sync_id TEXT NOT NULL UNIQUE," +
                "updated_at INTEGER NOT NULL," +
                "deleted_at INTEGER," +
                "UNIQUE(type, name)" +
                ")");

        db.execSQL("CREATE TABLE " + TABLE_ENTRIES + " (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "type TEXT NOT NULL CHECK(type IN ('EXPENSE','INCOME'))," +
                "category TEXT NOT NULL," +
                "amount_cents INTEGER NOT NULL CHECK(amount_cents > 0)," +
                "currency_code TEXT NOT NULL DEFAULT 'EUR' CHECK(currency_code IN ('HUF','EUR','TRY'))," +
                "name TEXT NOT NULL," +
                "created_at INTEGER NOT NULL," +
                "sync_id TEXT NOT NULL UNIQUE," +
                "updated_at INTEGER NOT NULL," +
                "deleted_at INTEGER" +
                ")");

        createIndexes(db);
        insertDefaultCategories(db);
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE " + TABLE_ENTRIES + " ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'EUR'");
        }
        if (oldVersion < 3) {
            ContentValues values = new ContentValues();
            values.put("currency_code", CurrencyUtils.EUR);
            db.update(
                    TABLE_ENTRIES,
                    values,
                    "currency_code = ? AND created_at < ?",
                    new String[]{CurrencyUtils.HUF, String.valueOf(CURRENCY_FEATURE_DEPLOYED_AT_MILLIS)});
        }
        if (oldVersion < 4) {
            db.execSQL("ALTER TABLE " + TABLE_CATEGORIES + " ADD COLUMN sync_id TEXT");
            db.execSQL("ALTER TABLE " + TABLE_CATEGORIES + " ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE " + TABLE_CATEGORIES + " ADD COLUMN deleted_at INTEGER");
            db.execSQL("ALTER TABLE " + TABLE_ENTRIES + " ADD COLUMN sync_id TEXT");
            db.execSQL("ALTER TABLE " + TABLE_ENTRIES + " ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0");
            db.execSQL("ALTER TABLE " + TABLE_ENTRIES + " ADD COLUMN deleted_at INTEGER");
            migrateSyncIds(db);
            createIndexes(db);
        }
    }

    private void createIndexes(SQLiteDatabase db) {
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_entries_created_at ON " + TABLE_ENTRIES + "(created_at DESC)");
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_entries_type_category ON " + TABLE_ENTRIES + "(type, category)");
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_sync_id ON " + TABLE_ENTRIES + "(sync_id)");
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_sync_id ON " + TABLE_CATEGORIES + "(sync_id)");
    }

    private void migrateSyncIds(SQLiteDatabase db) {
        long now = System.currentTimeMillis();
        try (Cursor cursor = db.query(TABLE_CATEGORIES, new String[]{"id"}, null, null, null, null, null)) {
            while (cursor.moveToNext()) {
                ContentValues values = new ContentValues();
                values.put("sync_id", newSyncId("category"));
                values.put("updated_at", now);
                db.update(TABLE_CATEGORIES, values, "id = ?", new String[]{String.valueOf(cursor.getLong(0))});
            }
        }
        try (Cursor cursor = db.query(TABLE_ENTRIES, new String[]{"id", "created_at"}, null, null, null, null, null)) {
            while (cursor.moveToNext()) {
                ContentValues values = new ContentValues();
                values.put("sync_id", newSyncId("money"));
                values.put("updated_at", Math.max(1L, cursor.getLong(1)));
                db.update(TABLE_ENTRIES, values, "id = ?", new String[]{String.valueOf(cursor.getLong(0))});
            }
        }
    }

    private void insertDefaultCategories(SQLiteDatabase db) {
        String[] expenses = new String[]{
                "Food", "Groceries", "Transport", "Fuel", "Coffee", "Bills", "Rent",
                "Shopping", "Entertainment", "Health", "Travel", "Other"
        };
        String[] income = new String[]{
                "Salary", "Freelance", "Gift", "Refund", "Interest", "Other"
        };
        for (int i = 0; i < expenses.length; i++) {
            insertCategoryDirect(db, EntryType.EXPENSE, expenses[i], i);
        }
        for (int i = 0; i < income.length; i++) {
            insertCategoryDirect(db, EntryType.INCOME, income[i], i);
        }
    }

    private void insertCategoryDirect(SQLiteDatabase db, String type, String name, int sortOrder) {
        long now = System.currentTimeMillis();
        ContentValues values = new ContentValues();
        values.put("type", type);
        values.put("name", name);
        values.put("sort_order", sortOrder);
        values.put("sync_id", newSyncId("category"));
        values.put("updated_at", now);
        values.putNull("deleted_at");
        db.insertWithOnConflict(TABLE_CATEGORIES, null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }

    public List<Category> getCategories(String type) {
        ArrayList<Category> result = new ArrayList<>();
        if (!EntryType.isValid(type)) {
            return result;
        }

        SQLiteDatabase db = getReadableDatabase();
        try (Cursor cursor = db.query(
                TABLE_CATEGORIES,
                new String[]{"id", "type", "name", "sort_order"},
                "type = ? AND " + ACTIVE,
                new String[]{type},
                null,
                null,
                "sort_order ASC, name COLLATE NOCASE ASC")) {
            while (cursor.moveToNext()) {
                result.add(new Category(
                        cursor.getLong(0),
                        cursor.getString(1),
                        cursor.getString(2),
                        cursor.getInt(3)));
            }
        }
        return result;
    }

    public boolean addCategory(String type, String rawName) {
        if (!EntryType.isValid(type) || rawName == null) {
            return false;
        }
        String name = rawName.trim();
        if (name.isEmpty()) {
            return false;
        }

        SQLiteDatabase db = getWritableDatabase();
        try (Cursor cursor = db.query(
                TABLE_CATEGORIES,
                new String[]{"id", "deleted_at"},
                "type = ? AND name = ? COLLATE NOCASE",
                new String[]{type, name},
                null,
                null,
                null,
                "1")) {
            if (cursor.moveToFirst()) {
                if (cursor.isNull(1)) {
                    return false;
                }
                ContentValues restore = new ContentValues();
                restore.put("name", name);
                restore.put("sort_order", getNextCategorySortOrder(db, type));
                restore.put("updated_at", System.currentTimeMillis());
                restore.putNull("deleted_at");
                db.update(TABLE_CATEGORIES, restore, "id = ?", new String[]{String.valueOf(cursor.getLong(0))});
                return true;
            }
        }

        long now = System.currentTimeMillis();
        ContentValues values = new ContentValues();
        values.put("type", type);
        values.put("name", name);
        values.put("sort_order", getNextCategorySortOrder(db, type));
        values.put("sync_id", newSyncId("category"));
        values.put("updated_at", now);
        values.putNull("deleted_at");
        long id = db.insertWithOnConflict(TABLE_CATEGORIES, null, values, SQLiteDatabase.CONFLICT_IGNORE);
        return id != -1L;
    }

    private int getNextCategorySortOrder(SQLiteDatabase db, String type) {
        try (Cursor cursor = db.rawQuery(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM " + TABLE_CATEGORIES + " WHERE type = ? AND " + ACTIVE,
                new String[]{type})) {
            if (cursor.moveToFirst()) {
                return cursor.getInt(0);
            }
        }
        return 0;
    }

    public void deleteCategory(long id) {
        softDelete(TABLE_CATEGORIES, id);
    }

    public long addEntry(String type, String category, long amountCents, String optionalName) {
        return addEntry(type, category, amountCents, CurrencyUtils.DEFAULT_CURRENCY, optionalName);
    }

    public long addEntry(String type, String category, long amountCents, String currencyCode, String optionalName) {
        if (!EntryType.isValid(type)) {
            throw new IllegalArgumentException("Invalid entry type.");
        }
        if (category == null || category.trim().isEmpty()) {
            throw new IllegalArgumentException("Choose a category.");
        }
        if (amountCents <= 0) {
            throw new IllegalArgumentException("Amount must be greater than zero.");
        }
        String cleanCurrency = CurrencyUtils.normalize(currencyCode);
        if (!CurrencyUtils.isSupported(cleanCurrency)) {
            throw new IllegalArgumentException("Choose a supported currency.");
        }

        SQLiteDatabase db = getWritableDatabase();
        String cleanCategory = category.trim();
        String cleanName = optionalName == null ? "" : optionalName.trim();
        if (cleanName.isEmpty()) {
            cleanName = cleanCategory + " #" + getNextEntryIndex(db, type, cleanCategory);
        }

        long now = System.currentTimeMillis();
        ContentValues values = new ContentValues();
        values.put("type", type);
        values.put("category", cleanCategory);
        values.put("amount_cents", amountCents);
        values.put("currency_code", cleanCurrency);
        values.put("name", cleanName);
        values.put("created_at", now);
        values.put("sync_id", newSyncId("money"));
        values.put("updated_at", now);
        values.putNull("deleted_at");
        return db.insertOrThrow(TABLE_ENTRIES, null, values);
    }

    private long getNextEntryIndex(SQLiteDatabase db, String type, String category) {
        try (Cursor cursor = db.rawQuery(
                "SELECT COUNT(*) + 1 FROM " + TABLE_ENTRIES + " WHERE type = ? AND category = ? AND " + ACTIVE,
                new String[]{type, category})) {
            if (cursor.moveToFirst()) {
                return cursor.getLong(0);
            }
        }
        return 1L;
    }

    public void deleteEntry(long id) {
        softDelete(TABLE_ENTRIES, id);
    }

    private void softDelete(String table, long id) {
        long now = System.currentTimeMillis();
        ContentValues values = new ContentValues();
        values.put("updated_at", now);
        values.put("deleted_at", now);
        getWritableDatabase().update(table, values, "id = ?", new String[]{String.valueOf(id)});
    }

    public List<MoneyEntry> getRecentEntries(int limit) {
        ArrayList<MoneyEntry> result = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        String safeLimit = String.valueOf(Math.max(1, Math.min(limit, 500)));
        try (Cursor cursor = db.query(
                TABLE_ENTRIES,
                new String[]{"id", "type", "category", "amount_cents", "currency_code", "name", "created_at"},
                ACTIVE,
                null,
                null,
                null,
                "created_at DESC",
                safeLimit)) {
            while (cursor.moveToNext()) {
                result.add(readEntry(cursor));
            }
        }
        return result;
    }

    public List<MoneyEntry> getAllEntries() {
        ArrayList<MoneyEntry> result = new ArrayList<>();
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor cursor = db.query(
                TABLE_ENTRIES,
                new String[]{"id", "type", "category", "amount_cents", "currency_code", "name", "created_at"},
                ACTIVE,
                null,
                null,
                null,
                "created_at DESC")) {
            while (cursor.moveToNext()) {
                result.add(readEntry(cursor));
            }
        }
        return result;
    }

    public List<CurrencyTotal> getTotalsByCurrency() {
        LinkedHashMap<String, long[]> totals = new LinkedHashMap<>();
        for (String currencyCode : CurrencyUtils.SUPPORTED_CURRENCIES) {
            totals.put(currencyCode, new long[]{0L, 0L});
        }

        SQLiteDatabase db = getReadableDatabase();
        try (Cursor cursor = db.rawQuery(
                "SELECT currency_code, type, COALESCE(SUM(amount_cents), 0) FROM " +
                        TABLE_ENTRIES + " WHERE " + ACTIVE + " GROUP BY currency_code, type",
                null)) {
            while (cursor.moveToNext()) {
                String currency = CurrencyUtils.normalize(cursor.getString(0));
                long[] values = totals.get(currency);
                if (values == null) {
                    values = new long[]{0L, 0L};
                    totals.put(currency, values);
                }
                String type = cursor.getString(1);
                long amount = cursor.getLong(2);
                if (EntryType.EXPENSE.equals(type)) {
                    values[0] = amount;
                } else if (EntryType.INCOME.equals(type)) {
                    values[1] = amount;
                }
            }
        }

        ArrayList<CurrencyTotal> result = new ArrayList<>();
        for (Map.Entry<String, long[]> entry : totals.entrySet()) {
            long expense = entry.getValue()[0];
            long income = entry.getValue()[1];
            if (expense != 0L || income != 0L) {
                result.add(new CurrencyTotal(entry.getKey(), expense, income));
            }
        }
        return result;
    }

    public Totals getTotals() {
        long expense = 0L;
        long income = 0L;
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor cursor = db.rawQuery(
                "SELECT type, COALESCE(SUM(amount_cents), 0) FROM " + TABLE_ENTRIES + " WHERE " + ACTIVE + " GROUP BY type",
                null)) {
            while (cursor.moveToNext()) {
                String type = cursor.getString(0);
                long amount = cursor.getLong(1);
                if (EntryType.EXPENSE.equals(type)) {
                    expense = amount;
                } else if (EntryType.INCOME.equals(type)) {
                    income = amount;
                }
            }
        }
        return new Totals(expense, income);
    }

    public String buildCsv() {
        StringBuilder builder = new StringBuilder();
        builder.append("id,created_at,type,category,amount,currency,name\n");
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor cursor = db.query(
                TABLE_ENTRIES,
                new String[]{"id", "type", "category", "amount_cents", "currency_code", "name", "created_at"},
                ACTIVE,
                null,
                null,
                null,
                "created_at ASC")) {
            while (cursor.moveToNext()) {
                MoneyEntry entry = readEntry(cursor);
                builder
                        .append(entry.id).append(',')
                        .append(csv(format.format(new Date(entry.createdAtMillis)))).append(',')
                        .append(csv(EntryType.displayName(entry.type))).append(',')
                        .append(csv(entry.category)).append(',')
                        .append(MoneyUtils.formatPlainDecimal(entry.amountCents)).append(',')
                        .append(csv(CurrencyUtils.displayCode(entry.currencyCode))).append(',')
                        .append(csv(entry.name))
                        .append('\n');
            }
        }
        return builder.toString();
    }

    public String buildFinanceSyncPayload() throws JSONException {
        JSONObject root = new JSONObject();
        root.put("requestId", newSyncId("android_sync"));
        root.put("deviceId", SettingsStore.getDeviceId(appContext));
        root.put("entries", readEntriesForSync());
        root.put("categories", readCategoriesForSync());
        return root.toString();
    }

    private JSONArray readEntriesForSync() throws JSONException {
        JSONArray entries = new JSONArray();
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor cursor = db.query(
                TABLE_ENTRIES,
                new String[]{"sync_id", "type", "category", "amount_cents", "currency_code", "name", "created_at", "updated_at", "deleted_at"},
                null,
                null,
                null,
                null,
                "created_at ASC")) {
            while (cursor.moveToNext()) {
                JSONObject entry = new JSONObject();
                entry.put("id", cursor.getString(0));
                entry.put("type", cursor.getString(1));
                entry.put("category", cursor.getString(2));
                entry.put("amountCents", cursor.getLong(3));
                entry.put("currencyCode", CurrencyUtils.normalize(cursor.getString(4)));
                entry.put("name", cursor.getString(5));
                entry.put("createdAtMillis", cursor.getLong(6));
                entry.put("updatedAtMillis", cursor.getLong(7));
                if (!cursor.isNull(8)) {
                    entry.put("deletedAtMillis", cursor.getLong(8));
                }
                entry.put("actor", "android");
                entries.put(entry);
            }
        }
        return entries;
    }

    private JSONArray readCategoriesForSync() throws JSONException {
        JSONArray categories = new JSONArray();
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor cursor = db.query(
                TABLE_CATEGORIES,
                new String[]{"sync_id", "type", "name", "sort_order", "updated_at", "deleted_at"},
                null,
                null,
                null,
                null,
                "type ASC, sort_order ASC")) {
            while (cursor.moveToNext()) {
                JSONObject category = new JSONObject();
                category.put("id", cursor.getString(0));
                category.put("type", cursor.getString(1));
                category.put("name", cursor.getString(2));
                category.put("sortOrder", cursor.getInt(3));
                category.put("updatedAtMillis", cursor.getLong(4));
                if (!cursor.isNull(5)) {
                    category.put("deletedAtMillis", cursor.getLong(5));
                }
                categories.put(category);
            }
        }
        return categories;
    }

    public void applyFinanceLedger(String ledgerJson) throws JSONException {
        JSONObject ledger = new JSONObject(ledgerJson);
        JSONArray categories = ledger.optJSONArray("categories");
        JSONArray entries = ledger.optJSONArray("entries");
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            if (categories != null) {
                for (int i = 0; i < categories.length(); i++) {
                    applyRemoteCategory(db, categories.getJSONObject(i));
                }
            }
            if (entries != null) {
                for (int i = 0; i < entries.length(); i++) {
                    applyRemoteEntry(db, entries.getJSONObject(i));
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    private void applyRemoteCategory(SQLiteDatabase db, JSONObject remote) throws JSONException {
        String syncId = remote.getString("id");
        long remoteUpdated = remote.getLong("updatedAtMillis");
        Long localId = null;
        long localUpdated = -1L;
        try (Cursor cursor = db.query(TABLE_CATEGORIES, new String[]{"id", "updated_at"}, "sync_id = ?", new String[]{syncId}, null, null, null, "1")) {
            if (cursor.moveToFirst()) {
                localId = cursor.getLong(0);
                localUpdated = cursor.getLong(1);
            }
        }
        if (localUpdated > remoteUpdated) {
            return;
        }
        boolean deleted = remote.has("deletedAtMillis") && !remote.isNull("deletedAtMillis");
        if (localId == null && deleted) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("type", remote.getString("type"));
        values.put("name", remote.getString("name"));
        values.put("sort_order", remote.optInt("sortOrder", 0));
        values.put("sync_id", syncId);
        values.put("updated_at", remoteUpdated);
        if (deleted) values.put("deleted_at", remote.getLong("deletedAtMillis"));
        else values.putNull("deleted_at");
        if (localId == null) {
            db.insertWithOnConflict(TABLE_CATEGORIES, null, values, SQLiteDatabase.CONFLICT_IGNORE);
        } else {
            db.update(TABLE_CATEGORIES, values, "id = ?", new String[]{String.valueOf(localId)});
        }
    }

    private void applyRemoteEntry(SQLiteDatabase db, JSONObject remote) throws JSONException {
        String syncId = remote.getString("id");
        long remoteUpdated = remote.getLong("updatedAtMillis");
        Long localId = null;
        long localUpdated = -1L;
        try (Cursor cursor = db.query(TABLE_ENTRIES, new String[]{"id", "updated_at"}, "sync_id = ?", new String[]{syncId}, null, null, null, "1")) {
            if (cursor.moveToFirst()) {
                localId = cursor.getLong(0);
                localUpdated = cursor.getLong(1);
            }
        }
        if (localUpdated > remoteUpdated) {
            return;
        }
        boolean deleted = remote.has("deletedAtMillis") && !remote.isNull("deletedAtMillis");
        if (localId == null && deleted) {
            return;
        }
        ContentValues values = new ContentValues();
        values.put("type", remote.getString("type"));
        values.put("category", remote.getString("category"));
        values.put("amount_cents", remote.getLong("amountCents"));
        values.put("currency_code", CurrencyUtils.normalize(remote.getString("currencyCode")));
        values.put("name", remote.optString("name", remote.getString("category")));
        values.put("created_at", remote.getLong("createdAtMillis"));
        values.put("sync_id", syncId);
        values.put("updated_at", remoteUpdated);
        if (deleted) values.put("deleted_at", remote.getLong("deletedAtMillis"));
        else values.putNull("deleted_at");
        if (localId == null) {
            db.insertOrThrow(TABLE_ENTRIES, null, values);
        } else {
            db.update(TABLE_ENTRIES, values, "id = ?", new String[]{String.valueOf(localId)});
        }
    }

    private MoneyEntry readEntry(Cursor cursor) {
        return new MoneyEntry(
                cursor.getLong(0),
                cursor.getString(1),
                cursor.getString(2),
                cursor.getLong(3),
                CurrencyUtils.normalize(cursor.getString(4)),
                cursor.getString(5),
                cursor.getLong(6));
    }

    private String newSyncId(String prefix) {
        return (prefix + "_" + UUID.randomUUID().toString().replace("-", "")).toLowerCase(Locale.ROOT);
    }

    private String csv(String value) {
        if (value == null) {
            return "";
        }
        boolean needsQuotes = value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r");
        String escaped = value.replace("\"", "\"\"");
        return needsQuotes ? "\"" + escaped + "\"" : escaped;
    }
}
