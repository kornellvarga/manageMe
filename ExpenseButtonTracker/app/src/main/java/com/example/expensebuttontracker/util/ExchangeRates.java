package com.example.expensebuttontracker.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Locale;

public class ExchangeRates {
    public final BigDecimal hufPerEur;
    public final BigDecimal tryPerEur;
    public final String date;
    public final long fetchedAtMillis;

    public ExchangeRates(BigDecimal hufPerEur, BigDecimal tryPerEur, String date, long fetchedAtMillis) {
        this.hufPerEur = hufPerEur;
        this.tryPerEur = tryPerEur;
        this.date = date == null ? "" : date;
        this.fetchedAtMillis = fetchedAtMillis;
    }

    public Long convertCents(long amountCents, String fromCurrency, String toCurrency) {
        String from = CurrencyUtils.normalize(fromCurrency);
        String to = CurrencyUtils.normalize(toCurrency);
        if (from.equals(to)) {
            return amountCents;
        }

        BigDecimal fromRate = rateFromEur(from);
        BigDecimal toRate = rateFromEur(to);
        if (fromRate == null || toRate == null) {
            return null;
        }

        BigDecimal amount = BigDecimal.valueOf(amountCents);
        BigDecimal eurCents = amount.divide(fromRate, 8, RoundingMode.HALF_UP);
        BigDecimal targetCents = eurCents.multiply(toRate);
        return targetCents.setScale(0, RoundingMode.HALF_UP).longValue();
    }

    public boolean isStale(long nowMillis) {
        return nowMillis - fetchedAtMillis > 12L * 60L * 60L * 1000L;
    }

    public String describe() {
        return "EUR 1 = HUF " + compact(hufPerEur) + " / TL " + compact(tryPerEur);
    }

    private BigDecimal rateFromEur(String currencyCode) {
        String code = CurrencyUtils.normalize(currencyCode);
        if (CurrencyUtils.EUR.equals(code)) {
            return BigDecimal.ONE;
        }
        if (CurrencyUtils.HUF.equals(code)) {
            return hufPerEur;
        }
        if (CurrencyUtils.TRY.equals(code)) {
            return tryPerEur;
        }
        return null;
    }

    private String compact(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString().toUpperCase(Locale.US);
    }
}
