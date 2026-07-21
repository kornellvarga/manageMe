package com.example.expensebuttontracker.data;

public class MoneyEntry {
    public final long id;
    public final String type;
    public final String category;
    public final long amountCents;
    public final String currencyCode;
    public final String name;
    public final long createdAtMillis;

    public MoneyEntry(long id, String type, String category, long amountCents, String currencyCode, String name, long createdAtMillis) {
        this.id = id;
        this.type = type;
        this.category = category;
        this.amountCents = amountCents;
        this.currencyCode = currencyCode;
        this.name = name;
        this.createdAtMillis = createdAtMillis;
    }
}
