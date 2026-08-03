# Permanent Android signing

ManageMe APKs must never rely on a GitHub Actions debug keystore or an Actions cache. Android accepts an update only when the application ID and signing certificate match the installed app and the version code is not lower.

The long-term package is:

```text
com.example.expensebuttontracker.finance
```

It is published as `ManageMe-Finance.apk`; the legacy download filenames also point to this same stable APK.

## Required repository secrets

Configure these under **Settings → Secrets and variables → Actions → Repository secrets**:

- `MANAGEME_KEYSTORE_BASE64`
- `MANAGEME_KEYSTORE_PASSWORD`
- `MANAGEME_KEY_ALIAS`
- `MANAGEME_KEY_PASSWORD`

The Pages workflow fails rather than publishing a differently signed APK when any secret is missing.

## Key custody

Keep the original PKCS#12 keystore in at least two private backups. Do not commit it to this public source repository. Losing the key means future builds cannot update the stable app. Anyone who obtains the key could sign an APK accepted as an update, so treat it as a permanent credential.

## One-time continuity migration

Older `ManageMe` and `ManageMe Sync` installations were built with ephemeral debug certificates and cannot be updated reliably. Keep them installed until the finance ledger is visible in GitHub. Then install `ManageMe Finance`, connect GitHub, open Money, sync, and verify the records before removing an older installation.
