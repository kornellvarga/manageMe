package com.example.expensebuttontracker.data;

public class Category {
    public final long id;
    public final String type;
    public final String name;
    public final int sortOrder;

    public Category(long id, String type, String name, int sortOrder) {
        this.id = id;
        this.type = type;
        this.name = name;
        this.sortOrder = sortOrder;
    }
}
