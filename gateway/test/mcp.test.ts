import assert from "node:assert/strict";
import test from "node:test";
import { toolsFor } from "../src/mcp";

test("read-only connections can discover mutation tools for scoped reauthorization", () => {
  const names = toolsFor(["manage:read"]).map((tool) => tool.name);
  assert.deepEqual(names, [
    "manage_get_focus",
    "manage_list_items",
    "manage_review",
    "manage_capture_task",
    "manage_update_task",
    "manage_complete_task",
    "manage_reschedule_task",
    "manage_select_focus",
    "manage_create_project",
    "manage_update_project",
  ]);
});

test("write tools remain deterministically ordered", () => {
  const names = toolsFor(["manage:read", "manage:write"]).map((tool) => tool.name);
  assert.deepEqual(names, [
    "manage_get_focus",
    "manage_list_items",
    "manage_review",
    "manage_capture_task",
    "manage_update_task",
    "manage_complete_task",
    "manage_reschedule_task",
    "manage_select_focus",
    "manage_create_project",
    "manage_update_project",
  ]);
});

test("tools declare the OAuth scopes they require", () => {
  const tools = toolsFor(["manage:read"]);
  assert.deepEqual(tools.find((tool) => tool.name === "manage_list_items")?.securitySchemes, [
    { type: "oauth2", scopes: ["manage:read"] },
  ]);
  assert.deepEqual(tools.find((tool) => tool.name === "manage_update_task")?.securitySchemes, [
    { type: "oauth2", scopes: ["manage:read", "manage:write"] },
  ]);
});
