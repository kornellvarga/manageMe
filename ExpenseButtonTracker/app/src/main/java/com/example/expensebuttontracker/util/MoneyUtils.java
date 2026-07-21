package com.example.expensebuttontracker.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.Currency;
import java.util.Locale;

public final class MoneyUtils {
    private MoneyUtils() {
    }

    public static long parseAmountToCents(String rawInput) throws IllegalArgumentException {
        if (rawInput == null) {
            throw new IllegalArgumentException("Enter an amount.");
        }
        String normalized = rawInput.trim().replace(',', '.');
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("Enter an amount.");
        }

        BigDecimal amount;
        try {
            amount = new BigDecimal(normalized);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Use a valid amount, like 12.50.");
        }

        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Amount must be greater than zero.");
        }

        BigDecimal cents = amount.setScale(2, RoundingMode.HALF_UP).movePointRight(2);
        try {
            return cents.longValueExact();
        } catch (ArithmeticException ex) {
            throw new IllegalArgumentException("Amount is too large.");
        }
    }

    public static String formatCents(long cents) {
        NumberFormat format = NumberFormat.getCurrencyInstance(Locale.getDefault());
        // Keep the user's currency symbol when available, but do not hard-code any currency.
        try {
            format.setCurrency(Currency.getInstance(Locale.getDefault()));
        } catch (Exception ignored) {
        }
        return format.format(cents / 100.0);
    }

    public static String formatCents(long cents, String currencyCode) {
        return CurrencyUtils.formatCents(cents, currencyCode);
    }

    public static String formatPlainDecimal(long cents) {
        return String.format(Locale.US, "%.2f", cents / 100.0);
    }
}
