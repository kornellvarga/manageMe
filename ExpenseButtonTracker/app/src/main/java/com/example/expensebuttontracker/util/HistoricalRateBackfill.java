package com.example.expensebuttontracker.util;

import android.content.Context;

import com.example.expensebuttontracker.data.EntryFxStore;
import com.example.expensebuttontracker.data.ExpenseDbHelper;
import com.example.expensebuttontracker.data.MoneyEntry;

import java.util.ArrayList;
import java.util.List;

public final class HistoricalRateBackfill {
    private static final long LOOKBACK_MILLIS = 7L * 24L * 60L * 60L * 1000L;

    private HistoricalRateBackfill() {
    }

    public interface Callback {
        void onComplete(int lockedCount, int remainingCount);

        void onError(String message);
    }

    public static void run(
            Context context,
            ExpenseDbHelper db,
            EntryFxStore fxStore,
            Callback callback) {
        List<MoneyEntry> allEntries = db.getAllEntries();
        ArrayList<MoneyEntry> missing = new ArrayList<>();
        long earliest = Long.MAX_VALUE;
        long latest = Long.MIN_VALUE;

        for (MoneyEntry entry : allEntries) {
            if (fxStore.hasCompleteLock(entry)) {
                continue;
            }
            missing.add(entry);
            earliest = Math.min(earliest, entry.createdAtMillis);
            latest = Math.max(latest, entry.createdAtMillis);
        }

        if (missing.isEmpty()) {
            callback.onComplete(0, 0);
            return;
        }

        long fromMillis = Math.max(0L, earliest - LOOKBACK_MILLIS);
        ExchangeRateStore.fetchHistoricalRange(context, fromMillis, latest, new ExchangeRateStore.HistoricalCallback() {
            @Override
            public void onSuccess(List<ExchangeRates> series) {
                int locked = 0;
                for (MoneyEntry entry : missing) {
                    ExchangeRates rate = bestRateForEntry(series, entry.createdAtMillis);
                    if (rate != null && fxStore.store(entry, rate)) {
                        locked++;
                    }
                }
                callback.onComplete(locked, fxStore.countMissing(db.getAllEntries()));
            }

            @Override
            public void onError(String message) {
                callback.onError(message);
            }
        });
    }

    private static ExchangeRates bestRateForEntry(List<ExchangeRates> series, long createdAtMillis) {
        String targetDate = ExchangeRateStore.formatDate(createdAtMillis);
        ExchangeRates best = null;
        for (ExchangeRates candidate : series) {
            if (candidate.date == null || candidate.date.isEmpty()) {
                continue;
            }
            if (candidate.date.compareTo(targetDate) <= 0
                    && (best == null || candidate.date.compareTo(best.date) > 0)) {
                best = candidate;
            }
        }
        return best;
    }
}
