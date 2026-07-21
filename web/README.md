# ManageMe web

Static Next.js client for GitHub Pages. It provides quick capture, a maximum-three Today view, Inbox clarification, Areas/Projects, and a short review.

The client caches state and pending commands locally so capture still works while offline. When `NEXT_PUBLIC_MANAGEME_API_URL` is configured, Kornel connects through GitHub OAuth with PKCE and queued commands are sent to the private gateway. No GitHub token is bundled into the site.

```powershell
npm install
npm run dev
npm run check
```

Configuration is documented in `.env.example`. GitHub Pages deployment is defined in `../.github/workflows/pages.yml`.

