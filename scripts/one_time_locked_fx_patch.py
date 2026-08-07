from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")

def write(rel, text):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)

def replace_regex_once(text, pattern, replacement, label):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {count}")
    return updated

entry_fx_store = r'''package com.example.expensebuttontracker.data;

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
'''

historical_backfill = r'''package com.example.expensebuttontracker.util;

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
'''

write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/data/EntryFxStore.java", entry_fx_store)
write("ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/util/HistoricalRateBackfill.java", historical_backfill)

# ExchangeRateStore.java
path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/util/ExchangeRateStore.java"
text = read(path)
text = replace_once(
    text,
    "import java.nio.charset.StandardCharsets;\n",
    "import java.nio.charset.StandardCharsets;\n"
    "import java.text.SimpleDateFormat;\n"
    "import java.util.ArrayList;\n"
    "import java.util.Date;\n"
    "import java.util.LinkedHashMap;\n"
    "import java.util.List;\n"
    "import java.util.Locale;\n"
    "import java.util.Map;\n",
    "ExchangeRateStore imports")
text = replace_once(
    text,
    "    public interface Callback {\n"
    "        void onSuccess(ExchangeRates rates);\n\n"
    "        void onError(String message);\n"
    "    }\n",
    "    public interface Callback {\n"
    "        void onSuccess(ExchangeRates rates);\n\n"
    "        void onError(String message);\n"
    "    }\n\n"
    "    public interface HistoricalCallback {\n"
    "        void onSuccess(List<ExchangeRates> rates);\n\n"
    "        void onError(String message);\n"
    "    }\n",
    "ExchangeRateStore callback")
marker = "    private static ExchangeRates requestLatestRates() throws Exception {\n"
historical_methods = r'''    public static void fetchHistoricalRange(
            Context context,
            long fromMillis,
            long toMillis,
            HistoricalCallback callback) {
        Handler mainHandler = new Handler(Looper.getMainLooper());
        Thread worker = new Thread(() -> {
            try {
                List<ExchangeRates> rates = requestHistoricalRange(fromMillis, toMillis);
                mainHandler.post(() -> callback.onSuccess(rates));
            } catch (Exception ex) {
                String message = ex.getMessage() == null
                        ? "Could not load historical exchange rates."
                        : ex.getMessage();
                mainHandler.post(() -> callback.onError(message));
            }
        }, "historical-exchange-rate-fetch");
        worker.start();
    }

    public static String formatDate(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        return format.format(new Date(millis));
    }

    private static List<ExchangeRates> requestHistoricalRange(long fromMillis, long toMillis) throws Exception {
        String from = formatDate(Math.min(fromMillis, toMillis));
        String to = formatDate(Math.max(fromMillis, toMillis));
        String ratesUrl = "https://api.frankfurter.dev/v2/rates?from=" + from
                + "&to=" + to
                + "&base=EUR&quotes=HUF,TRY";

        HttpURLConnection connection = (HttpURLConnection) new URL(ratesUrl).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "ExpenseButtonTracker/1.0");
        int statusCode = connection.getResponseCode();
        if (statusCode < 200 || statusCode >= 300) {
            throw new IOException("Historical rate service returned HTTP " + statusCode + ".");
        }
        try (InputStream stream = connection.getInputStream()) {
            return parseHistorical(readAll(stream), System.currentTimeMillis());
        } finally {
            connection.disconnect();
        }
    }

    private static List<ExchangeRates> parseHistorical(String body, long fetchedAtMillis) throws Exception {
        JSONArray values = new JSONArray(body);
        LinkedHashMap<String, BigDecimal[]> byDate = new LinkedHashMap<>();

        for (int i = 0; i < values.length(); i++) {
            JSONObject item = values.getJSONObject(i);
            String date = item.optString("date", "");
            String quote = item.optString("quote", "");
            if (date.isEmpty()) {
                continue;
            }
            BigDecimal[] pair = byDate.get(date);
            if (pair == null) {
                pair = new BigDecimal[2];
                byDate.put(date, pair);
            }
            if (CurrencyUtils.HUF.equals(quote)) {
                pair[0] = decimal(item.get("rate"));
            } else if (CurrencyUtils.TRY.equals(quote)) {
                pair[1] = decimal(item.get("rate"));
            }
        }

        ArrayList<ExchangeRates> result = new ArrayList<>();
        for (Map.Entry<String, BigDecimal[]> item : byDate.entrySet()) {
            BigDecimal[] pair = item.getValue();
            if (pair[0] != null && pair[1] != null) {
                result.add(new ExchangeRates(pair[0], pair[1], item.getKey(), fetchedAtMillis));
            }
        }
        if (result.isEmpty()) {
            throw new IOException("Historical rate response did not include HUF and TL.");
        }
        return result;
    }

'''
text = replace_once(text, marker, historical_methods + marker, "ExchangeRateStore historical methods")
write(path, text)

# MainActivity.java
path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/MainActivity.java"
text = read(path)
text = replace_once(
    text,
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\n",
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\n"
    "import com.example.expensebuttontracker.data.EntryFxStore;\n",
    "MainActivity EntryFxStore import")
text = replace_once(
    text,
    "import com.example.expensebuttontracker.util.ExchangeRates;\n",
    "import com.example.expensebuttontracker.util.ExchangeRates;\n"
    "import com.example.expensebuttontracker.util.HistoricalRateBackfill;\n",
    "MainActivity HistoricalRateBackfill import")
text = replace_once(
    text,
    "    private ExpenseDbHelper db;\n",
    "    private ExpenseDbHelper db;\n"
    "    private EntryFxStore fxStore;\n",
    "MainActivity field")
text = replace_once(
    text,
    "    private String rateErrorMessage;\n",
    "    private String rateErrorMessage;\n"
    "    private boolean historicalRatesLoading;\n"
    "    private int historicalRatesPending;\n"
    "    private String historicalRateErrorMessage;\n",
    "MainActivity historical fields")
text = replace_once(
    text,
    "        db = new ExpenseDbHelper(this);\n",
    "        db = new ExpenseDbHelper(this);\n"
    "        fxStore = new EntryFxStore(this);\n",
    "MainActivity init fxStore")
text = replace_once(
    text,
    "        refreshDashboard();\n"
    "        syncNow(false);\n",
    "        refreshDashboard();\n"
    "        syncNow(false);\n"
    "        backfillHistoricalRates(false);\n",
    "MainActivity onResume")
text = replace_once(
    text,
    "        List<CurrencyTotal> totalsByCurrency = db.getTotalsByCurrency();\n"
    "        Totals totals = convertTotals(totalsByCurrency);\n",
    "        List<MoneyEntry> allEntries = db.getAllEntries();\n"
    "        lockTodaysEntriesWithCurrentRate(allEntries);\n"
    "        historicalRatesPending = fxStore.countMissing(allEntries);\n"
    "        Totals totals = convertTotals(allEntries);\n",
    "MainActivity dashboard totals")
old_convert = r'''    private Totals convertTotals(List<CurrencyTotal> totalsByCurrency) {
        missingRateForDashboard = false;
        long expense = 0L;
        long income = 0L;
        for (CurrencyTotal total : totalsByCurrency) {
            Long convertedExpense = convertCents(total.expenseCents, total.currencyCode, displayCurrency);
            Long convertedIncome = convertCents(total.incomeCents, total.currencyCode, displayCurrency);
            if (convertedExpense != null) {
                expense += convertedExpense;
            }
            if (convertedIncome != null) {
                income += convertedIncome;
            }
            if (convertedExpense == null || convertedIncome == null) {
                missingRateForDashboard = true;
            }
        }
        return new Totals(expense, income);
    }

'''
new_convert = r'''    private void lockTodaysEntriesWithCurrentRate(List<MoneyEntry> entries) {
        if (exchangeRates == null || exchangeRates.isStale(System.currentTimeMillis())) {
            return;
        }
        String today = ExchangeRateStore.formatDate(System.currentTimeMillis());
        for (MoneyEntry entry : entries) {
            if (!today.equals(ExchangeRateStore.formatDate(entry.createdAtMillis))) {
                continue;
            }
            if (!fxStore.hasCompleteLock(entry)) {
                fxStore.store(entry, exchangeRates);
            }
        }
    }

    private Totals convertTotals(List<MoneyEntry> entries) {
        missingRateForDashboard = false;
        long expense = 0L;
        long income = 0L;
        for (MoneyEntry entry : entries) {
            Long converted = fxStore.getLockedValueCents(entry, displayCurrency);
            if (converted == null) {
                missingRateForDashboard = true;
                continue;
            }
            if (EntryType.INCOME.equals(entry.type)) {
                income += converted;
            } else {
                expense += converted;
            }
        }
        return new Totals(expense, income);
    }

    private void backfillHistoricalRates(boolean userRequested) {
        if (historicalRatesLoading) {
            return;
        }

        historicalRatesPending = fxStore.countMissing(db.getAllEntries());
        if (historicalRatesPending == 0) {
            historicalRateErrorMessage = null;
            refreshRateStatus();
            return;
        }

        historicalRatesLoading = true;
        historicalRateErrorMessage = null;
        refreshRateStatus();
        HistoricalRateBackfill.run(this, db, fxStore, new HistoricalRateBackfill.Callback() {
            @Override
            public void onComplete(int lockedCount, int remainingCount) {
                historicalRatesLoading = false;
                historicalRatesPending = remainingCount;
                historicalRateErrorMessage = null;
                refreshDashboard();
                if (userRequested) {
                    toast(remainingCount == 0
                            ? "Transaction-date values locked."
                            : remainingCount + " entries still need historical rates.");
                }
            }

            @Override
            public void onError(String message) {
                historicalRatesLoading = false;
                historicalRateErrorMessage = message;
                historicalRatesPending = fxStore.countMissing(db.getAllEntries());
                refreshRateStatus();
                if (userRequested) {
                    toast(message);
                }
            }
        });
    }

'''
text = replace_once(text, old_convert, new_convert, "MainActivity convertTotals")
text = replace_once(
    text,
    "        Long convertedAmount = convertCents(entry.amountCents, entry.currencyCode, displayCurrency);\n",
    "        Long convertedAmount = fxStore.getLockedValueCents(entry, displayCurrency);\n",
    "MainActivity recent conversion")
text = replace_once(
    text,
    "                exchangeRates = rates;\n"
    "                refreshDashboard();\n"
    "                if (userRequested) {\n",
    "                exchangeRates = rates;\n"
    "                refreshDashboard();\n"
    "                backfillHistoricalRates(false);\n"
    "                if (userRequested) {\n",
    "MainActivity refresh rates success")
text = replace_once(
    text,
    "        FinanceSyncClient.syncAsync(this, (synced, message) -> {\n"
    "            refreshDashboard();\n"
    "            if (userRequested) toast(message);\n"
    "        });\n",
    "        FinanceSyncClient.syncAsync(this, (synced, message) -> {\n"
    "            refreshDashboard();\n"
    "            backfillHistoricalRates(false);\n"
    "            if (userRequested) toast(message);\n"
    "        });\n",
    "MainActivity sync callback")
new_rate_status = r'''    private void refreshRateStatus() {
        if (rateStatusText == null) {
            return;
        }

        String live;
        if (ratesLoading) {
            live = "Live rates: updating from Frankfurter...";
        } else if (rateErrorMessage != null) {
            live = "Live rates: update failed - " + rateErrorMessage;
        } else if (exchangeRates == null) {
            live = "Live rates: not loaded yet.";
        } else {
            String date = exchangeRates.date.isEmpty() ? "" : " | " + exchangeRates.date;
            live = "Live rates: " + exchangeRates.describe() + date;
        }

        String locked;
        if (historicalRatesLoading) {
            locked = " | locking transaction-date values...";
        } else if (historicalRatesPending > 0) {
            locked = " | " + historicalRatesPending + " historical value"
                    + (historicalRatesPending == 1 ? "" : "s") + " pending";
        } else if (historicalRateErrorMessage != null) {
            locked = " | historical FX will retry when online";
        } else {
            locked = " | transaction values locked";
        }
        rateStatusText.setText(live + locked);
    }

    private void refreshSyncStatus'''
text = replace_regex_once(
    text,
    r'    private void refreshRateStatus\(\) \{.*?\n    \}\n\n    private void refreshSyncStatus',
    new_rate_status,
    "MainActivity rate status")
on_destroy = r'''    @Override
    protected void onDestroy() {
        if (fxStore != null) {
            fxStore.close();
        }
        if (db != null) {
            db.close();
        }
        super.onDestroy();
    }

'''
text = replace_once(
    text,
    "    private TextView addStatTile(LinearLayout row, String title, int amountColor, boolean left) {\n",
    on_destroy + "    private TextView addStatTile(LinearLayout row, String title, int amountColor, boolean left) {\n",
    "MainActivity onDestroy")
write(path, text)

# StatisticsActivity.java
path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/StatisticsActivity.java"
text = read(path)
text = replace_once(
    text,
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\n",
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\n"
    "import com.example.expensebuttontracker.data.EntryFxStore;\n",
    "Statistics EntryFxStore import")
text = replace_once(
    text,
    "import com.example.expensebuttontracker.util.ExchangeRates;\n",
    "import com.example.expensebuttontracker.util.ExchangeRates;\n"
    "import com.example.expensebuttontracker.util.HistoricalRateBackfill;\n",
    "Statistics HistoricalRateBackfill import")
text = replace_once(
    text,
    "    private ExpenseDbHelper db;\n",
    "    private ExpenseDbHelper db;\n"
    "    private EntryFxStore fxStore;\n",
    "Statistics field")
text = replace_once(
    text,
    "    private String rateErrorMessage;\n",
    "    private String rateErrorMessage;\n"
    "    private boolean historicalRatesLoading;\n"
    "    private String historicalRateErrorMessage;\n",
    "Statistics historical fields")
text = replace_once(
    text,
    "        db = new ExpenseDbHelper(this);\n",
    "        db = new ExpenseDbHelper(this);\n"
    "        fxStore = new EntryFxStore(this);\n",
    "Statistics init")
text = replace_once(
    text,
    "        buildShell();\n"
    "        refreshStats();\n"
    "        if (exchangeRates == null || exchangeRates.isStale(System.currentTimeMillis())) {\n",
    "        buildShell();\n"
    "        refreshStats();\n"
    "        backfillHistoricalRates();\n"
    "        if (exchangeRates == null || exchangeRates.isStale(System.currentTimeMillis())) {\n",
    "Statistics onCreate backfill")
text = replace_once(
    text,
    "        super.onResume();\n"
    "        refreshStats();\n",
    "        super.onResume();\n"
    "        refreshStats();\n"
    "        backfillHistoricalRates();\n",
    "Statistics onResume")
text = replace_once(
    text,
    "            Long converted = convertCents(entry.amountCents, entry.currencyCode, displayCurrency);\n",
    "            Long converted = fxStore.getLockedValueCents(entry, displayCurrency);\n",
    "Statistics conversion")
text = replace_once(
    text,
    '        card.addView(secondaryButton("Refresh rates", v -> refreshRates(true)));\n',
    '        card.addView(secondaryButton("Refresh rates", v -> {\n'
    '            refreshRates(true);\n'
    '            backfillHistoricalRates();\n'
    '        }));\n',
    "Statistics refresh button")
new_stats_status = r'''    private String rateStatusText() {
        String live;
        if (ratesLoading) {
            live = "Live rates: updating from Frankfurter...";
        } else if (rateErrorMessage != null) {
            live = "Live rates: update failed - " + rateErrorMessage;
        } else if (exchangeRates == null) {
            live = "Live rates: not loaded yet.";
        } else {
            String date = exchangeRates.date.isEmpty() ? "" : " | " + exchangeRates.date;
            live = "Live rates: " + exchangeRates.describe() + date;
        }

        if (historicalRatesLoading) {
            return live + " | locking transaction-date values...";
        }
        if (missingRates) {
            return live + (historicalRateErrorMessage == null
                    ? " | historical FX pending"
                    : " | historical FX will retry when online");
        }
        return live + " | statistics use locked transaction-date values";
    }

    private void backfillHistoricalRates() {
        if (historicalRatesLoading) {
            return;
        }
        if (fxStore.countMissing(db.getAllEntries()) == 0) {
            historicalRateErrorMessage = null;
            return;
        }

        historicalRatesLoading = true;
        HistoricalRateBackfill.run(this, db, fxStore, new HistoricalRateBackfill.Callback() {
            @Override
            public void onComplete(int lockedCount, int remainingCount) {
                historicalRatesLoading = false;
                historicalRateErrorMessage = null;
                refreshStats();
            }

            @Override
            public void onError(String message) {
                historicalRatesLoading = false;
                historicalRateErrorMessage = message;
                refreshStats();
            }
        });
    }

    private Long convertCents'''
text = replace_regex_once(
    text,
    r'    private String rateStatusText\(\) \{.*?\n    \}\n\n    private Long convertCents',
    new_stats_status,
    "Statistics rate status")
stats_destroy = r'''    @Override
    protected void onDestroy() {
        if (fxStore != null) {
            fxStore.close();
        }
        if (db != null) {
            db.close();
        }
        super.onDestroy();
    }

'''
text = replace_once(
    text,
    "    private int colorForIndex(int index) {\n",
    stats_destroy + "    private int colorForIndex(int index) {\n",
    "Statistics onDestroy")
write(path, text)

# EditEntryActivity.java
path = "ExpenseButtonTracker/app/src/main/java/com/example/expensebuttontracker/ui/EditEntryActivity.java"
text = read(path)
text = replace_once(
    text,
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\n",
    "import com.example.expensebuttontracker.data.ExpenseDbHelper;\n"
    "import com.example.expensebuttontracker.data.EntryFxStore;\n",
    "EditEntry EntryFxStore import")
text = replace_once(
    text,
    "        db.addCategory(selectedType, category);\n"
    "        FinanceSyncClient.syncAsync(this);\n",
    "        EntryFxStore fxStore = new EntryFxStore(this);\n"
    "        fxStore.invalidate(entryId);\n"
    "        fxStore.close();\n"
    "        db.addCategory(selectedType, category);\n"
    "        FinanceSyncClient.syncAsync(this);\n",
    "EditEntry invalidate")
write(path, text)

# Bump app version so the published APK is offered by the in-app updater.
path = "ExpenseButtonTracker/app/build.gradle"
text = read(path)
text = replace_once(text, "        versionCode 7\n", "        versionCode 8\n", "versionCode bump")
text = replace_once(text, "        versionName '2.3.2'\n", "        versionName '2.4.0'\n", "versionName bump")
write(path, text)

# Remove the one-time patch machinery from the final feature commit.
for rel in [
    "scripts/one_time_locked_fx_patch.py",
    ".github/workflows/one-time-locked-fx-patch.yml",
]:
    target = ROOT / rel
    if target.exists():
        target.unlink()
