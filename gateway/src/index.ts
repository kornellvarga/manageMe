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
import { isFinanceCommand, isFinanceSnapshot } from "./finance";
import { applyFinanceCommandToGitHub, readFinanceLedger, syncFinanceToGitHub } from "./finance-store";
import { isHealthCommand, isHealthConnectSnapshot } from "./health";
import { applyHealthCommandToGitHub, readHealthLedger, syncHealthConnectToGitHub } from "./health-store";
import { buyAndEat } from "./health-purchase";
import { applyCommandToGitHub, readState } from "./github-store";
import { handleMcpWithFinance } from "./mcp-router";
import { isCommand } from "./state";
import type { FinanceCommand, FinanceSnapshot } from "./finance";
import type { HealthCommand, HealthConnectSnapshot } from "./health";
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
    version: "0.3.0",
    purpose: "Authenticated bridge between the ManageMe web/Android clients, assistant tools, and a private GitHub data repository.",
    endpoints: {
      state: "/v1/state",
      commands: "/v1/commands",
      finance: "/v1/finance",
      financeSync: "/v1/finance/sync",
      financeCommands: "/v1/finance/commands",
      health: "/v1/health",
      healthCommands: "/v1/health/commands",
      healthBuyAndEat: "/v1/health/buy-and-eat",
      healthConnectSync: "/v1/health/connect/sync",
      mcp: "/mcp",
      authorize: "/oauth/authorize",
      token: "/oauth/token",
    },
    webClientId: webClientId(),
    authorizationServer: normalizedOrigin(env.PUBLIC_ORIGIN),
  });
}

async function requestJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
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
    return handleMcpWithFinance(request, env, auth);
  }

  if (url.pathname === "/v1/state" && request.method === "GET") {
    const auth = await authenticate(request, env, "manage:read");
    if (!auth) return unauthorized(env, "manage:read");
    return json({ state: (await readState(env)).state, source: "github" });
  }

  if (url.pathname === "/v1/commands" && request.method === "POST") {
    const auth = await authenticate(request, env, "manage:write");
    if (!auth) return unauthorized(env, "manage:write");
    const command = await requestJson(request);
    if (!isCommand(command)) return json({ error: command === undefined ? "invalid_json" : "invalid_command" }, 400);
    const state = await applyCommandToGitHub(env, command as ManageMeCommand);
    return json({ state, source: "github" });
  }

  if (url.pathname === "/v1/finance" && request.method === "GET") {
    const auth = await authenticate(request, env, "manage:read");
    if (!auth) return unauthorized(env, "manage:read");
    return json({ ledger: (await readFinanceLedger(env)).ledger, source: "github" });
  }

  if (url.pathname === "/v1/finance/sync" && request.method === "POST") {
    const auth = await authenticate(request, env, "manage:write");
    if (!auth) return unauthorized(env, "manage:write");
    const snapshot = await requestJson(request);
    if (!isFinanceSnapshot(snapshot)) return json({ error: snapshot === undefined ? "invalid_json" : "invalid_finance_snapshot" }, 400);
    const ledger = await syncFinanceToGitHub(env, snapshot as FinanceSnapshot);
    return json({ ledger, source: "github" });
  }

  if (url.pathname === "/v1/finance/commands" && request.method === "POST") {
    const auth = await authenticate(request, env, "manage:write");
    if (!auth) return unauthorized(env, "manage:write");
    const command = await requestJson(request);
    if (!isFinanceCommand(command)) return json({ error: command === undefined ? "invalid_json" : "invalid_finance_command" }, 400);
    const result = await applyFinanceCommandToGitHub(env, command as FinanceCommand);
    return json({ ledger: result.ledger, entityId: result.entityId, source: "github" });
  }

  if (url.pathname === "/v1/health" && request.method === "GET") {
    const auth = await authenticate(request, env, "manage:read");
    if (!auth) return unauthorized(env, "manage:read");
    return json({ ledger: (await readHealthLedger(env)).ledger, source: "github" });
  }

  if (url.pathname === "/v1/health/commands" && request.method === "POST") {
    const auth = await authenticate(request, env, "manage:write");
    if (!auth) return unauthorized(env, "manage:write");
    const command = await requestJson(request);
    if (!isHealthCommand(command)) return json({ error: command === undefined ? "invalid_json" : "invalid_health_command" }, 400);
    const result = await applyHealthCommandToGitHub(env, command as HealthCommand);
    return json({ ledger: result.ledger, entityId: result.entityId, source: "github" });
  }

  if (url.pathname === "/v1/health/buy-and-eat" && request.method === "POST") {
    const auth = await authenticate(request, env, "manage:write");
    if (!auth) return unauthorized(env, "manage:write");
    const body = await requestJson(request);
    if (body === undefined) return json({ error: "invalid_json" }, 400);
    const result = await buyAndEat(env, body);
    return json({ ...result, source: "github" }, result.partial === true ? 207 : 200);
  }

  if (url.pathname === "/v1/health/connect/sync" && request.method === "POST") {
    const auth = await authenticate(request, env, "manage:write");
    if (!auth) return unauthorized(env, "manage:write");
    const snapshot = await requestJson(request);
    if (!isHealthConnectSnapshot(snapshot)) return json({ error: snapshot === undefined ? "invalid_json" : "invalid_health_connect_snapshot" }, 400);
    const result = await syncHealthConnectToGitHub(env, snapshot as HealthConnectSnapshot);
    return json({ ledger: result.ledger, affectedCount: result.affectedCount, source: "github" });
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
