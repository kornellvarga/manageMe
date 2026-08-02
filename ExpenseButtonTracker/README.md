# ManageMe Android

The Android APK opens the same ManageMe client as GitHub Pages, using isolated WebView storage for OAuth and offline state. No GitHub credential is compiled into the APK.

The native expense/income tracker remains available from the **Money** button, including its widget, Quick Settings tile, lock-screen capture, local SQLite history, statistics, exchange rates, and CSV export.

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
- Exports all entries to CSV, including currency.
- Includes opt-in lock-screen quick-add surfaces. Device/OEM lock-screen notification policy still applies.

## Local-first finance synchronization

The tracker still writes to `expense_button_tracker.db` immediately. Quick add never waits for GitHub or an internet connection.

After Kornel connects ManageMe with GitHub inside the APK, the trusted ManageMe page passes its gateway refresh token through a one-way native bridge. The native client then:

1. saves entries and category changes locally;
2. sends a stable-ID snapshot to the authenticated ManageMe gateway in the background;
3. merges the canonical private `finance.json` ledger back into SQLite;
4. keeps deletion tombstones so removals synchronize safely;
5. retries naturally the next time ManageMe opens or another quick-add is saved.

The bridge has no token getter and exposes no finance records to arbitrary web pages. It accepts only the compiled ManageMe Pages URL and compiled gateway URL.

The finance ledger preserves original currencies. HUF, EUR, and TRY are not silently combined by the backend. The Android dashboard can still display converted totals using its separately cached exchange rates.

### Existing-data migration

Version 2.1 upgrades the SQLite schema from version 3 to 4 in place:

- existing entries and categories are retained;
- each existing row receives a stable synchronization ID;
- update and deletion timestamps are added;
- the application ID remains `com.example.expensebuttontracker`.

An installed APK is upgradable without clearing data only when the new APK is signed with the same signing certificate. Export CSV before any manual uninstall or signing-key change.

## Conversational finance access

The gateway exposes validated MCP tools for listing and summarizing entries, adding/correcting/deleting transactions, and managing categories. This makes requests such as these possible after finance has synchronized:

- “How much did I spend on food this month?”
- “Add 4,500 HUF for groceries today.”
- “Change yesterday’s taxi to 32 EUR.”
- “Show HUF, EUR, and TL totals separately.”

## Project details

- Language: Java
- UI: Native Android views, programmatic layout
- Persistence: SQLiteOpenHelper
- Finance sync: authenticated ManageMe gateway backed by a private GitHub repository
- Exchange rates: Frankfurter public API (`https://api.frankfurter.dev`), no API key
- Minimum Android: 7.0 / API 24
- Target / compile SDK: 35
- Android Gradle Plugin: 8.7.3
- Package: `com.example.expensebuttontracker`

## Build in Android Studio

1. Open this folder in Android Studio.
2. Let Gradle sync.
3. Install SDK Platform 35 if Android Studio asks for it.
4. Run the `app` configuration on a device or emulator.

This project includes source code, Android Gradle project files, and a Gradle wrapper. Android Studio can import and sync the project directly. To build from the command line, use:

```bash
./gradlew assembleDebug
```

On Windows PowerShell:

```powershell
.\gradlew.bat assembleDebug
```

## How to use

1. Install or upgrade **ManageMe** without uninstalling the existing signed app.
2. Open ManageMe and connect with GitHub once.
3. Open **Money** for the native tracker.
4. Keep using Quick add, the widget, Quick Settings tile, and lock-screen surfaces normally.
5. Keep CSV export as an independent backup.

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
