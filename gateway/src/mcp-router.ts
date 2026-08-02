import { callFinanceTool, financeToolsFor, isFinanceTool } from "./finance-mcp";
import { handleMcp, toolsFor } from "./mcp";
import type { AuthContext, Env } from "./types";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const SERVER_INSTRUCTIONS = "ManageMe is Kornel's private personal focus and finance system. Use the task/project tools for work and life management. Use finance read tools when Kornel asks about synchronized expenses, income, categories, or spending summaries, and keep HUF, EUR, and TRY separate unless an explicit exchange rate is available. Use finance write tools only for changes Kornel clearly requests. Never invent transactions, amounts, currencies, dates, deadlines, completion, or conversions.";

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function handleMcpWithFinance(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  if (request.method !== "POST") return handleMcp(request, env, auth);

  let rpc: JsonRpcRequest;
  try {
    const parsed: unknown = await request.clone().json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return handleMcp(request, env, auth);
    rpc = parsed as JsonRpcRequest;
  } catch {
    return handleMcp(request, env, auth);
  }

  if (rpc.id === undefined) return handleMcp(request, env, auth);
  if (rpc.method === "initialize") {
    const requested = String(rpc.params?.protocolVersion || "");
    const supported = ["2025-11-25", "2025-06-18", "2025-03-26"];
    const protocolVersion = supported.includes(requested) ? requested : supported[0];
    return jsonRpcResult(rpc.id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ManageMe", version: "0.2.0" },
      instructions: SERVER_INSTRUCTIONS,
    });
  }
  if (rpc.method === "tools/list") {
    return jsonRpcResult(rpc.id, { tools: [...toolsFor(auth.scopes), ...financeToolsFor()] });
  }
  if (rpc.method === "tools/call") {
    const name = String(rpc.params?.name || "");
    if (!isFinanceTool(name)) return handleMcp(request, env, auth);
    const args = rpc.params?.arguments && typeof rpc.params.arguments === "object" ? rpc.params.arguments as Record<string, unknown> : {};
    try {
      return jsonRpcResult(rpc.id, await callFinanceTool(name, args, env, auth));
    } catch (error) {
      const message = error instanceof Error ? error.message : "ManageMe finance tool failed.";
      return jsonRpcResult(rpc.id, { content: [{ type: "text", text: message }], structuredContent: { error: "tool_error" }, isError: true });
    }
  }
  return handleMcp(request, env, auth);
}
