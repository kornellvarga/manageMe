# Deployment

ManageMe uses three intentionally separate pieces:

```text
Public GitHub Pages UI + downloadable APK
                    |
          GitHub-authorized HTTPS
                    |
      Cloudflare Worker REST + MCP
                    |
        Private GitHub state.json
```

This keeps personal state and GitHub credentials out of the public site and APK.

## 1. GitHub repositories

- Public application repository: `kornellvarga/manageMe`.
- Private data repository: `kornellvarga/manageme-data`.
- Initialize the private repository with `contracts/example-state.json` renamed to `state.json`.

Never copy the live `state.json` into the public application repository.

## 2. GitHub App

Create one private GitHub App owned by Kornel:

- Homepage: the ManageMe Pages URL.
- Callback URL: `https://manageme-gateway.kornel-718.workers.dev/auth/github/callback`.
- Webhook: disabled.
- Repository permission, Contents: **Read and write**.
- Installation: only `manageme-data`.

Record its App ID, Client ID, client secret, generated private key, and installation ID. The Client ID and secret are used only for Kornel's sign-in; the App ID, key, and installation ID are used for repository access.

## 3. Worker secrets

Sign in once from `gateway/`:

```powershell
npx wrangler login
```

Set every secret below. Generate the two random values independently.

```powershell
npx wrangler secret put AUTH_SIGNING_SECRET
npx wrangler secret put MANAGEME_MCP_TOKEN
npx wrangler secret put GITHUB_OAUTH_CLIENT_ID
npx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_INSTALLATION_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
```

Deploy and verify:

```powershell
npm run check
npm test
npm run deploy
```

Opening `/health` on the returned Worker URL must report `ok: true`.

## 4. Connect Pages

In the public application repository, add an Actions variable named `MANAGEME_API_URL` containing the Worker origin, without a trailing slash. Enable GitHub Pages with **GitHub Actions** as its source.

The `Publish ManageMe` workflow then:

- builds and verifies the Android APK;
- gives repeated APK builds a stable development signature;
- places the APK behind the in-app download link;
- builds the static Pages app with the correct `/manageMe` path;
- publishes only the generated public application shell.

The Pages application works as a local/offline preview before this variable exists. Live cross-device sync appears after the gateway URL is configured and Kornel connects with GitHub.

## 5. Automated gateway deployments

To use the manual `Deploy ManageMe gateway` workflow, add repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The ManageMe/GitHub secrets above remain stored by Cloudflare, not GitHub Actions.
