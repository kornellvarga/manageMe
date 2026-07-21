package com.example.expensebuttontracker.qs;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

import com.example.expensebuttontracker.R;
import com.example.expensebuttontracker.ui.LockScreenQuickAddActivity;
import com.example.expensebuttontracker.ui.QuickAddActivity;
import com.example.expensebuttontracker.util.SettingsStore;

public class ExpenseTileService extends TileService {
    private static final int REQUEST_QUICK_ADD_TILE = 4200;

    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile != null) {
            tile.setLabel(getString(R.string.qs_tile_label));
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                tile.setSubtitle("Expense / income");
            }
            tile.setState(Tile.STATE_INACTIVE);
            tile.updateTile();
        }
    }

    @Override
    public void onClick() {
        super.onClick();
        Runnable launch = this::launchQuickAdd;
        if (isLocked() && !SettingsStore.isLockScreenQuickAddEnabled(this)) {
            unlockAndRun(launch);
        } else {
            launch.run();
        }
    }

    private void launchQuickAdd() {
        Class<?> targetActivity = SettingsStore.isLockScreenQuickAddEnabled(this)
                ? LockScreenQuickAddActivity.class
                : QuickAddActivity.class;
        Intent intent = new Intent(this, targetActivity);
        intent.setAction("com.example.expensebuttontracker.action.QUICK_ADD_TILE");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pendingIntent = PendingIntent.getActivity(this, REQUEST_QUICK_ADD_TILE, intent, flags);
            startActivityAndCollapse(pendingIntent);
        } else {
            startActivityAndCollapseLegacy(intent);
        }
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    @SuppressWarnings("deprecation")
    private void startActivityAndCollapseLegacy(Intent intent) {
        startActivityAndCollapse(intent);
    }
}
