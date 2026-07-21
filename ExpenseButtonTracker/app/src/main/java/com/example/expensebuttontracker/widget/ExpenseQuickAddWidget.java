package com.example.expensebuttontracker.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.ui.LockScreenQuickAddActivity;
import com.example.expensebuttontracker.ui.QuickAddActivity;
import com.example.expensebuttontracker.util.SettingsStore;

public class ExpenseQuickAddWidget extends AppWidgetProvider {
    private static final int REQUEST_QUICK_ADD = 4100;

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateWidgets(context, appWidgetManager, appWidgetIds);
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context.getApplicationContext());
        ComponentName provider = new ComponentName(context.getApplicationContext(), ExpenseQuickAddWidget.class);
        int[] ids = manager.getAppWidgetIds(provider);
        updateWidgets(context.getApplicationContext(), manager, ids);
    }

    private static void updateWidgets(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_add);
            PendingIntent pendingIntent = buildQuickAddPendingIntent(context);
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
            views.setOnClickPendingIntent(R.id.widget_add_button, pendingIntent);
            manager.updateAppWidget(id, views);
        }
    }

    private static PendingIntent buildQuickAddPendingIntent(Context context) {
        Class<?> targetActivity = SettingsStore.isLockScreenQuickAddEnabled(context)
                ? LockScreenQuickAddActivity.class
                : QuickAddActivity.class;
        Intent intent = new Intent(context, targetActivity);
        intent.setAction("com.example.expensebuttontracker.action.QUICK_ADD");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, REQUEST_QUICK_ADD, intent, flags);
    }
}
