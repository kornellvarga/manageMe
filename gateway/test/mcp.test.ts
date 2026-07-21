import assert from "node:assert/strict";
import test from "node:test";
import { toolsFor } from "../src/mcp";

test("read-only connections do not receive mutation tools", () => {
  const names = toolsFor(["manage:read"]).map((tool) => tool.name);
  assert.deepEqual(names, ["manage_get_focus", "manage_list_items", "manage_review"]);
});

test("write tools remain deterministically ordered", () => {
  const names = toolsFor(["manage:read", "manage:write"]).map((tool) => tool.name);
  assert.deepEqual(names, [
    "manage_get_focus",
    "manage_list_items",
    "manage_review",
    "manage_capture_task",
    "manage_complete_task",
    "manage_reschedule_task",
    "manage_select_focus",
    "manage_create_project",
  ]);
});

