package com.example.expensebuttontracker.data;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.example.expensebuttontracker.util.CurrencyUtils;
import com.example.expensebuttontracker.util.ExchangeRates;

public final class EntryFxStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "expense_button_tracker_fx_lock.db";
    private static final int DB_VERSION = 1;
    private static final String TABLE = "entry_fx";

    public EntryFxStore(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE " + TABLE + " (" +
                "entry_id INTEGER PRIMARY KEY," +
                "amount_cents INTEGER NOT NULL," +
                "currency_code TEXT NOT NULL," +
                "created_at INTEGER NOT NULL," +
                "huf_cents INTEGER NOT NULL," +
                "eur_cents INTEGER NOT NULL," +
                "try_cents INTEGER NOT NULL," +
                "rate_date TEXT NOT NULL" +
                ")");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS " + TABLE);
        onCreate(db);
    }

    public boolean hasCompleteLock(MoneyEntry entry) {
        return readRow(entry) != null;
    }

    public String getRateDate(MoneyEntry entry) {
        LockedRow row = readRow(entry);
        return row == null ? null : row.rateDate;
    }

    public int countMissing(Iterable<MoneyEntry> entries) {
        int count = 0;
        for (MoneyEntry entry : entries) {
            if (!hasCompleteLock(entry)) {
                count++;
            }
        }
        return count;
    }

    public Long getLockedValueCents(MoneyEntry entry, String targetCurrency) {
        String target = CurrencyUtils.normalize(targetCurrency);
        if (CurrencyUtils.normalize(entry.currencyCode).equals(target)) {
            return entry.amountCents;
        }

        LockedRow row = readRow(entry);
        if (row == null) {
            return null;
        }
        if (CurrencyUtils.HUF.equals(target)) {
            return row.hufCents;
        }
        if (CurrencyUtils.EUR.equals(target)) {
            return row.eurCents;
        }
        if (CurrencyUtils.TRY.equals(target)) {
            return row.tryCents;
        }
        return null;
    }

    public boolean store(MoneyEntry entry, ExchangeRates rates) {
        if (entry == null || rates == null) {
            return false;
        }
        Long huf = rates.convertCents(entry.amountCents, entry.currencyCode, CurrencyUtils.HUF);
        Long eur = rates.convertCents(entry.amountCents, entry.currencyCode, CurrencyUtils.EUR);
        Long lira = rates.convertCents(entry.amountCents, entry.currencyCode, CurrencyUtils.TRY);
        if (huf == null || eur == null || lira == null) {
            return false;
        }

        ContentValues values = new ContentValues();
        values.put("entry_id", entry.id);
        values.put("amount_cents", entry.amountCents);
        values.put("currency_code", CurrencyUtils.normalize(entry.currencyCode));
        values.put("created_at", entry.createdAtMillis);
        values.put("huf_cents", huf);
        values.put("eur_cents", eur);
        values.put("try_cents", lira);
        values.put("rate_date", rates.date == null ? "" : rates.date);
        long result = getWritableDatabase().insertWithOnConflict(
                TABLE,
                null,
                values,
                SQLiteDatabase.CONFLICT_REPLACE);
        return result != -1L;
    }

    public void invalidate(long entryId) {
        getWritableDatabase().delete(TABLE, "entry_id = ?", new String[]{String.valueOf(entryId)});
    }

    private LockedRow readRow(MoneyEntry entry) {
        SQLiteDatabase db = getReadableDatabase();
        try (Cursor cursor = db.query(
                TABLE,
                new String[]{"amount_cents", "currency_code", "created_at", "huf_cents", "eur_cents", "try_cents", "rate_date"},
                "entry_id = ?",
                new String[]{String.valueOf(entry.id)},
                null,
                null,
                null,
                "1")) {
            if (!cursor.moveToFirst()) {
                return null;
            }

            long storedAmount = cursor.getLong(0);
            String storedCurrency = CurrencyUtils.normalize(cursor.getString(1));
            long storedCreatedAt = cursor.getLong(2);
            if (storedAmount != entry.amountCents
                    || !storedCurrency.equals(CurrencyUtils.normalize(entry.currencyCode))
                    || storedCreatedAt != entry.createdAtMillis) {
                invalidate(entry.id);
                return null;
            }

            return new LockedRow(
                    cursor.getLong(3),
                    cursor.getLong(4),
                    cursor.getLong(5),
                    cursor.getString(6));
        }
    }

    private static final class LockedRow {
        final long hufCents;
        final long eurCents;
        final long tryCents;
        final String rateDate;

        LockedRow(long hufCents, long eurCents, long tryCents, String rateDate) {
            this.hufCents = hufCents;
            this.eurCents = eurCents;
            this.tryCents = tryCents;
            this.rateDate = rateDate == null ? "" : rateDate;
        }
    }
}
