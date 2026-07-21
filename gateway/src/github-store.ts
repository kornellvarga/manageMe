import { applyCommand, createEmptyState, isManageMeState } from "./state";
import type { Env, ManageMeCommand, ManageMeState } from "./types";

interface InstallationToken {
  token: string;
  expiresAt: number;
}

interface GitHubFile {
  state: ManageMeState;
  sha?: string;
}

let cachedInstallationToken: InstallationToken | undefined;

function bytesBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Url(bytes: Uint8Array): string {
  return bytesBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function utf8Base64(value: string): string {
  return bytesBase64(new TextEncoder().encode(value));
}

function decodeUtf8Base64(value: string): string {
  const normalized = value.replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function pemBytes(pem: string): Uint8Array {
  const normalized = pem.replaceAll("\\n", "\n");
  const base64 = normalized.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function githubAppJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ iat: now - 30, exp: now + 540, iss: env.GITHUB_APP_ID })));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    asArrayBuffer(pemBytes(env.GITHUB_APP_PRIVATE_KEY)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

async function installationToken(env: Env): Promise<string> {
  if (cachedInstallationToken && cachedInstallationToken.expiresAt > Date.now() + 120_000) return cachedInstallationToken.token;
  const response = await fetch(`https://api.github.com/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${await githubAppJwt(env)}`,
      "User-Agent": "ManageMe-Gateway",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub App authentication failed (${response.status}).`);
  const body = (await response.json()) as { token: string; expires_at: string };
  cachedInstallationToken = { token: body.token, expiresAt: new Date(body.expires_at).getTime() };
  return body.token;
}

function repositoryParts(env: Env): [string, string] {
  const parts = env.GITHUB_DATA_REPOSITORY.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("GITHUB_DATA_REPOSITORY must be owner/name.");
  return [parts[0], parts[1]];
}

function contentUrl(env: Env): string {
  const [owner, repository] = repositoryParts(env);
  const path = env.GITHUB_DATA_PATH || "state.json";
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

async function githubHeaders(env: Env): Promise<Record<string, string>> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${await installationToken(env)}`,
    "User-Agent": "ManageMe-Gateway",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function readState(env: Env): Promise<GitHubFile> {
  const url = new URL(contentUrl(env));
  url.searchParams.set("ref", env.GITHUB_DATA_BRANCH || "main");
  const response = await fetch(url, { headers: await githubHeaders(env) });
  if (response.status === 404) return { state: createEmptyState() };
  if (!response.ok) throw new Error(`GitHub state read failed (${response.status}).`);
  const body = (await response.json()) as { content?: string; sha?: string; type?: string };
  if (body.type !== "file" || !body.content || !body.sha) throw new Error("GitHub state path is not a readable file.");
  const parsed: unknown = JSON.parse(decodeUtf8Base64(body.content));
  if (!isManageMeState(parsed)) throw new Error("Private repository contains an unsupported ManageMe state.");
  return { state: parsed, sha: body.sha };
}

async function writeState(env: Env, state: ManageMeState, summary: string, sha?: string): Promise<void> {
  const body: Record<string, unknown> = {
    message: `ManageMe: ${summary}`.slice(0, 200),
    content: utf8Base64(`${JSON.stringify(state, null, 2)}\n`),
    branch: env.GITHUB_DATA_BRANCH || "main",
    committer: { name: "ManageMe", email: "manageme-bot@users.noreply.github.com" },
  };
  if (sha) body.sha = sha;
  const response = await fetch(contentUrl(env), {
    method: "PUT",
    headers: { ...(await githubHeaders(env)), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (response.status === 409 || response.status === 422) throw new GitHubConflictError();
  if (!response.ok) throw new Error(`GitHub state write failed (${response.status}).`);
}

class GitHubConflictError extends Error {}

export async function applyCommandToGitHub(env: Env, command: ManageMeCommand): Promise<ManageMeState> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readState(env);
    const result = applyCommand(current.state, command);
    if (!result.changed) return result.state;
    try {
      await writeState(env, result.state, result.summary, current.sha);
      return result.state;
    } catch (error) {
      if (!(error instanceof GitHubConflictError) || attempt === 2) throw error;
    }
  }
  throw new Error("GitHub state changed repeatedly; retry the command.");
}

export function clearInstallationTokenForTests(): void {
  cachedInstallationToken = undefined;
}
