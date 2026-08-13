import { healthTodaySummary, weightTrend } from "./health";
import { applyHealthCommandToGitHub, readHealthLedger } from "./health-store";
import type { HealthCommand } from "./health";
import type { AuthContext, Env } from "./types";

export interface HealthToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, boolean>;
  securitySchemes: Array<{ type: "oauth2"; scopes: string[] }>;
}

const NAMES = new Set(["health_get_dashboard", "health_list_foods", "health_add_food", "health_log_food", "health_list_fasts", "health_start_fast", "health_end_fast", "health_add_weight", "health_list_weights", "health_weight_trend"]);

function tool(name: string, title: string, description: string, properties: Record<string, unknown>, required: string[], readOnly: boolean): HealthToolDefinition {
  return { name, title, description, inputSchema: { type: "object", additionalProperties: false, properties, required }, annotations: { readOnlyHint: readOnly, destructiveHint: false, idempotentHint: readOnly, openWorldHint: false }, securitySchemes: [{ type: "oauth2", scopes: readOnly ? ["manage:read"] : ["manage:read", "manage:write"] }] };
}

const dt = { type: "string", format: "date-time" };
const req = { type: "string" };

export function healthToolsFor(): HealthToolDefinition[] {
  return [
    tool("health_get_dashboard", "Health dashboard", "Read health summary.", { from: dt, to: dt }, [], true),
    tool("health_list_foods", "Saved foods", "Read saved food items.", { include_archived: { type: "boolean", default: false }, search: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, [], true),
    tool("health_add_food", "Add food", "Save a food definition.", { name: { type: "string" }, brand: { type: "string" }, package_grams: { type: "number", exclusiveMinimum: 0 }, default_serving_grams: { type: "number", exclusiveMinimum: 0 }, price_cents: { type: "integer", minimum: 1 }, currency: { type: "string", enum: ["HUF", "EUR", "TRY"] }, calories_per_100g: { type: "number", minimum: 0 }, protein_per_100g: { type: "number", minimum: 0 }, carbs_per_100g: { type: "number", minimum: 0 }, fat_per_100g: { type: "number", minimum: 0 }, request_id: req }, ["name", "calories_per_100g", "protein_per_100g", "carbs_per_100g", "fat_per_100g"], false),
    tool("health_log_food", "Log food", "Record food consumption.", { food_id: { type: "string" }, amount_grams: { type: "number", exclusiveMinimum: 0 }, consumed_at: dt, finance_entry_id: { type: "string" }, request_id: req }, ["food_id"], false),
    tool("health_list_fasts", "Fasting history", "Read fasting sessions.", { limit: { type: "integer", minimum: 1, maximum: 500, default: 100 } }, [], true),
    tool("health_start_fast", "Start fast", "Start a fasting session.", { started_at: dt, target_hours: { type: "number", exclusiveMinimum: 0, maximum: 168, default: 16 }, eating_window_hours: { type: "number", exclusiveMinimum: 0, maximum: 168, default: 8 }, request_id: req }, [], false),
    tool("health_end_fast", "End fast", "End the active fasting session.", { ended_at: dt, request_id: req }, [], false),
    tool("health_add_weight", "Add weight", "Record a weight measurement.", { kilograms: { type: "number", minimum: 1, maximum: 1000 }, measured_at: dt, request_id: req }, ["kilograms"], false),
    tool("health_list_weights", "Weight history", "Read weight measurements.", { limit: { type: "integer", minimum: 1, maximum: 1000, default: 100 } }, [], true),
    tool("health_weight_trend", "Weight trend", "Read weight trend.", { days: { type: "integer", minimum: 1, maximum: 3650, default: 30 } }, [], true),
  ];
}

export function isHealthTool(name: string): boolean { return NAMES.has(name); }

function output(message: string, structuredContent: Record<string, unknown>, isError = false): Record<string, unknown> {
  return { content: [{ type: "text", text: message }], structuredContent, ...(isError ? { isError: true } : {}) };
}

function requestId(args: Record<string, unknown>): string {
  const supplied = typeof args.request_id === "string" && /^[a-z0-9][a-z0-9_-]{2,95}$/i.test(args.request_id) ? args.request_id.toLowerCase() : undefined;
  return supplied || `health_${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 96);
}

function cmd(type: HealthCommand["type"], args: Record<string, unknown>, payload: Record<string, unknown>): HealthCommand {
  return { requestId: requestId(args), profileId: "kornel", actor: "assistant", type, payload };
}

function millis(value: unknown, label: string, fallback = Date.now()): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid.`);
  return parsed;
}

function writable(auth: AuthContext, env: Env): Record<string, unknown> | undefined {
  if (auth.scopes.includes("manage:write")) return undefined;
  const metadata = `${env.PUBLIC_ORIGIN.replace(/\/$/, "")}/.well-known/oauth-protected-resource`;
  return { ...output("Write access is required.", { error: "insufficient_scope" }, true), _meta: { "mcp/www_authenticate": [`Bearer resource_metadata="${metadata}", scope="manage:read manage:write"`] } };
}

export async function callHealthTool(name: string, args: Record<string, unknown>, env: Env, auth: AuthContext): Promise<Record<string, unknown>> {
  const readOnly = ["health_get_dashboard", "health_list_foods", "health_list_fasts", "health_list_weights", "health_weight_trend"].includes(name);
  if (!readOnly) { const denied = writable(auth, env); if (denied) return denied; }
  if (name === "health_get_dashboard") {
    const ledger = (await readHealthLedger(env)).ledger;
    const from = millis(args.from, "Range start", Date.now() - 24 * 60 * 60 * 1000);
    const to = millis(args.to, "Range end", Date.now());
    const summary = healthTodaySummary(ledger, from, to);
    return output(`${Math.round(summary.caloriesKcal)} kcal logged.`, { from, to, ...summary });
  }
  if (name === "health_list_foods") {
    const ledger = (await readHealthLedger(env)).ledger;
    const search = String(args.search || "").trim().toLowerCase();
    const limit = Math.min(500, Math.max(1, Number(args.limit) || 100));
    const foods = ledger.foods.filter((f) => args.include_archived === true || f.archivedAtMillis === undefined).filter((f) => !search || `${f.name} ${f.brand || ""}`.toLowerCase().includes(search)).slice(0, limit);
    return output(`${foods.length} saved foods.`, { foods });
  }
  if (name === "health_add_food") {
    const payload = { name: args.name, brand: args.brand, packageGrams: args.package_grams, defaultServingGrams: args.default_serving_grams, priceCents: args.price_cents, currencyCode: args.currency, nutritionPer100g: { caloriesKcal: args.calories_per_100g, proteinGrams: args.protein_per_100g, carbsGrams: args.carbs_per_100g, fatGrams: args.fat_per_100g } };
    const result = await applyHealthCommandToGitHub(env, cmd("add_food", args, payload));
    return output("Food saved.", { food: result.ledger.foods.find((f) => f.id === result.entityId), revision: result.ledger.revision });
  }
  if (name === "health_log_food") {
    const payload = { foodId: args.food_id, ...(args.amount_grams !== undefined ? { amountGrams: args.amount_grams } : {}), ...(args.consumed_at !== undefined ? { consumedAtMillis: millis(args.consumed_at, "Consumption time") } : {}), ...(args.finance_entry_id !== undefined ? { financeEntryId: args.finance_entry_id } : {}) };
    const result = await applyHealthCommandToGitHub(env, cmd("log_food", args, payload));
    const consumption = result.ledger.consumptions.find((c) => c.id === result.entityId);
    const activeFast = result.ledger.fastingSessions.find((f) => f.endedAtMillis === undefined);
    const fastMayBeBroken = Boolean(activeFast && consumption && consumption.consumedAtMillis >= activeFast.startedAtMillis);
    return output("Food logged.", { consumption, fastMayBeBroken, activeFast, revision: result.ledger.revision });
  }
  if (name === "health_list_fasts") {
    const ledger = (await readHealthLedger(env)).ledger;
    const limit = Math.min(500, Math.max(1, Number(args.limit) || 100));
    const sessions = [...ledger.fastingSessions].sort((a, b) => b.startedAtMillis - a.startedAtMillis).slice(0, limit).map((f) => ({ ...f, durationMinutes: Math.round(((f.endedAtMillis ?? Date.now()) - f.startedAtMillis) / 60000), targetReached: ((f.endedAtMillis ?? Date.now()) - f.startedAtMillis) >= f.targetMinutes * 60000 }));
    return output(`${sessions.length} fasting sessions.`, { sessions });
  }
  if (name === "health_start_fast") {
    const result = await applyHealthCommandToGitHub(env, cmd("start_fast", args, { ...(args.started_at !== undefined ? { startedAtMillis: millis(args.started_at, "Fast start") } : {}), targetMinutes: Math.round((Number(args.target_hours) || 16) * 60), eatingWindowMinutes: Math.round((Number(args.eating_window_hours) || 8) * 60), protocolName: "16:8" }));
    return output("Fast started.", { session: result.ledger.fastingSessions.find((f) => f.id === result.entityId), revision: result.ledger.revision });
  }
  if (name === "health_end_fast") {
    const result = await applyHealthCommandToGitHub(env, cmd("end_fast", args, { ...(args.ended_at !== undefined ? { endedAtMillis: millis(args.ended_at, "Fast end") } : {}) }));
    return output("Fast ended.", { session: result.ledger.fastingSessions.find((f) => f.id === result.entityId), revision: result.ledger.revision });
  }
  if (name === "health_add_weight") {
    const result = await applyHealthCommandToGitHub(env, cmd("add_weight", args, { kilograms: args.kilograms, ...(args.measured_at !== undefined ? { measuredAtMillis: millis(args.measured_at, "Weight time") } : {}) }));
    return output("Weight saved.", { weight: result.ledger.weights.find((w) => w.id === result.entityId), revision: result.ledger.revision });
  }
  if (name === "health_list_weights") {
    const ledger = (await readHealthLedger(env)).ledger;
    const limit = Math.min(1000, Math.max(1, Number(args.limit) || 100));
    const weights = [...ledger.weights].sort((a, b) => b.measuredAtMillis - a.measuredAtMillis).slice(0, limit);
    return output(`${weights.length} weight measurements.`, { weights });
  }
  if (name === "health_weight_trend") {
    const ledger = (await readHealthLedger(env)).ledger;
    const days = Math.min(3650, Math.max(1, Math.round(Number(args.days) || 30)));
    return output("Weight trend ready.", { days, ...weightTrend(ledger, days) });
  }
  throw new Error("Unknown health tool.");
}
