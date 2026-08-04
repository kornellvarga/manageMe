# ManageMe Android

There is one official Android app and one download:

```text
https://kornellvarga.github.io/manageMe/ManageMe.apk
```

- App name: **ManageMe**
- Permanent package: `com.example.expensebuttontracker.finance`
- Current version: `2.3.0`
- Signing: permanent release certificate restored from GitHub Actions secrets

Legacy ManageMe, ManageMe Sync, migration, and import APK variants are no longer built or published. They may remain installed on a phone until the user confirms that the official ManageMe app has synchronized all data, after which the legacy installations can be removed manually.

## Money

The native Money tracker remains local-first and includes:

- quick expense and income entry;
- HUF, EUR, and TL/TRY;
- categories, current balances, statistics, CSV export, recent entries;
- home-screen widget, Quick Settings tile, and lock-screen actions;
- GitHub-backed synchronization through the ManageMe gateway;
- reversible archive and bulk archive before a date;
- tap any current entry for **Edit**, **Archive**, or **Delete permanently**;
- exact duplicate cleanup locally and in the synchronized ledger.

Exact duplicates use type, category, amount, currency, title, and original timestamp. One canonical entry is kept and the extra copies become synchronized deletion tombstones.

Archived entries remain available and restorable but do not affect current balances, statistics, recent entries, or current CSV export.

## Build

Debug verification:

```bash
./gradlew :app:assembleDebug
```

Signed release publishing is handled by `.github/workflows/pages.yml` and requires the permanent signing secrets documented in `docs/ANDROID_SIGNING.md`.
