import {
  authenticate,
  authorizationMetadata,
  authorize,
  githubCallback,
  protectedResourceMetadata,
  registerClient,
  token,
  webClientId,
} from "./auth";
import { applyCommandToGitHub, readState } from "./github-store";
import { handleMcp } from "./mcp";
import { isCommand } from "./state";
import type { Env, ManageMeCommand } from "./types";

function normalizedOrigin(value: string): string {
  return value.replace(/\/$/, "");
}

function corsOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    return origin === new URL(env.WEB_ORIGIN).origin ? origin : null;
  } catch {
    return null;
  }
}

function withCors(response: Response, request: Request, env: Env): Response {
  const origin = corsOrigin(request, env);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Expose-Headers", "MCP-Protocol-Version");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

function unauthorized(env: Env, scope: string): Response {
  const metadata = `${normalizedOrigin(env.PUBLIC_ORIGIN)}/.well-known/oauth-protected-resource`;
  return json({ error: "unauthorized", message: "Connect ManageMe as Kornel to continue." }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${metadata}", scope="${scope}"`,
  });
}

function docs(env: Env): Response {
  return json({
    name: "ManageMe Gateway",
    owner: "Kornel",
    version: "0.1.0",
    purpose: "Authenticated bridge between the ManageMe web/Android clients, assistant tools, and a private GitHub data repository.",
    endpoints: {
      state: "/v1/state",
      commands: "/v1/commands",
      mcp: "/mcp",
      authorize: "/oauth/authorize",
      token: "/oauth/token",
    },
    webClientId: webClientId(),
    authorizationServer: normalizedOrigin(env.PUBLIC_ORIGIN),
  });
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  if (url.pathname === "/health") return json({ ok: true, service: "manageme-gateway", profile: "kornel" });
  if (url.pathname === "/docs") return docs(env);
  if (url.pathname === "/.well-known/oauth-authorization-server") return authorizationMetadata(env);
  if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp") return protectedResourceMetadata(env);
  if (url.pathname === "/oauth/register" && request.method === "POST") return registerClient(request, env);
  if (url.pathname === "/oauth/authorize" && request.method === "GET") return authorize(request, env);
  if (url.pathname === "/oauth/token" && request.method === "POST") return token(request, env);
  if (url.pathname === "/auth/github/callback" && request.method === "GET") return githubCallback(request, env);

  if (url.pathname === "/mcp") {
    const auth = await authenticate(request, env, "manage:read");
    if (!auth) return unauthorized(env, "manage:read");
    return handleMcp(request, env, auth);
  }

  if (url.pathname === "/v1/state" && request.method === "GET") {
    const auth = await authenticate(request, env, "manage:read");
    if (!auth) return unauthorized(env, "manage:read");
    return json({ state: (await readState(env)).state, source: "github" });
  }

  if (url.pathname === "/v1/commands" && request.method === "POST") {
    const auth = await authenticate(request, env, "manage:write");
    if (!auth) return unauthorized(env, "manage:write");
    let command: unknown;
    try {
      command = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!isCommand(command)) return json({ error: "invalid_command" }, 400);
    const state = await applyCommandToGitHub(env, command as ManageMeCommand);
    return json({ state, source: "github" });
  }

  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const runtimeEnv: Env = { ...env, PUBLIC_ORIGIN: env.PUBLIC_ORIGIN || new URL(request.url).origin };
    try {
      return withCors(await route(request, runtimeEnv), request, runtimeEnv);
    } catch (error) {
      console.error("ManageMe gateway request failed", error instanceof Error ? error.message : error);
      return withCors(json({ error: "gateway_error", message: error instanceof Error ? error.message : "ManageMe gateway failed." }, 500), request, runtimeEnv);
    }
  },
};
