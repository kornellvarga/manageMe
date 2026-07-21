package com.example.expensebuttontracker.notification;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.data.EntryType;
import com.example.expensebuttontracker.ui.LockScreenQuickAddActivity;
import com.example.expensebuttontracker.ui.MainActivity;
import com.example.expensebuttontracker.ui.QuickAddActivity;
import com.example.expensebuttontracker.util.SettingsStore;

public final class LockScreenQuickAddNotification {
    private static final String CHANNEL_ID = "lock_screen_quick_add_v2";
    private static final int NOTIFICATION_ID = 5100;
    private static final int REQUEST_OPEN_APP = 5101;
    private static final int REQUEST_EXPENSE = 5102;
    private static final int REQUEST_INCOME = 5103;

    private LockScreenQuickAddNotification() {
    }

    public static void update(Context context) {
        if (SettingsStore.isLockScreenNotificationEnabled(context) && hasNotificationPermission(context)) {
            show(context);
        } else {
            cancel(context);
        }
    }

    public static boolean hasNotificationPermission(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true;
        }
        return context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private static void show(Context context) {
        Context appContext = context.getApplicationContext();
        NotificationManager manager = (NotificationManager) appContext.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Lock-screen quick add",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Quickly add expenses or income from the lock screen.");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            manager.createNotificationChannel(channel);
        }

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(appContext, CHANNEL_ID)
                : new Notification.Builder(appContext);

        builder
                .setSmallIcon(R.drawable.ic_tile_add)
                .setContentTitle("Add money entry")
                .setContentText("Quick add from the lock screen")
                .setContentIntent(openAppIntent(appContext))
                .setOngoing(true)
                .setShowWhen(false)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setPriority(Notification.PRIORITY_HIGH)
                .addAction(action(appContext, "Expense", EntryType.EXPENSE, REQUEST_EXPENSE))
                .addAction(action(appContext, "Income", EntryType.INCOME, REQUEST_INCOME));

        manager.notify(NOTIFICATION_ID, builder.build());
    }

    private static Notification.Action action(Context context, String title, String type, int requestCode) {
        PendingIntent intent = quickAddIntent(context, type, requestCode);
        return new Notification.Action.Builder(R.drawable.ic_tile_add, title, intent).build();
    }

    private static PendingIntent quickAddIntent(Context context, String type, int requestCode) {
        Intent intent = new Intent(context, LockScreenQuickAddActivity.class);
        intent.setAction("com.example.expensebuttontracker.action.LOCK_SCREEN_" + type);
        intent.putExtra(QuickAddActivity.EXTRA_ENTRY_TYPE, type);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }

    private static PendingIntent openAppIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("com.example.expensebuttontracker.action.OPEN_MAIN");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, REQUEST_OPEN_APP, intent, flags);
    }

    public static void cancel(Context context) {
        NotificationManager manager = (NotificationManager) context.getApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
    }
}
