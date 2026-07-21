import type { ManageMeCommand, ManageMeState } from "./domain";

const API_URL = (process.env.NEXT_PUBLIC_MANAGEME_API_URL || "").replace(/\/$/, "");
const CLIENT_ID = "manageme-web-v1";
const ACCESS_KEY = "manageme-oauth-access-v1";
const REFRESH_KEY = "manageme-oauth-refresh-v1";
const PKCE_KEY = "manageme-oauth-pkce-v1";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

interface StoredAccess {
  token: string;
  expiresAt: number;
}

interface PendingPkce {
  state: string;
  verifier: string;
  redirectUri: string;
}

export class AuthRequiredError extends Error {
  constructor(message = "Connect securely with GitHub to use live sync.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export function hasRemoteApi(): boolean {
  return API_URL.length > 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function randomValue(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function redirectUri(): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function readAccess(): StoredAccess | null {
  try {
    const raw = sessionStorage.getItem(ACCESS_KEY);
    return raw ? (JSON.parse(raw) as StoredAccess) : null;
  } catch {
    return null;
  }
}

function storeTokens(tokens: TokenResponse): void {
  sessionStorage.setItem(ACCESS_KEY, JSON.stringify({
    token: tokens.access_token,
    expiresAt: Date.now() + Math.max(60, tokens.expires_in || 3600) * 1000,
  } satisfies StoredAccess));
  if (tokens.refresh_token) localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
}

async function exchange(parameters: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(`${API_URL}/oauth/token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
  });
  const detail = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & { error_description?: string };
  if (!response.ok || !detail.access_token) throw new AuthRequiredError(detail.error_description || "GitHub connection could not be completed.");
  return detail as TokenResponse;
}

async function refreshAccess(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const tokens = await exchange(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }));
    storeTokens(tokens);
    return tokens.access_token;
  } catch {
    disconnect();
    return null;
  }
}

async function accessToken(forceRefresh = false): Promise<string> {
  const access = readAccess();
  if (!forceRefresh && access && access.expiresAt > Date.now() + 30_000) return access.token;
  const refreshed = await refreshAccess();
  if (refreshed) return refreshed;
  throw new AuthRequiredError();
}

export function isConnected(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(readAccess() || localStorage.getItem(REFRESH_KEY));
}

export function disconnect(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function beginLogin(): Promise<void> {
  if (!hasRemoteApi()) throw new Error("The ManageMe gateway URL is not configured.");
  const verifier = randomValue(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const state = randomValue();
  const callback = redirectUri();
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ state, verifier, redirectUri: callback } satisfies PendingPkce));

  const authorize = new URL(`${API_URL}/oauth/authorize`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", CLIENT_ID);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("code_challenge", base64Url(new Uint8Array(digest)));
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("scope", "manage:read manage:write");
  authorize.searchParams.set("resource", API_URL);
  authorize.searchParams.set("state", state);
  window.location.assign(authorize.toString());
}

export async function finishLoginIfPresent(): Promise<boolean> {
  if (!hasRemoteApi() || typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return isConnected();

  const raw = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  if (!raw) throw new AuthRequiredError("The sign-in session expired. Please connect again.");
  const pending = JSON.parse(raw) as PendingPkce;
  if (!pending.state || pending.state !== url.searchParams.get("state")) throw new AuthRequiredError("The sign-in response could not be verified.");

  const tokens = await exchange(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code,
    code_verifier: pending.verifier,
    redirect_uri: pending.redirectUri,
  }));
  storeTokens(tokens);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

async function api<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const bearer = await accessToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearer}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 401 && retry) {
    await accessToken(true);
    return api<T>(path, init, false);
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({ error: response.statusText }))) as { error?: string; message?: string };
    if (response.status === 401) throw new AuthRequiredError(detail.message);
    throw new Error(detail.message || detail.error || "ManageMe could not sync.");
  }
  return response.json() as Promise<T>;
}

export async function fetchState(): Promise<ManageMeState> {
  const result = await api<{ state: ManageMeState }>("/v1/state");
  return result.state;
}

export async function sendCommand(command: ManageMeCommand): Promise<ManageMeState> {
  const result = await api<{ state: ManageMeState }>("/v1/commands", {
    method: "POST",
    body: JSON.stringify(command),
  });
  return result.state;
}
