package com.example.expensebuttontracker.data;

public class CurrencyTotal {
    public final String currencyCode;
    public final long expenseCents;
    public final long incomeCents;

    public CurrencyTotal(String currencyCode, long expenseCents, long incomeCents) {
        this.currencyCode = currencyCode;
        this.expenseCents = expenseCents;
        this.incomeCents = incomeCents;
    }

    public long balanceCents() {
        return incomeCents - expenseCents;
    }
}
