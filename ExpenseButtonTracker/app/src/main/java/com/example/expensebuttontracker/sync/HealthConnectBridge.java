package com.example.expensebuttontracker.sync;

import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.ext.SdkExtensions;

public final class HealthConnectBridge {
    private static final int REQUIRED_U_EXTENSION = 7;

    public static final String READ_WEIGHT = "android.permission.health.READ_WEIGHT";
    public static final String READ_STEPS = "android.permission.health.READ_STEPS";
    public static final String READ_ACTIVE_CALORIES = "android.permission.health.READ_ACTIVE_CALORIES_BURNED";
    public static final String READ_TOTAL_CALORIES = "android.permission.health.READ_TOTAL_CALORIES_BURNED";
    public static final String READ_RESTING_HEART_RATE = "android.permission.health.READ_RESTING_HEART_RATE";
    public static final String READ_SLEEP = "android.permission.health.READ_SLEEP";
    public static final String READ_EXERCISE = "android.permission.health.READ_EXERCISE";

    private static final String[] PERMISSIONS = new String[]{
            READ_WEIGHT,
            READ_STEPS,
            READ_ACTIVE_CALORIES,
            READ_TOTAL_CALORIES,
            READ_RESTING_HEART_RATE,
            READ_SLEEP,
            READ_EXERCISE
    };

    private HealthConnectBridge() {
    }

    public static String[] permissions() {
        return PERMISSIONS.clone();
    }

    public static boolean isSupported() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return false;
        }
        try {
            return SdkExtensions.getExtensionVersion(Build.VERSION_CODES.UPSIDE_DOWN_CAKE) >= REQUIRED_U_EXTENSION;
        } catch (Throwable ignored) {
            return false;
        }
    }

    public static boolean hasAllPermissions(Context context) {
        if (!isSupported()) {
            return false;
        }
        for (String permission : PERMISSIONS) {
            if (context.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }
}
