import { callFinanceTool, financeToolsFor, isFinanceTool } from "./finance-mcp";
import { handleMcp, toolsFor } from "./mcp";
import type { AuthContext, Env } from "./types";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

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
