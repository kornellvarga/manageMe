package com.example.expensebuttontracker.data;

public final class EntryType {
    public static final String EXPENSE = "EXPENSE";
    public static final String INCOME = "INCOME";

    private EntryType() {
    }

    public static boolean isValid(String value) {
        return EXPENSE.equals(value) || INCOME.equals(value);
    }

    public static String displayName(String value) {
        if (INCOME.equals(value)) {
            return "Income";
        }
        return "Expense";
    }
}
