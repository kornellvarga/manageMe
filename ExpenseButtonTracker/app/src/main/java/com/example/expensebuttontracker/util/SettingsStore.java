package com.example.expensebuttontracker.util;

import android.content.Context;
import android.content.SharedPreferences;

public final class SettingsStore {
    private static final String PREFS = "expense_button_tracker_settings";
    private static final String KEY_LOCK_SCREEN_QUICK_ADD = "lock_screen_quick_add";
    private static final String KEY_LOCK_SCREEN_NOTIFICATION = "lock_screen_notification";
    private static final String KEY_DISPLAY_CURRENCY = "display_currency";
    private static final String KEY_ENTRY_CURRENCY = "entry_currency";

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

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
