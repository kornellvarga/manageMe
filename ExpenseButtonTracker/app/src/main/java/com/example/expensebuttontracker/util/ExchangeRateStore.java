package com.example.expensebuttontracker.util;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class ExchangeRateStore {
    private static final String TAG = "ExchangeRateStore";
    private static final String PREFS = "expense_button_tracker_exchange_rates";
    private static final String KEY_HUF_PER_EUR = "huf_per_eur";
    private static final String KEY_TRY_PER_EUR = "try_per_eur";
    private static final String KEY_DATE = "date";
    private static final String KEY_FETCHED_AT = "fetched_at";
    private static final String[] RATES_URLS = new String[]{
            "https://api.frankfurter.app/latest?from=EUR&to=HUF,TRY",
            "https://api.frankfurter.dev/v2/rates?base=EUR&quotes=HUF,TRY"
    };

    private ExchangeRateStore() {
    }

    public interface Callback {
        void onSuccess(ExchangeRates rates);

        void onError(String message);
    }

    public static ExchangeRates loadCached(Context context) {
        SharedPreferences prefs = prefs(context);
        String huf = prefs.getString(KEY_HUF_PER_EUR, null);
        String lira = prefs.getString(KEY_TRY_PER_EUR, null);
        if (huf == null || lira == null) {
            return null;
        }
        try {
            return new ExchangeRates(
                    new BigDecimal(huf),
                    new BigDecimal(lira),
                    prefs.getString(KEY_DATE, ""),
                    prefs.getLong(KEY_FETCHED_AT, 0L));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    public static void fetchLatest(Context context, Callback callback) {
        Context appContext = context.getApplicationContext();
        Handler mainHandler = new Handler(Looper.getMainLooper());
        Thread worker = new Thread(() -> {
            try {
                ExchangeRates rates = requestLatestRates();
                save(appContext, rates);
                mainHandler.post(() -> callback.onSuccess(rates));
            } catch (Exception ex) {
                String message = ex.getMessage() == null ? "Could not update exchange rates." : ex.getMessage();
                mainHandler.post(() -> callback.onError(message));
            }
        }, "exchange-rate-fetch");
        worker.start();
    }

    private static ExchangeRates requestLatestRates() throws Exception {
        Exception lastException = null;
        for (String ratesUrl : RATES_URLS) {
            try {
                return requestLatestRates(ratesUrl);
            } catch (Exception ex) {
                lastException = ex;
                Log.w(TAG, "Rate endpoint failed: " + ratesUrl, ex);
            }
        }
        if (lastException != null) {
            throw lastException;
        }
        throw new IOException("No exchange-rate endpoints are configured.");
    }

    private static ExchangeRates requestLatestRates(String ratesUrl) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(ratesUrl).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "ExpenseButtonTracker/1.0");
        int statusCode = connection.getResponseCode();
        if (statusCode < 200 || statusCode >= 300) {
            throw new IOException("Rate service returned HTTP " + statusCode + ".");
        }
        try (InputStream stream = connection.getInputStream()) {
            return parse(readAll(stream), System.currentTimeMillis());
        } finally {
            connection.disconnect();
        }
    }

    private static ExchangeRates parse(String body, long fetchedAtMillis) throws Exception {
        JSONObject root = new JSONObject(body);
        BigDecimal hufPerEur = null;
        BigDecimal tryPerEur = null;
        String date = root.optString("date", "");

        JSONArray values = root.optJSONArray("value");
        if (values != null) {
            for (int i = 0; i < values.length(); i++) {
                JSONObject item = values.getJSONObject(i);
                String quote = item.optString("quote", "");
                if (date.isEmpty()) {
                    date = item.optString("date", "");
                }
                if (CurrencyUtils.HUF.equals(quote)) {
                    hufPerEur = decimal(item.get("rate"));
                } else if (CurrencyUtils.TRY.equals(quote)) {
                    tryPerEur = decimal(item.get("rate"));
                }
            }
        }

        JSONObject rates = root.optJSONObject("rates");
        if (rates != null) {
            if (rates.has(CurrencyUtils.HUF)) {
                hufPerEur = decimal(rates.get(CurrencyUtils.HUF));
            }
            if (rates.has(CurrencyUtils.TRY)) {
                tryPerEur = decimal(rates.get(CurrencyUtils.TRY));
            }
        }

        if (hufPerEur == null || tryPerEur == null) {
            throw new IOException("Rate response did not include HUF and TL.");
        }
        return new ExchangeRates(hufPerEur, tryPerEur, date, fetchedAtMillis);
    }

    private static BigDecimal decimal(Object value) {
        return new BigDecimal(String.valueOf(value));
    }

    private static String readAll(InputStream stream) throws IOException {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private static void save(Context context, ExchangeRates rates) {
        prefs(context).edit()
                .putString(KEY_HUF_PER_EUR, rates.hufPerEur.toPlainString())
                .putString(KEY_TRY_PER_EUR, rates.tryPerEur.toPlainString())
                .putString(KEY_DATE, rates.date)
                .putLong(KEY_FETCHED_AT, rates.fetchedAtMillis)
                .apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
