import type { AuthContext, Env } from "./types";

type Claims = Record<string, unknown> & {
  kind: "client" | "github_state" | "oauth_code" | "access" | "refresh";
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ALLOWED_SCOPES = ["manage:read", "manage:write"];
const WEB_CLIENT_ID = "manageme-web-v1";
const MCP_RESOURCE_PATH = "/mcp";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("AUTH_SIGNING_SECRET must contain at least 32 characters.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signClaims(env: Env, input: Omit<Claims, "iat" | "exp">, lifetimeSeconds: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Claims = { ...input, iat: now, exp: now + lifetimeSeconds } as Claims;
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(env.AUTH_SIGNING_SECRET), encoder.encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifyClaims(env: Env, token: string, kind: Claims["kind"]): Promise<Claims> {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Invalid signed token.");
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(env.AUTH_SIGNING_SECRET), asArrayBuffer(base64UrlToBytes(signature)), encoder.encode(payload));
  if (!valid) throw new Error("Invalid signed token.");
  const claims = JSON.parse(decoder.decode(base64UrlToBytes(payload))) as Claims;
  if (claims.kind !== kind || typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error("Signed token expired or has the wrong purpose.");
  return claims;
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

function oauthError(error: string, description: string, status = 400): Response {
  return json({ error, error_description: description }, status);
}

function normalizedOrigin(value: string): string {
  return value.replace(/\/$/, "");
}

function allowedResources(env: Env): string[] {
  const origin = normalizedOrigin(env.PUBLIC_ORIGIN);
  return [origin, `${origin}${MCP_RESOURCE_PATH}`];
}

function isAllowedResource(env: Env, resource: string): boolean {
  return allowedResources(env).includes(normalizedOrigin(resource));
}

function safeScopes(raw: string | null | undefined): string[] {
  const requested = (raw || "manage:read manage:write").split(/\s+/).filter(Boolean);
  if (!requested.every((scope) => ALLOWED_SCOPES.includes(scope))) throw new Error("Unsupported OAuth scope.");
  return [...new Set(requested)];
}

function validatePublicRedirect(uri: string): URL {
  const url = new URL(uri);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("OAuth redirect URIs must use HTTPS.");
  if (url.hash) throw new Error("OAuth redirect URIs cannot include fragments.");
  return url;
}

async function clientRedirects(env: Env, clientId: string): Promise<string[]> {
  if (clientId === WEB_CLIENT_ID) return [normalizedOrigin(env.WEB_ORIGIN), `${normalizedOrigin(env.WEB_ORIGIN)}/`];
  const claims = await verifyClaims(env, clientId, "client");
  if (!Array.isArray(claims.redirectUris)) throw new Error("OAuth client has no redirect URIs.");
  return claims.redirectUris.map(String);
}

async function validateClientRedirect(env: Env, clientId: string, redirectUri: string): Promise<void> {
  validatePublicRedirect(redirectUri);
  const allowed = await clientRedirects(env, clientId);
  if (clientId === WEB_CLIENT_ID) {
    const base = normalizedOrigin(env.WEB_ORIGIN);
    if (redirectUri !== base && !redirectUri.startsWith(`${base}/`) && !redirectUri.startsWith(`${base}?`)) throw new Error("Redirect URI is not part of the ManageMe web app.");
    return;
  }
  if (!allowed.includes(redirectUri)) throw new Error("Redirect URI was not registered by this OAuth client.");
}

export function authorizationMetadata(env: Env): Response {
  const origin = normalizedOrigin(env.PUBLIC_ORIGIN);
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ALLOWED_SCOPES,
  });
}

export function protectedResourceMetadata(env: Env): Response {
  const origin = normalizedOrigin(env.PUBLIC_ORIGIN);
  return json({
    resource: `${origin}${MCP_RESOURCE_PATH}`,
    authorization_servers: [origin],
    scopes_supported: ALLOWED_SCOPES,
    resource_documentation: `${origin}/docs`,
  });
}

export async function registerClient(request: Request, env: Env): Promise<Response> {
  let body: { redirect_uris?: unknown; client_name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return oauthError("invalid_client_metadata", "Request body must be JSON.");
  }
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0 || body.redirect_uris.length > 8) return oauthError("invalid_redirect_uri", "At least one redirect URI is required.");
  try {
    const redirectUris = body.redirect_uris.map(String).map((uri) => validatePublicRedirect(uri).toString());
    const clientId = await signClaims(env, { kind: "client", redirectUris, clientName: String(body.client_name || "ManageMe MCP client").slice(0, 120) }, 365 * 86_400);
    return json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: String(body.client_name || "ManageMe MCP client").slice(0, 120),
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }, 201);
  } catch (error) {
    return oauthError("invalid_redirect_uri", error instanceof Error ? error.message : "Invalid redirect URI.");
  }
}

export async function authorize(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id") || "";
  const redirectUri = url.searchParams.get("redirect_uri") || "";
  const codeChallenge = url.searchParams.get("code_challenge") || "";
  const clientState = url.searchParams.get("state") || "";
  const resource = url.searchParams.get("resource") || `${normalizedOrigin(env.PUBLIC_ORIGIN)}${MCP_RESOURCE_PATH}`;
  try {
    if (url.searchParams.get("response_type") !== "code") throw new Error("Only the authorization code flow is supported.");
    if (url.searchParams.get("code_challenge_method") !== "S256" || !codeChallenge) throw new Error("PKCE with S256 is required.");
    if (!isAllowedResource(env, resource)) throw new Error("OAuth resource does not match this ManageMe server.");
    await validateClientRedirect(env, clientId, redirectUri);
    const scopes = safeScopes(url.searchParams.get("scope"));
    const githubState = await signClaims(env, {
      kind: "github_state",
      clientId,
      redirectUri,
      codeChallenge,
      clientState,
      resource: normalizedOrigin(resource),
      scopes,
      nonce: crypto.randomUUID(),
    }, 600);
    const github = new URL("https://github.com/login/oauth/authorize");
    github.searchParams.set("client_id", env.GITHUB_OAUTH_CLIENT_ID);
    github.searchParams.set("redirect_uri", `${normalizedOrigin(env.PUBLIC_ORIGIN)}/auth/github/callback`);
    github.searchParams.set("scope", "read:user");
    github.searchParams.set("state", githubState);
    return Response.redirect(github, 302);
  } catch (error) {
    return oauthError("invalid_request", error instanceof Error ? error.message : "Authorization request is invalid.");
  }
}

export async function githubCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const githubCode = url.searchParams.get("code") || "";
  const signedState = url.searchParams.get("state") || "";
  try {
    const pending = await verifyClaims(env, signedState, "github_state");
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "ManageMe-Gateway" },
      body: JSON.stringify({ client_id: env.GITHUB_OAUTH_CLIENT_ID, client_secret: env.GITHUB_OAUTH_CLIENT_SECRET, code: githubCode }),
    });
    const tokenBody = (await tokenResponse.json()) as { access_token?: string; error?: string };
    if (!tokenResponse.ok || !tokenBody.access_token) throw new Error(tokenBody.error || "GitHub sign-in failed.");
    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${tokenBody.access_token}`, "User-Agent": "ManageMe-Gateway", "X-GitHub-Api-Version": "2022-11-28" },
    });
    const user = (await userResponse.json()) as { id?: number; login?: string };
    const idMatches = env.ALLOWED_GITHUB_USER_ID && String(user.id) === env.ALLOWED_GITHUB_USER_ID;
    const loginMatches = env.ALLOWED_GITHUB_LOGIN && user.login?.toLowerCase() === env.ALLOWED_GITHUB_LOGIN.toLowerCase();
    if (!userResponse.ok || (!idMatches && !loginMatches)) throw new Error("This private ManageMe belongs to Kornel.");

    const code = await signClaims(env, {
      kind: "oauth_code",
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      resource: pending.resource,
      scopes: pending.scopes,
      sub: "kornel",
      nonce: crypto.randomUUID(),
    }, 300);
    const redirect = new URL(String(pending.redirectUri));
    redirect.searchParams.set("code", code);
    if (pending.clientState) redirect.searchParams.set("state", String(pending.clientState));
    return Response.redirect(redirect, 302);
  } catch (error) {
    return oauthError("access_denied", error instanceof Error ? error.message : "GitHub sign-in was denied.", 403);
  }
}

async function requestParameters(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) if (typeof value === "string") params.set(key, value);
    return params;
  }
  return new URLSearchParams(await request.text());
}

async function pkceMatches(verifier: string, challenge: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest)) === challenge;
}

async function issueTokens(env: Env, clientId: string, scopes: string[], resource: string): Promise<Response> {
  const accessToken = await signClaims(env, { kind: "access", clientId, scopes, aud: resource, sub: "kornel" }, 3600);
  const refreshToken = await signClaims(env, { kind: "refresh", clientId, scopes, aud: resource, sub: "kornel", nonce: crypto.randomUUID() }, 30 * 86_400);
  return json({ access_token: accessToken, token_type: "Bearer", expires_in: 3600, refresh_token: refreshToken, scope: scopes.join(" ") });
}

export async function token(request: Request, env: Env): Promise<Response> {
  try {
    const params = await requestParameters(request);
    const grantType = params.get("grant_type");
    const clientId = params.get("client_id") || "";
    if (grantType === "authorization_code") {
      const claims = await verifyClaims(env, params.get("code") || "", "oauth_code");
      const redirectUri = params.get("redirect_uri") || "";
      if (claims.clientId !== clientId || claims.redirectUri !== redirectUri) return oauthError("invalid_grant", "Authorization code does not match this client.");
      if (!(await pkceMatches(params.get("code_verifier") || "", String(claims.codeChallenge)))) return oauthError("invalid_grant", "PKCE verification failed.");
      await validateClientRedirect(env, clientId, redirectUri);
      return issueTokens(env, clientId, (claims.scopes as string[]) || ["manage:read"], String(claims.resource));
    }
    if (grantType === "refresh_token") {
      const claims = await verifyClaims(env, params.get("refresh_token") || "", "refresh");
      if (claims.clientId !== clientId) return oauthError("invalid_grant", "Refresh token does not match this client.");
      return issueTokens(env, clientId, (claims.scopes as string[]) || ["manage:read"], String(claims.aud));
    }
    return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  } catch (error) {
    return oauthError("invalid_grant", error instanceof Error ? error.message : "Token request is invalid.");
  }
}

export async function authenticate(request: Request, env: Env, requiredScope: "manage:read" | "manage:write"): Promise<AuthContext | null> {
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const bearer = header.slice(7).trim();
  if (env.MANAGEME_MCP_TOKEN && bearer === env.MANAGEME_MCP_TOKEN) {
    return { profileId: "kornel", scopes: ALLOWED_SCOPES, source: "static_mcp_token" };
  }
  try {
    const claims = await verifyClaims(env, bearer, "access");
    const scopes = Array.isArray(claims.scopes) ? claims.scopes.map(String) : [];
    if (claims.sub !== "kornel" || !isAllowedResource(env, String(claims.aud)) || !scopes.includes(requiredScope)) return null;
    return { profileId: "kornel", scopes, source: "oauth" };
  } catch {
    return null;
  }
}

export function webClientId(): string {
  return WEB_CLIENT_ID;
}
