import assert from "node:assert/strict";
import test from "node:test";
import { authorizationMetadata, authorize, protectedResourceMetadata, registerClient } from "../src/auth";
import type { Env } from "../src/types";

const env: Env = {
  PUBLIC_ORIGIN: "https://manage.example.com",
  WEB_ORIGIN: "https://kornellvarga.github.io/manageMe",
  AUTH_SIGNING_SECRET: "0123456789abcdef0123456789abcdef",
  GITHUB_OAUTH_CLIENT_ID: "client",
  GITHUB_OAUTH_CLIENT_SECRET: "secret",
  GITHUB_APP_ID: "1",
  GITHUB_INSTALLATION_ID: "2",
  GITHUB_APP_PRIVATE_KEY: "unused",
  GITHUB_DATA_REPOSITORY: "kornellvarga/manageme-data",
};

test("OAuth metadata advertises PKCE and dynamic registration", async () => {
  const response = authorizationMetadata(env);
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(body.code_challenge_methods_supported, ["S256"]);
  assert.equal(body.registration_endpoint, "https://manage.example.com/oauth/register");
  const resource = await protectedResourceMetadata(env).json() as Record<string, unknown>;
  assert.equal(resource.resource, "https://manage.example.com/mcp");
  assert.deepEqual(resource.authorization_servers, ["https://manage.example.com"]);
});

function authorizationRequest(resource: string): Request {
  const url = new URL("https://manage.example.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", "manageme-web-v1");
  url.searchParams.set("redirect_uri", "https://kornellvarga.github.io/manageMe/");
  url.searchParams.set("code_challenge", "challenge");
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "manage:read manage:write");
  url.searchParams.set("resource", resource);
  url.searchParams.set("state", "state");
  return new Request(url);
}

test("OAuth accepts both the web API origin and the MCP resource URL", async () => {
  for (const resource of ["https://manage.example.com", "https://manage.example.com/mcp"]) {
    const response = await authorize(authorizationRequest(resource), env);
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location") || "", /^https:\/\/github\.com\/login\/oauth\/authorize/);
  }
});

test("OAuth rejects a resource outside ManageMe", async () => {
  const response = await authorize(authorizationRequest("https://example.net/mcp"), env);
  assert.equal(response.status, 400);
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.error, "invalid_request");
});

test("dynamic registration accepts HTTPS callback URLs", async () => {
  const request = new Request("https://manage.example.com/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/connector/oauth/callback"] }),
  });
  const response = await registerClient(request, env);
  assert.equal(response.status, 201);
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.token_endpoint_auth_method, "none");
  assert.equal(typeof body.client_id, "string");
});
