package com.example.expensebuttontracker.data;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.example.expensebuttontracker.util.CurrencyUtils;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Archive support without changing the existing SQLite schema.
 *
 * Positive deleted_at values remain deletion tombstones. A negative deleted_at
 * value represents a reversible archive timestamp. Existing dashboard and
 * statistics queries already exclude any non-null deleted_at value, so archived
 * entries immediately stop affecting current totals while retaining all data.
 */
public final class FinanceArchiveStore {
    private static final String TABLE_ENTRIES = "entries";

    private FinanceArchiveStore() {
    }

    public static boolean archiveEntry(Context context, long localId) {
        long now = System.currentTimeMillis();
        ContentValues values = new ContentValues();
        values.put("updated_at", now);
        values.put("deleted_at", archiveMarker(now));
        try (ExpenseDbHelper helper = new ExpenseDbHelper(context)) {
            return helper.getWritableDatabase().update(
                    TABLE_ENTRIES,
                    values,
                    "id = ? AND deleted_at IS NULL",
                    new String[]{String.valueOf(localId)}) > 0;
        }
    }

    public static boolean restoreEntry(Context context, long localId) {
        long now = System.currentTimeMillis();
        ContentValues values = new ContentValues();
        values.put("updated_at", now);
        values.putNull("deleted_at");
        try (ExpenseDbHelper helper = new ExpenseDbHelper(context)) {
            return helper.getWritableDatabase().update(
                    TABLE_ENTRIES,
                    values,
                    "id = ? AND deleted_at < 0",
                    new String[]{String.valueOf(localId)}) > 0;
        }
    }

    public static int archiveBefore(Context context, long cutoffMillis) {
        long now = System.currentTimeMillis();
        ContentValues values = new ContentValues();
        values.put("updated_at", now);
        values.put("deleted_at", archiveMarker(now));
        try (ExpenseDbHelper helper = new ExpenseDbHelper(context)) {
            return helper.getWritableDatabase().update(
                    TABLE_ENTRIES,
                    values,
                    "deleted_at IS NULL AND created_at < ?",
                    new String[]{String.valueOf(cutoffMillis)});
        }
    }

    public static int countActiveBefore(Context context, long cutoffMillis) {
        try (ExpenseDbHelper helper = new ExpenseDbHelper(context);
             Cursor cursor = helper.getReadableDatabase().rawQuery(
                     "SELECT COUNT(*) FROM entries WHERE deleted_at IS NULL AND created_at < ?",
                     new String[]{String.valueOf(cutoffMillis)})) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    public static int getArchivedCount(Context context) {
        try (ExpenseDbHelper helper = new ExpenseDbHelper(context);
             Cursor cursor = helper.getReadableDatabase().rawQuery(
                     "SELECT COUNT(*) FROM entries WHERE deleted_at < 0",
                     null)) {
            return cursor.moveToFirst() ? cursor.getInt(0) : 0;
        }
    }

    public static List<MoneyEntry> getArchivedEntries(Context context, int limit) {
        ArrayList<MoneyEntry> result = new ArrayList<>();
        String safeLimit = String.valueOf(Math.max(1, Math.min(limit, 1000)));
        try (ExpenseDbHelper helper = new ExpenseDbHelper(context);
             Cursor cursor = helper.getReadableDatabase().query(
                     TABLE_ENTRIES,
                     new String[]{"id", "type", "category", "amount_cents", "currency_code", "name", "created_at"},
                     "deleted_at < 0",
                     null,
                     null,
                     null,
                     "created_at DESC",
                     safeLimit)) {
            while (cursor.moveToNext()) {
                result.add(new MoneyEntry(
                        cursor.getLong(0),
                        cursor.getString(1),
                        cursor.getString(2),
                        cursor.getLong(3),
                        CurrencyUtils.normalize(cursor.getString(4)),
                        cursor.getString(5),
                        cursor.getLong(6)));
            }
        }
        return result;
    }

    public static String decorateSyncPayload(String payloadJson) throws JSONException {
        JSONObject root = new JSONObject(payloadJson);
        JSONArray entries = root.optJSONArray("entries");
        if (entries == null) return root.toString();
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i);
            if (!entry.has("deletedAtMillis") || entry.isNull("deletedAtMillis")) continue;
            long marker = entry.optLong("deletedAtMillis", 0L);
            if (marker < 0L) {
                entry.remove("deletedAtMillis");
                entry.put("archivedAtMillis", archiveTimestamp(marker));
            }
        }
        return root.toString();
    }

    public static void applyRemoteLedger(Context context, String ledgerJson) throws JSONException {
        JSONObject ledger = new JSONObject(ledgerJson);
        JSONArray entries = ledger.optJSONArray("entries");
        if (entries == null) return;
        try (ExpenseDbHelper helper = new ExpenseDbHelper(context)) {
            SQLiteDatabase db = helper.getWritableDatabase();
            db.beginTransaction();
            try {
                for (int i = 0; i < entries.length(); i++) {
                    JSONObject entry = entries.getJSONObject(i);
                    if (entry.has("deletedAtMillis") && !entry.isNull("deletedAtMillis")) {
                        continue;
                    }
                    if (!entry.has("archivedAtMillis") || entry.isNull("archivedAtMillis")) {
                        continue;
                    }
                    long archivedAt = entry.getLong("archivedAtMillis");
                    long updatedAt = entry.optLong("updatedAtMillis", archivedAt);
                    ContentValues values = new ContentValues();
                    values.put("deleted_at", archiveMarker(archivedAt));
                    values.put("updated_at", updatedAt);
                    db.update(
                            TABLE_ENTRIES,
                            values,
                            "sync_id = ?",
                            new String[]{entry.getString("id")});
                }
                db.setTransactionSuccessful();
            } finally {
                db.endTransaction();
            }
        }
    }

    private static long archiveMarker(long timestampMillis) {
        long safe = Math.max(1L, timestampMillis);
        return -safe;
    }

    private static long archiveTimestamp(long marker) {
        return marker == Long.MIN_VALUE ? Long.MAX_VALUE : Math.abs(marker);
    }
}
