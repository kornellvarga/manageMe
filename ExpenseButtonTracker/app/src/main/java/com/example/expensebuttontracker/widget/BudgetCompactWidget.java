package com.example.expensebuttontracker.widget;

/** Small budget widget with name, remaining amount and a slim progress bar. */
public final class BudgetCompactWidget extends BudgetProgressWidget {
    @Override
    protected int widgetMode() {
        return MODE_COMPACT;
    }
}
