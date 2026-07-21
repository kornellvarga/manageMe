import { applyCommandToGitHub, readState } from "./github-store";
import { localDate } from "./state";
import type { AuthContext, Env, ManageMeCommand, ManageMeState, Task } from "./types";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
}

const SERVER_INSTRUCTIONS = "ManageMe is Kornel's private personal focus system. Use read tools whenever Kornel asks what to do, what is due, or how progress is going. Keep Today to at most three concrete actions. Capture what Kornel explicitly mentions. Never invent deadlines, silently reschedule work, or mark a task complete without Kornel saying it is done. Areas are ongoing responsibilities; projects are finishable outcomes; tasks are next actions.";

function tool(name: string, title: string, description: string, properties: Record<string, unknown>, required: string[], readOnly: boolean, idempotent = false): ToolDefinition {
  return {
    name,
    title,
    description,
    inputSchema: { type: "object", additionalProperties: false, properties, required },
    annotations: { readOnlyHint: readOnly, destructiveHint: false, idempotentHint: idempotent, openWorldHint: false },
  };
}

export function toolsFor(scopes: string[]): ToolDefinition[] {
  const readTools: ToolDefinition[] = [
    tool("manage_get_focus", "Get Kornel's focus", "Use this when Kornel asks what to do now or what matters today. Returns the saved Today list, or up to three clearly labelled suggestions without changing state.", {}, [], true, true),
    tool("manage_list_items", "List tasks and projects", "Use this when Kornel asks what is open, due, waiting, in an area, or inside a project.", {
      kind: { type: "string", enum: ["tasks", "projects"], default: "tasks" },
      status: { type: "string", description: "Optional exact status filter." },
      area_id: { type: "string", description: "Optional area id filter." },
      project_id: { type: "string", description: "Optional project id filter for tasks." },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
    }, [], true, true),
    tool("manage_review", "Review progress", "Use this for a short, non-judgmental review of Kornel's inbox, active outcomes, waiting items, neglected work, and recent completions.", {}, [], true, true),
  ];
  if (!scopes.includes("manage:write")) return readTools;
  return [
    ...readTools,
    tool("manage_capture_task", "Capture a task", "Use this when Kornel names something he needs to remember or do. Capture it in Inbox exactly once; do not invent a deadline.", {
      title: { type: "string", minLength: 1, maxLength: 240 },
      notes: { type: "string", maxLength: 4000 },
      area_id: { type: "string" },
      project_id: { type: "string" },
      importance: { type: "string", enum: ["low", "normal", "high", "critical"] },
      energy: { type: "string", enum: ["low", "medium", "high"] },
      estimate_minutes: { type: "integer", minimum: 1, maximum: 1440 },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["title"], false),
    tool("manage_complete_task", "Complete a task", "Use only after Kornel says a specific task is done. This removes it from Today's focus while preserving history.", {
      task_id: { type: "string" },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["task_id"], false, true),
    tool("manage_reschedule_task", "Schedule a task", "Use when Kornel explicitly chooses another date for a task. Do not choose or invent the date yourself.", {
      task_id: { type: "string" },
      scheduled_for: { type: "string", format: "date" },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["task_id", "scheduled_for"], false, true),
    tool("manage_select_focus", "Set today's focus", "Use when Kornel approves up to three task ids for Today. Preserve the supplied order.", {
      task_ids: { type: "array", maxItems: 3, uniqueItems: true, items: { type: "string" } },
      reason: { type: "string", maxLength: 500 },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["task_ids"], false, true),
    tool("manage_create_project", "Create a project", "Use when Kornel describes a finishable outcome inside an existing area. The outcome should explain what done looks like.", {
      area_id: { type: "string" },
      title: { type: "string", minLength: 1, maxLength: 160 },
      desired_outcome: { type: "string", maxLength: 500 },
      due_date: { type: "string", format: "date" },
      request_id: { type: "string", description: "Optional stable idempotency key for retries." },
    }, ["area_id", "title"], false),
  ];
}

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 200): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function resultText(message: string, structuredContent: Record<string, unknown>, isError = false): Record<string, unknown> {
  return { content: [{ type: "text", text: message }], structuredContent, ...(isError ? { isError: true } : {}) };
}

function score(task: Task, now = new Date()): number {
  if (["done", "cancelled", "waiting", "someday"].includes(task.status)) return -Infinity;
  let value = task.status === "scheduled" ? 24 : task.status === "ready" ? 20 : 4;
  value += { low: 0, normal: 14, high: 38, critical: 72 }[task.importance];
  if (task.scheduledFor === localDate(now)) value += 70;
  if (task.dueAt) {
    const hours = (new Date(task.dueAt).getTime() - now.getTime()) / 3_600_000;
    value += hours < 0 ? 120 : hours <= 24 ? 90 : hours <= 72 ? 55 : hours <= 168 ? 25 : 0;
  }
  if (task.estimateMinutes && task.estimateMinutes <= 20) value += 8;
  value += Math.min(24, Math.max(0, (now.getTime() - new Date(task.createdAt).getTime()) / 86_400_000) * 1.5);
  return value;
}

function suggestions(state: ManageMeState): Task[] {
  return state.tasks
    .map((task) => ({ task, score: score(task) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score || a.task.createdAt.localeCompare(b.task.createdAt))
    .slice(0, 3)
    .map((entry) => entry.task);
}

function safeLimit(value: unknown): number {
  const parsed = Number(value || 30);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(parsed, 100)) : 30;
}

function command(type: ManageMeCommand["type"], args: Record<string, unknown>, payload: Record<string, unknown>): ManageMeCommand {
  const supplied = typeof args.request_id === "string" && /^[a-z0-9][a-z0-9_-]{2,63}$/i.test(args.request_id) ? args.request_id.toLowerCase() : undefined;
  return { requestId: supplied || `mcp_${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 64), profileId: "kornel", actor: "assistant", type, payload };
}

async function callTool(name: string, args: Record<string, unknown>, env: Env, auth: AuthContext): Promise<Record<string, unknown>> {
  const state = (await readState(env)).state;
  if (name === "manage_get_focus") {
    const focus = state.dailyFocus.find((item) => item.date === localDate());
    const saved = (focus?.taskIds || []).map((id) => state.tasks.find((task) => task.id === id)).filter((task): task is Task => Boolean(task));
    const tasks = saved.length ? saved : suggestions(state);
    const source = saved.length ? "saved" : "suggested";
    const message = tasks.length ? `${source === "saved" ? "Today's focus" : "Suggested focus"}: ${tasks.map((task) => task.title).join("; ")}` : "No actionable task is available yet. Capture one concrete next action first.";
    return resultText(message, { date: localDate(), source, tasks, reason: focus?.reason || (source === "suggested" ? "Highest urgency and importance among actionable tasks; state was not changed." : undefined) });
  }
  if (name === "manage_list_items") {
    const limit = safeLimit(args.limit);
    if (args.kind === "projects") {
      const projects = state.projects.filter((project) => (!args.status || project.status === args.status) && (!args.area_id || project.areaId === args.area_id)).slice(0, limit);
      return resultText(`Found ${projects.length} project${projects.length === 1 ? "" : "s"}.`, { projects });
    }
    const tasks = state.tasks.filter((task) => (!args.status || task.status === args.status) && (!args.area_id || task.areaId === args.area_id) && (!args.project_id || task.projectId === args.project_id)).slice(0, limit);
    return resultText(`Found ${tasks.length} task${tasks.length === 1 ? "" : "s"}.`, { tasks });
  }
  if (name === "manage_review") {
    const activeProjectIds = state.projects.filter((project) => project.status === "active").map((project) => project.id);
    const projectsWithoutNextAction = activeProjectIds.filter((id) => !state.tasks.some((task) => task.projectId === id && ["ready", "scheduled", "inbox"].includes(task.status)));
    const completedLast7Days = state.tasks.filter((task) => task.completedAt && Date.now() - new Date(task.completedAt).getTime() <= 7 * 86_400_000);
    const review = {
      inboxCount: state.tasks.filter((task) => task.status === "inbox").length,
      waitingCount: state.tasks.filter((task) => task.status === "waiting").length,
      activeProjectCount: activeProjectIds.length,
      projectsWithoutNextAction,
      completedLast7Days: completedLast7Days.length,
      suggestedFocus: suggestions(state),
    };
    return resultText(`Review: ${review.inboxCount} inbox, ${review.projectsWithoutNextAction.length} active projects without a next action, ${review.waitingCount} waiting, and ${review.completedLast7Days} completed this week.`, review);
  }

  if (!auth.scopes.includes("manage:write")) return resultText("This connection has read-only access.", { error: "insufficient_scope" }, true);
  let next: ManageMeState;
  if (name === "manage_capture_task") {
    next = await applyCommandToGitHub(env, command("capture_task", args, {
      title: args.title,
      notes: args.notes,
      areaId: args.area_id,
      projectId: args.project_id,
      importance: args.importance,
      energy: args.energy,
      estimateMinutes: args.estimate_minutes,
    }));
    const captured = next.tasks.find((task) => task.title === String(args.title));
    return resultText(`Captured in Inbox: ${String(args.title)}`, { task: captured, revision: next.revision });
  }
  if (name === "manage_complete_task") {
    next = await applyCommandToGitHub(env, command("complete_task", args, { id: args.task_id }));
    const completed = next.tasks.find((task) => task.id === args.task_id);
    return resultText(`Completed: ${completed?.title || String(args.task_id)}`, { task: completed, revision: next.revision });
  }
  if (name === "manage_reschedule_task") {
    next = await applyCommandToGitHub(env, command("update_task", args, { id: args.task_id, status: "scheduled", scheduledFor: args.scheduled_for }));
    const scheduled = next.tasks.find((task) => task.id === args.task_id);
    return resultText(`Scheduled ${scheduled?.title || String(args.task_id)} for ${String(args.scheduled_for)}.`, { task: scheduled, revision: next.revision });
  }
  if (name === "manage_select_focus") {
    next = await applyCommandToGitHub(env, command("select_focus", args, { date: localDate(), taskIds: args.task_ids, reason: args.reason }));
    const focus = next.dailyFocus.find((item) => item.date === localDate());
    return resultText(`Today's focus now has ${focus?.taskIds.length || 0} item${focus?.taskIds.length === 1 ? "" : "s"}.`, { focus, revision: next.revision });
  }
  if (name === "manage_create_project") {
    next = await applyCommandToGitHub(env, command("create_project", args, { areaId: args.area_id, title: args.title, desiredOutcome: args.desired_outcome, dueDate: args.due_date }));
    const created = next.projects.find((project) => project.title === String(args.title));
    return resultText(`Created project: ${String(args.title)}`, { project: created, revision: next.revision });
  }
  throw new Error(`Unknown tool: ${name}`);
}

export async function handleMcp(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  if (request.method === "GET") return new Response("This stateless MCP server does not open an SSE stream.", { status: 405, headers: { Allow: "POST" } });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

  let rpc: JsonRpcRequest;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    rpc = parsed as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Invalid JSON-RPC request", 400);
  }
  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") return jsonRpcError(rpc.id, -32600, "Invalid JSON-RPC request", 400);
  if (rpc.id === undefined) return new Response(null, { status: 202 });

  if (rpc.method === "initialize") {
    const requested = String(rpc.params?.protocolVersion || "");
    const supported = ["2025-11-25", "2025-06-18", "2025-03-26"];
    const protocolVersion = supported.includes(requested) ? requested : supported[0];
    return jsonRpcResult(rpc.id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "ManageMe", version: "0.1.0" }, instructions: SERVER_INSTRUCTIONS });
  }
  if (rpc.method === "ping") return jsonRpcResult(rpc.id, {});
  if (rpc.method === "tools/list") return jsonRpcResult(rpc.id, { tools: toolsFor(auth.scopes) });
  if (rpc.method === "tools/call") {
    const name = String(rpc.params?.name || "");
    const args = rpc.params?.arguments && typeof rpc.params.arguments === "object" ? rpc.params.arguments as Record<string, unknown> : {};
    if (!toolsFor(auth.scopes).some((entry) => entry.name === name)) return jsonRpcError(rpc.id, -32601, "Tool not found");
    try {
      return jsonRpcResult(rpc.id, await callTool(name, args, env, auth));
    } catch (error) {
      return jsonRpcResult(rpc.id, resultText(error instanceof Error ? error.message : "ManageMe tool failed.", { error: "tool_error" }, true));
    }
  }
  return jsonRpcError(rpc.id, -32601, "Method not found");
}
