import assert from "node:assert/strict";
import test from "node:test";
import { authorizationMetadata, protectedResourceMetadata, registerClient } from "../src/auth";
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
  assert.deepEqual(resource.authorization_servers, ["https://manage.example.com"]);
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

