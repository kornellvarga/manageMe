# ManageMe Android

The Android APK opens the same ManageMe client as GitHub Pages, using isolated WebView storage for OAuth and offline state. No GitHub credential is compiled into the APK.

The native expense/income tracker remains available from the **Money** button, including its widget, Quick Settings tile, lock-screen capture, local SQLite history, statistics, exchange rates, CSV export, finance sync, and reversible archives.

## Money tracker features preserved

- Adds a home-screen AppWidget button: **Add expense / income**.
- Adds an optional lock-screen notification card with **Expense** and **Income** actions.
- Adds an optional Quick Settings tile: **Add money entry**.
- Opens a large, scrollable category selector with **Expense** and **+ Income** modes.
- Saves category, amount, timestamp, and an optional editable name.
- Saves a currency per entry: HUF, EUR, or TL (stored internally as TRY).
- Auto-generates a default name like `Food #3` when no name is entered.
- Lets you add/delete categories.
- Shows balance, total income, total expenses, and recent entries in the selected display currency.
- Adds a statistics screen with category pie charts, income pie charts, entry counts, and average expense.
- Refreshes live EUR/HUF/TL reference rates from the free Frankfurter API and caches them for offline use.
- Exports current entries to CSV, including currency.
- Includes opt-in lock-screen quick-add surfaces. Device/OEM lock-screen notification policy still applies.

## Reversible archives

Version 2.2 separates **current** money from retained history:

- Archived entries remain stored locally and in the private GitHub finance ledger.
- Archived entries do not affect current balances, statistics, recent-entry lists, or current CSV export.
- Long-press a current entry to choose **Archive** or **Delete permanently**.
- The Archive screen can restore or permanently delete individual entries.
- The Archive screen can archive every current entry strictly before a chosen cutoff date.
- The assistant can list and summarize active, archived, or all non-deleted entries; archive or restore one entry; and bulk archive before an explicit date.

Android stores archives without a database migration: positive `deleted_at` values remain deletion tombstones, while negative values encode reversible archive timestamps. The sync layer translates these markers to the explicit `archivedAtMillis` field in `finance.json`.

## Local-first finance synchronization

The tracker still writes to `expense_button_tracker.db` immediately. Quick add never waits for GitHub or an internet connection.

After Kornel connects ManageMe with GitHub inside the APK, the trusted ManageMe page passes its gateway refresh token through a one-way native bridge. The native client then:

1. saves entries, categories, archive changes, and deletion tombstones locally;
2. sends a stable-ID snapshot to the authenticated ManageMe gateway in the background;
3. merges the canonical private `finance.json` ledger back into SQLite;
4. retries naturally when ManageMe or Money opens or another quick-add is saved.

Money shows the last successful finance-sync time, finance revision, errors, and a manual **Sync now** button.

The bridge has no token getter and exposes no finance records to arbitrary web pages. It accepts only the compiled ManageMe Pages URL and compiled gateway URL.

The finance ledger preserves original currencies. HUF, EUR, and TRY are not silently combined by the backend. The Android dashboard can still display converted totals using its separately cached exchange rates.

### Existing-data migration

Version 2.1 upgraded the SQLite schema from version 3 to 4 in place:

- existing entries and categories are retained;
- each existing row receives a stable synchronization ID;
- update and deletion timestamps are added;
- the application ID remains `com.example.expensebuttontracker`.

Version 2.2 requires no additional SQLite migration.

An installed APK is upgradable without clearing data only when the new APK is signed with the same signing certificate. The separately installable `ManageMe-Migration.apk` remains available for installations signed with the old certificate. Keep a CSV backup before any manual uninstall or signing-key change.

## Conversational finance access

The gateway exposes validated MCP tools for listing and summarizing entries, adding/correcting/archiving/restoring/deleting transactions, bulk archiving by date, and managing categories. Examples:

- “How much did I spend on food this month?”
- “Archive everything before August 1, 2026.”
- “Show my archived EUR entries.”
- “Restore the taxi expense.”
- “Add 4,500 HUF for groceries today.”

## Project details

- Language: Java
- UI: Native Android views, programmatic layout
- Persistence: SQLiteOpenHelper
- Finance sync: authenticated ManageMe gateway backed by a private GitHub repository
- Exchange rates: Frankfurter public API (`https://api.frankfurter.dev`), no API key
- Minimum Android: 7.0 / API 24
- Target / compile SDK: 35
- Android Gradle Plugin: 8.7.3
- Upgrade package: `com.example.expensebuttontracker`
- Migration package: `com.example.expensebuttontracker.synced`

## Build in Android Studio

1. Open this folder in Android Studio.
2. Let Gradle sync.
3. Install SDK Platform 35 if Android Studio asks for it.
4. Run the `upgradeDebug` or `migrationDebug` configuration.

Command line:

```bash
./gradlew :app:assembleUpgradeDebug :app:assembleMigrationDebug
```

## How to use

1. Install or upgrade **ManageMe Sync** without uninstalling the existing signed app.
2. Open ManageMe and connect with GitHub once.
3. Open **Money** for the native tracker.
4. Use the Finance sync card to verify synchronization.
5. Long-press a current entry to archive it, or open **Archive** for bulk archive and restoration.
6. Keep CSV export as an independent backup.

## Notes about lock-screen behavior

Modern Android lock-screen widget support depends on Android version and manufacturer implementation. The app includes:

- a normal home-screen widget provider;
- a `keyguard` widget category hint for compatible hosts;
- a persistent lock-screen notification card with **Expense** and **Income** actions;
- a lock-screen-enabled quick-add activity used by lock-screen surfaces;
- a Quick Settings tile fallback.

If a device does not support third-party lock-screen widgets, use the lock-screen notification card instead.

## Customization ideas

- Change default categories in `ExpenseDbHelper.insertDefaultCategories()`.
- Change colors in `res/values/colors.xml`.
- Change the widget UI in `res/layout/widget_quick_add.xml`.
- Change the package/application ID in `app/build.gradle` only before publishing a separate app; changing it breaks in-place upgrade continuity.
