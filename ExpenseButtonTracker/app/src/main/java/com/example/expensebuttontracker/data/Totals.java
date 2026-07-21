package com.example.expensebuttontracker.data;

public class Totals {
    public final long expenseCents;
    public final long incomeCents;

    public Totals(long expenseCents, long incomeCents) {
        this.expenseCents = expenseCents;
        this.incomeCents = incomeCents;
    }

    public long balanceCents() {
        return incomeCents - expenseCents;
    }
}
