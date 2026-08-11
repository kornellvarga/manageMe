package com.example.expensebuttontracker.widget;

/** Compact budget gauge with a square Quick Add expense button beside it. */
public final class BudgetCompactAddWidget extends BudgetProgressWidget {
    @Override
    protected int widgetMode() {
        return MODE_COMPACT_ADD;
    }
}
