package com.example.expensebuttontracker.notification;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class LockScreenNotificationBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            LockScreenQuickAddNotification.update(context);
        }
    }
}
