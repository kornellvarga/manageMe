# ManageMe

ManageMe is Kornel's cross-device personal management system. It is designed for the moment when there is too much to remember and the next useful action is unclear.

The default loop is deliberately small:

1. Capture a thought before it disappears.
2. Keep at most three tasks in **Today**.
3. Do one, finish it, or reschedule it intentionally.
4. Let the assistant read the same private state and help choose the next step.

## What is here

- `web/` — responsive offline-capable GitHub Pages app.
- `gateway/` — authenticated Cloudflare Worker exposing REST and MCP.
- `contracts/` — versioned state and command contracts shared by every client.
- `ExpenseButtonTracker/` — Android APK. ManageMe is now its home screen; the existing money tracker remains available inside it.
- `docs/` — deployment, data model, and assistant setup.

Personal state is never placed in the public Pages repository. The web app and APK authenticate through the gateway; the gateway alone can update `state.json` in a separate private GitHub repository.

## Run locally

```powershell
cd web
npm install
npm run dev
```

The UI works locally and queues changes even before a gateway is configured. Copy `web/.env.example` to `web/.env.local` to point it at a running gateway.

Verification:

```powershell
cd web
npm run check

cd ..\gateway
npm run check
npm test

cd ..\ExpenseButtonTracker
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME='C:\Users\korne\AppData\Local\Android\Sdk'
.\gradlew.bat assembleDebug --no-daemon
```

See [deployment](docs/DEPLOYMENT.md), [the data model](docs/DATA_MODEL.md), and [assistant setup](docs/ASSISTANT_SETUP.md).

