package com.example.expensebuttontracker.widget;

/** Large information-rich budget widget for a home-screen dashboard. */
public final class BudgetDetailedWidget extends BudgetProgressWidget {
    @Override
    protected int widgetMode() {
        return MODE_DETAILED;
    }
}
