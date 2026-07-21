import assert from "node:assert/strict";
import test from "node:test";
import { applyCommand, createEmptyState } from "../src/state";
import type { ManageMeCommand } from "../src/types";

function command(requestId: string, type: ManageMeCommand["type"], payload: Record<string, unknown>): ManageMeCommand {
  return { requestId, profileId: "kornel", actor: "web", type, payload };
}

test("capture is idempotent by request id", () => {
  const first = applyCommand(createEmptyState(new Date("2026-07-21T08:00:00Z")), command("web_capture_001", "capture_task", { title: "Call the dentist" }));
  assert.equal(first.state.tasks.length, 1);
  assert.equal(first.state.revision, 1);

  const retry = applyCommand(first.state, command("web_capture_001", "capture_task", { title: "Call the dentist" }));
  assert.equal(retry.changed, false);
  assert.equal(retry.state.tasks.length, 1);
  assert.equal(retry.state.revision, 1);
});

test("focus is limited to three existing tasks", () => {
  let state = createEmptyState();
  for (let index = 0; index < 4; index += 1) {
    state = applyCommand(state, command(`capture_${index}`, "capture_task", { id: `task_${index}`, title: `Task ${index}` })).state;
  }
  state = applyCommand(state, command("focus_001", "select_focus", { date: "2026-07-21", taskIds: ["task_0", "missing", "task_1", "task_2", "task_3"] })).state;
  assert.deepEqual(state.dailyFocus[0].taskIds, ["task_0", "task_1", "task_2"]);
});

test("completing a task removes it from daily focus", () => {
  let state = createEmptyState();
  state = applyCommand(state, command("capture_001", "capture_task", { id: "task_one", title: "One thing" })).state;
  state = applyCommand(state, command("focus_001", "select_focus", { date: "2026-07-21", taskIds: ["task_one"] })).state;
  state = applyCommand(state, command("complete_001", "complete_task", { id: "task_one" })).state;
  assert.equal(state.tasks[0].status, "done");
  assert.deepEqual(state.dailyFocus[0].taskIds, []);
});

