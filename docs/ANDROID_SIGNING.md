# Permanent Android signing

ManageMe must never rely on a generated debug keystore or an Actions cache. Android accepts an update only when the application ID and signing certificate match the installed app and the version code is not lower.

## Official app identity

```text
Application ID: com.example.expensebuttontracker.finance
Download:       https://kornellvarga.github.io/manageMe/ManageMe.apk
```

There is one official package and one official APK. `ManageMe-Finance.apk` may remain as a filename alias for old bookmarks, but it contains the same unified app. Migration and import APKs are not published.

## Required repository secrets

Configure these under **Settings → Secrets and variables → Actions → Repository secrets**:

- `MANAGEME_KEYSTORE_BASE64`
- `MANAGEME_KEYSTORE_PASSWORD`
- `MANAGEME_KEY_ALIAS`
- `MANAGEME_KEY_PASSWORD`

The Pages workflow fails rather than publishing an unsigned or differently signed APK when a secret is missing.

## Key custody

Keep the original PKCS#12 keystore in at least two private backups. Do not commit it to the source repository. Losing the key means future builds cannot update the official app. Anyone who obtains the key could sign an accepted update, so treat it as a permanent credential.

## Legacy installations

Older ManageMe and ManageMe Sync installations used ephemeral certificates and cannot be upgraded into the official package. Keep a legacy app only until the official ManageMe app has connected to GitHub, synchronized the finance ledger, and been checked. Then the legacy installation can be removed manually.
