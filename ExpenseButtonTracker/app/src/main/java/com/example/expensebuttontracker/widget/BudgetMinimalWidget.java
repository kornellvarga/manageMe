package com.example.expensebuttontracker.widget;

/** Ultra-small lock/home-screen budget widget: exactly one line of information. */
public final class BudgetMinimalWidget extends BudgetProgressWidget {
    @Override
    protected int widgetMode() {
        return MODE_MINIMAL;
    }
}
