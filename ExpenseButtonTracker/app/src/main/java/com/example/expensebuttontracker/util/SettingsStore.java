package com.example.expensebuttontracker.util;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Locale;
import java.util.UUID;

public final class SettingsStore {
    private static final String PREFS = "expense_button_tracker_settings";
    private static final String KEY_LOCK_SCREEN_QUICK_ADD = "lock_screen_quick_add";
    private static final String KEY_LOCK_SCREEN_NOTIFICATION = "lock_screen_notification";
    private static final String KEY_DISPLAY_CURRENCY = "display_currency";
    private static final String KEY_ENTRY_CURRENCY = "entry_currency";
    private static final String KEY_DEVICE_ID = "finance_sync_device_id";
    private static final String KEY_FINANCE_API_URL = "finance_sync_api_url";
    private static final String KEY_FINANCE_REFRESH_TOKEN = "finance_sync_refresh_token";
    private static final String KEY_FINANCE_LAST_SYNC_AT = "finance_sync_last_at";
    private static final String KEY_FINANCE_LAST_SYNC_ERROR = "finance_sync_last_error";
    private static final String KEY_FINANCE_LAST_REVISION = "finance_sync_last_revision";

    private SettingsStore() {
    }

    public static boolean isLockScreenQuickAddEnabled(Context context) {
        return prefs(context).getBoolean(KEY_LOCK_SCREEN_QUICK_ADD, false);
    }

    public static void setLockScreenQuickAddEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_LOCK_SCREEN_QUICK_ADD, enabled).apply();
    }

    public static boolean isLockScreenNotificationEnabled(Context context) {
        return prefs(context).getBoolean(KEY_LOCK_SCREEN_NOTIFICATION, false);
    }

    public static void setLockScreenNotificationEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_LOCK_SCREEN_NOTIFICATION, enabled).apply();
    }

    public static String getDisplayCurrency(Context context) {
        return CurrencyUtils.normalize(prefs(context).getString(KEY_DISPLAY_CURRENCY, CurrencyUtils.DEFAULT_CURRENCY));
    }

    public static void setDisplayCurrency(Context context, String currencyCode) {
        prefs(context).edit().putString(KEY_DISPLAY_CURRENCY, CurrencyUtils.normalize(currencyCode)).apply();
    }

    public static String getEntryCurrency(Context context) {
        return CurrencyUtils.normalize(prefs(context).getString(KEY_ENTRY_CURRENCY, CurrencyUtils.DEFAULT_CURRENCY));
    }

    public static void setEntryCurrency(Context context, String currencyCode) {
        prefs(context).edit().putString(KEY_ENTRY_CURRENCY, CurrencyUtils.normalize(currencyCode)).apply();
    }

    public static String getDeviceId(Context context) {
        SharedPreferences preferences = prefs(context);
        String existing = preferences.getString(KEY_DEVICE_ID, "");
        if (existing != null && !existing.trim().isEmpty()) {
            return existing;
        }
        String generated = ("android_" + UUID.randomUUID().toString().replace("-", "")).toLowerCase(Locale.ROOT);
        preferences.edit().putString(KEY_DEVICE_ID, generated).commit();
        return generated;
    }

    public static void setFinanceSyncCredentials(Context context, String apiUrl, String refreshToken) {
        String cleanUrl = normalizeApiUrl(apiUrl);
        String cleanToken = refreshToken == null ? "" : refreshToken.trim();
        if (cleanUrl.isEmpty() || cleanToken.length() < 20) {
            throw new IllegalArgumentException("Finance sync credentials are incomplete.");
        }
        prefs(context).edit()
                .putString(KEY_FINANCE_API_URL, cleanUrl)
                .putString(KEY_FINANCE_REFRESH_TOKEN, cleanToken)
                .remove(KEY_FINANCE_LAST_SYNC_ERROR)
                .apply();
    }

    public static boolean hasFinanceSyncCredentials(Context context) {
        return !getFinanceApiUrl(context).isEmpty() && !getFinanceRefreshToken(context).isEmpty();
    }

    public static String getFinanceApiUrl(Context context) {
        return normalizeApiUrl(prefs(context).getString(KEY_FINANCE_API_URL, ""));
    }

    public static String getFinanceRefreshToken(Context context) {
        String value = prefs(context).getString(KEY_FINANCE_REFRESH_TOKEN, "");
        return value == null ? "" : value.trim();
    }

    public static void updateFinanceRefreshToken(Context context, String refreshToken) {
        String cleanToken = refreshToken == null ? "" : refreshToken.trim();
        if (!cleanToken.isEmpty()) {
            prefs(context).edit().putString(KEY_FINANCE_REFRESH_TOKEN, cleanToken).apply();
        }
    }

    public static void clearFinanceSyncCredentials(Context context) {
        prefs(context).edit()
                .remove(KEY_FINANCE_API_URL)
                .remove(KEY_FINANCE_REFRESH_TOKEN)
                .remove(KEY_FINANCE_LAST_SYNC_ERROR)
                .apply();
    }

    public static void markFinanceSyncSuccess(Context context, long revision) {
        prefs(context).edit()
                .putLong(KEY_FINANCE_LAST_SYNC_AT, System.currentTimeMillis())
                .putLong(KEY_FINANCE_LAST_REVISION, Math.max(0L, revision))
                .remove(KEY_FINANCE_LAST_SYNC_ERROR)
                .apply();
    }

    public static void markFinanceSyncError(Context context, String message) {
        String safeMessage = message == null ? "Finance sync failed." : message.trim();
        if (safeMessage.length() > 300) {
            safeMessage = safeMessage.substring(0, 300);
        }
        prefs(context).edit().putString(KEY_FINANCE_LAST_SYNC_ERROR, safeMessage).apply();
    }

    public static long getFinanceLastSyncAt(Context context) {
        return prefs(context).getLong(KEY_FINANCE_LAST_SYNC_AT, 0L);
    }

    public static long getFinanceLastRevision(Context context) {
        return prefs(context).getLong(KEY_FINANCE_LAST_REVISION, 0L);
    }

    public static String getFinanceLastSyncError(Context context) {
        String value = prefs(context).getString(KEY_FINANCE_LAST_SYNC_ERROR, "");
        return value == null ? "" : value;
    }

    public static String normalizeApiUrl(String value) {
        String clean = value == null ? "" : value.trim();
        while (clean.endsWith("/")) {
            clean = clean.substring(0, clean.length() - 1);
        }
        if (!clean.startsWith("https://")) {
            return "";
        }
        return clean;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
