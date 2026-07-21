# ManageMe Android

The Android APK opens the same ManageMe client as GitHub Pages, using isolated WebView storage for OAuth and offline state. No GitHub credential is embedded in the APK.

The previous native expense/income tracker remains available from the **Money** button, including its widget, Quick Settings tile, lock-screen capture, local SQLite history, statistics, exchange rates, and CSV export.

## What it does

- Adds a home-screen AppWidget button: **Add expense / income**.
- Adds an optional lock-screen notification card with **Expense** and **Income** actions.
- Adds an optional Quick Settings tile: **Add money entry**.
- Opens a large, scrollable category selector with **Expense** and **+ Income** modes.
- Saves category, amount, timestamp, and an optional editable name.
- Saves a currency per entry: HUF, EUR, or TL (stored internally as TRY).
- Auto-generates a default name like `Food #3` when no name is entered.
- Stores everything locally with SQLite; no account, server, analytics, or paid dependencies.
- Lets you add/delete categories.
- Shows balance, total income, total expenses, and recent entries in the selected display currency.
- Adds a statistics screen with category pie charts, income pie charts, entry counts, and average expense.
- Refreshes live EUR/HUF/TL reference rates from the free Frankfurter API and caches them for offline use.
- Exports all entries to CSV, including currency.
- Includes opt-in lock-screen quick-add surfaces. Device/OEM lock-screen notification policy still applies.

## Project details

- Language: Java
- UI: Native Android views, programmatic layout
- Persistence: SQLiteOpenHelper
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

1. Open **ManageMe** once.
2. Connect with GitHub to share the private state with the browser and assistant.
3. Use **Money** for the original expense tracker.
4. Optional: turn on **Show lock-screen add card** and grant notification permission if Android asks.
5. Pin the money widget or Quick Settings tile if useful.

## Notes about lock-screen behavior

Modern Android lock-screen widget support depends on Android version and manufacturer implementation. The app includes:

- a normal home-screen widget provider,
- a `keyguard` widget category hint for compatible hosts,
- a persistent lock-screen notification card with **Expense** and **Income** actions,
- a lock-screen-enabled quick-add activity used by lock-screen surfaces,
- and a Quick Settings tile fallback.

If a device does not support third-party lock-screen widgets, use the lock-screen notification card instead.

## Customization ideas

- Change default categories in `ExpenseDbHelper.insertDefaultCategories()`.
- Change colors in `res/values/colors.xml`.
- Change the widget UI in `res/layout/widget_quick_add.xml`.
- Change the package/application ID in `app/build.gradle` and `AndroidManifest.xml` before publishing.
