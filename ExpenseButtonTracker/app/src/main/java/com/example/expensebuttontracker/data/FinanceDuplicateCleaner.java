package com.example.expensebuttontracker.data;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;

import com.example.expensebuttontracker.util.CurrencyUtils;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Removes exact semantic duplicates while keeping one canonical local row. */
public final class FinanceDuplicateCleaner {
    private FinanceDuplicateCleaner() {
    }

    public static int dedupeExact(Context context) {
        long now = System.currentTimeMillis();
        int removed = 0;
        Set<String> seen = new HashSet<>();

        try (ExpenseDbHelper helper = new ExpenseDbHelper(context)) {
            SQLiteDatabase db = helper.getWritableDatabase();
            db.beginTransaction();
            try (Cursor cursor = db.rawQuery(
                    "SELECT id, type, category, amount_cents, currency_code, name, created_at " +
                            "FROM entries " +
                            "WHERE deleted_at IS NULL OR deleted_at < 0 " +
                            "ORDER BY CASE WHEN deleted_at IS NULL THEN 0 ELSE 1 END, updated_at DESC, id ASC",
                    null)) {
                while (cursor.moveToNext()) {
                    long id = cursor.getLong(0);
                    String key = fingerprint(
                            cursor.getString(1),
                            cursor.getString(2),
                            cursor.getLong(3),
                            cursor.getString(4),
                            cursor.getString(5),
                            cursor.getLong(6));
                    if (seen.add(key)) {
                        continue;
                    }
                    ContentValues values = new ContentValues();
                    values.put("updated_at", now);
                    values.put("deleted_at", now);
                    removed += db.update("entries", values, "id = ?", new String[]{String.valueOf(id)});
                }
                db.setTransactionSuccessful();
            } finally {
                db.endTransaction();
            }
        }
        return removed;
    }

    private static String fingerprint(
            String type,
            String category,
            long amountCents,
            String currencyCode,
            String name,
            long createdAtMillis) {
        return normalize(type) + '\u0000'
                + normalize(category) + '\u0000'
                + amountCents + '\u0000'
                + CurrencyUtils.normalize(currencyCode) + '\u0000'
                + normalize(name) + '\u0000'
                + createdAtMillis;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }
}
