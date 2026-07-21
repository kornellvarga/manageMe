package com.example.expensebuttontracker.util;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

public final class CurrencyUtils {
    public static final String HUF = "HUF";
    public static final String EUR = "EUR";
    public static final String TRY = "TRY";
    public static final String DEFAULT_CURRENCY = EUR;
    public static final String[] SUPPORTED_CURRENCIES = new String[]{HUF, EUR, TRY};

    private CurrencyUtils() {
    }

    public static String normalize(String value) {
        if (value == null) {
            return DEFAULT_CURRENCY;
        }
        String code = value.trim().toUpperCase(Locale.US);
        if ("TL".equals(code)) {
            return TRY;
        }
        if (isSupported(code)) {
            return code;
        }
        return DEFAULT_CURRENCY;
    }

    public static boolean isSupported(String value) {
        if (value == null) {
            return false;
        }
        String code = value.trim().toUpperCase(Locale.US);
        return HUF.equals(code) || EUR.equals(code) || TRY.equals(code);
    }

    public static String displayCode(String value) {
        String code = normalize(value);
        if (TRY.equals(code)) {
            return "TL";
        }
        return code;
    }

    public static String formatCents(long cents, String currencyCode) {
        DecimalFormat format = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.getDefault()));
        BigDecimal amount = BigDecimal.valueOf(cents).abs().movePointLeft(2);
        String sign = cents < 0 ? "-" : "";
        return sign + displayCode(currencyCode) + " " + format.format(amount);
    }
}
