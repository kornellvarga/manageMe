package com.example.expensebuttontracker;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

import com.example.expensebuttontracker.update.UpdateManager;

/** Runs the release check whenever the user brings a ManageMe screen forward. */
public final class ManageMeApplication extends Application implements Application.ActivityLifecycleCallbacks {
    @Override
    public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(this);
    }

    @Override
    public void onActivityResumed(Activity activity) {
        UpdateManager.checkForUpdates(activity);
    }

    @Override public void onActivityCreated(Activity activity, Bundle state) { }
    @Override public void onActivityStarted(Activity activity) { }
    @Override public void onActivityPaused(Activity activity) { }
    @Override public void onActivityStopped(Activity activity) { }
    @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) { }
    @Override public void onActivityDestroyed(Activity activity) { }
}
