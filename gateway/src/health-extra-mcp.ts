import { normalizeHealthCurrency } from "./health";
import { applyHealthCommandToGitHub, readHealthLedger } from "./health-store";
import type { HealthCommand, HealthMetricType, Nutrition } from "./health";
import type { HealthToolDefinition } from "./health-mcp";
import type { AuthContext, Env } from "./types";

const TOOL_NAMES = new Set([
  "health_update_food",
  "health_archive_food",
  "health_restore_food",
  "health_update_consumption",
  "health_delete_consumption",
  "health_update_fast",
  "health_delete_fast",
  "health_update_weight",
  "health_delete_weight",
  "health_list_metrics",
]);

function tool(
  name: string,
  title: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  readOnly: boolean,
  destructive = false,
): HealthToolDefinition {
  return {
    name,
    title,
    description,
    inputSchema: { type: "object", additionalProperties: false, properties, required },
    annotations: { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: readOnly, openWorldHint: false },
    securitySchemes: [{ type: "oauth2", scopes: readOnly ? ["manage:read"] : ["manage:read", "manage:write"] }],
  };
}

const dateTime = { type: "string", format: "date-time", description: "ISO date-time." };
const requestIdProperty = { type: "string", description: "Optional stable idempotency key for retries." };

export function extraHealthToolsFor(): HealthToolDefinition[] {
  return [
    tool("health_update_food", "Correct saved food", "Update a saved food for future use. Existing consumption events keep their historical nutrition snapshot.", {
      food_id: { type: "string" },
      name: { type: "string", minLength: 1 },
      brand: { type: "string" },
      variant: { type: "string" },
      package_grams: { type: "number", exclusiveMinimum: 0 },
      default_serving_grams: { type: "number", exclusiveMinimum: 0 },
      price_cents: { type: "integer", minimum: 1 },
      currency: { type: "string", enum: ["HUF", "EUR", "TRY", "TL"] },
      calories_per_100g: { type: "number", minimum: 0 },
      protein_per_100g: { type: "number", minimum: 0 },
      carbs_per_100g: { type: "number", minimum: 0 },
      fat_per_100g: { type: "number", minimum: 0 },
      fiber_per_100g: { type: "number", minimum: 0 },
      sugar_per_100g: { type: "number", minimum: 0 },
      request_id: requestIdProperty,
    }, ["food_id"], false),
    tool("health_archive_food", "Archive saved food", "Hide a saved food from normal quick-add while preserving all historical consumption.", { food_id: { type: "string" }, request_id: requestIdProperty }, ["food_id"], false),
    tool("health_restore_food", "Restore saved food", "Restore a previously archived food to the active food library.", { food_id: { type: "string" }, request_id: requestIdProperty }, ["food_id"], false),
    tool("health_update_consumption", "Correct food consumption", "Correct the amount, time, note, or saved-food reference of an existing consumption event.", {
      consumption_id: { type: "string" },
      food_id: { type: "string" },
      amount_grams: { type: "number", exclusiveMinimum: 0 },
      consumed_at: dateTime,
      finance_entry_id: { type: "string" },
      note: { type: "string" },
      request_id: requestIdProperty,
    }, ["consumption_id"], false),
    tool("health_delete_consumption", "Delete food consumption", "Delete an incorrectly logged consumption event. This does not delete a linked Finance transaction.", { consumption_id: { type: "string" }, request_id: requestIdProperty }, ["consumption_id"], false, true),
    tool("health_update_fast", "Correct fasting session", "Correct fasting start/end time, protocol, target, eating window, or note without creating a duplicate session.", {
      fast_id: { type: "string" },
      started_at: dateTime,
      ended_at: dateTime,
      protocol_name: { type: "string" },
      target_hours: { type: "number", exclusiveMinimum: 0, maximum: 168 },
      eating_window_hours: { type: "number", exclusiveMinimum: 0, maximum: 168 },
      note: { type: "string" },
      request_id: requestIdProperty,
    }, ["fast_id"], false),
    tool("health_delete_fast", "Delete fasting session", "Delete an incorrectly created fasting session.", { fast_id: { type: "string" }, request_id: requestIdProperty }, ["fast_id"], false, true),
    tool("health_update_weight", "Correct body weight", "Correct a ManageMe-native body-weight measurement.", {
      weight_id: { type: "string" },
      kilograms: { type: "number", minimum: 1, maximum: 1000 },
      measured_at: dateTime,
      note: { type: "string" },
      request_id: requestIdProperty,
    }, ["weight_id"], false),
    tool("health_delete_weight", "Delete body weight", "Delete an incorrect weight record. Imported external records should normally be corrected in their source app instead.", { weight_id: { type: "string" }, request_id: requestIdProperty }, ["weight_id"], false, true),
    tool("health_list_metrics", "Read connected health metrics", "Read synchronized external health metrics such as steps, calories burned, resting heart rate, sleep, and exercise with source provenance.", {
      type: { type: "string", enum: ["steps", "active_calories", "total_calories", "heart_rate", "resting_heart_rate", "sleep", "exercise"] },
      from: dateTime,
      to: dateTime,
      limit: { type: "integer", minimum: 1, maximum: 1000, default: 200 },
    }, [], true),
  ];
}

export function isExtraHealthTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

function output(message: string, structuredContent: Record<string, unknown>, isError = false): Record<string, unknown> {
  return { content: [{ type: "text", text: message }], structuredContent, ...(isError ? { isError: true } : {}) };
}

function writeChallenge(env: Env): Record<string, unknown> {
  const metadata = `${env.PUBLIC_ORIGIN.replace(/\/$/, "")}/.well-known/oauth-protected-resource`;
  return {
    ...output("Reconnect ManageMe with write access to change health data.", { error: "insufficient_scope" }, true),
    _meta: { "mcp/www_authenticate": [`Bearer resource_metadata="${metadata}", scope="manage:read manage:write", error="insufficient_scope"`] },
  };
}

function requestId(args: Record<string, unknown>): string {
  const supplied = typeof args.request_id === "string" && /^[a-z0-9][a-z0-9_-]{2,95}$/i.test(args.request_id) ? args.request_id.toLowerCase() : undefined;
  return supplied || `health_${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 96);
}

function command(type: HealthCommand["type"], args: Record<string, unknown>, payload: Record<string, unknown>): HealthCommand {
  return { requestId: requestId(args), profileId: "kornel", actor: "assistant", type, payload };
}

function millis(value: unknown, label: string): number {
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid ISO date-time.`);
  return parsed;
}

function optionalMillis(value: unknown, label: string): number | undefined {
  return value === undefined || value === null || value === "" ? undefined : millis(value, label);
}

function numberIf(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Numeric health value is invalid.");
  return parsed;
}

function updatedNutrition(current: Nutrition, args: Record<string, unknown>): Nutrition | undefined {
  const mapping: Array<[string, keyof Nutrition]> = [
    ["calories_per_100g", "caloriesKcal"],
    ["protein_per_100g", "proteinGrams"],
    ["carbs_per_100g", "carbsGrams"],
    ["fat_per_100g", "fatGrams"],
    ["fiber_per_100g", "fiberGrams"],
    ["sugar_per_100g", "sugarGrams"],
  ];
  if (!mapping.some(([from]) => args[from] !== undefined)) return undefined;
  const next: Nutrition = { ...current };
  for (const [from, to] of mapping) {
    if (args[from] !== undefined) (next[to] as number) = Number(args[from]);
  }
  return next;
}

export async function callExtraHealthTool(name: string, args: Record<string, unknown>, env: Env, auth: AuthContext): Promise<Record<string, unknown>> {
  if (name === "health_list_metrics") {
    const ledger = (await readHealthLedger(env)).ledger;
    const type = args.type ? String(args.type) as HealthMetricType : undefined;
    const from = optionalMillis(args.from, "Metric range start");
    const to = optionalMillis(args.to, "Metric range end");
    const limit = Math.min(1000, Math.max(1, Number(args.limit) || 200));
    const metrics = [...ledger.metrics]
      .filter((item) => !type || item.type === type)
      .filter((item) => from === undefined || item.startAtMillis >= from)
      .filter((item) => to === undefined || item.startAtMillis < to)
      .sort((a, b) => b.startAtMillis - a.startAtMillis)
      .slice(0, limit);
    return output(`${metrics.length} connected health metric record${metrics.length === 1 ? "" : "s"}.`, { metrics });
  }

  if (!auth.scopes.includes("manage:write")) return writeChallenge(env);

  if (name === "health_update_food") {
    const ledger = (await readHealthLedger(env)).ledger;
    const foodId = String(args.food_id || "").trim().toLowerCase();
    const current = ledger.foods.find((item) => item.id === foodId);
    if (!current) throw new Error("Saved food was not found.");
    const payload: Record<string, unknown> = { foodId };
    const mappings: Array<[string, string]> = [["name", "name"], ["brand", "brand"], ["variant", "variant"], ["package_grams", "packageGrams"], ["default_serving_grams", "defaultServingGrams"], ["price_cents", "priceCents"]];
    for (const [from, to] of mappings) if (args[from] !== undefined) payload[to] = args[from];
    if (args.currency !== undefined) payload.currencyCode = normalizeHealthCurrency(args.currency);
    const nutrition = updatedNutrition(current.nutritionPer100g, args);
    if (nutrition) payload.nutritionPer100g = nutrition;
    const result = await applyHealthCommandToGitHub(env, command("update_food", args, payload));
    return output("Saved food updated. Past consumption nutrition was not rewritten.", { food: result.ledger.foods.find((item) => item.id === result.entityId), revision: result.ledger.revision });
  }

  if (name === "health_archive_food" || name === "health_restore_food") {
    const type = name === "health_archive_food" ? "archive_food" : "restore_food";
    const result = await applyHealthCommandToGitHub(env, command(type, args, { foodId: args.food_id }));
    return output(name === "health_archive_food" ? "Saved food archived." : "Saved food restored.", { foodId: result.entityId, revision: result.ledger.revision });
  }

  if (name === "health_update_consumption") {
    const payload: Record<string, unknown> = { consumptionId: args.consumption_id };
    if (args.food_id !== undefined) payload.foodId = args.food_id;
    if (args.amount_grams !== undefined) payload.amountGrams = args.amount_grams;
    if (args.consumed_at !== undefined) payload.consumedAtMillis = millis(args.consumed_at, "Consumption time");
    if (args.finance_entry_id !== undefined) payload.financeEntryId = args.finance_entry_id;
    if (args.note !== undefined) payload.note = args.note;
    const result = await applyHealthCommandToGitHub(env, command("update_consumption", args, payload));
    return output("Food consumption corrected.", { consumption: result.ledger.consumptions.find((item) => item.id === result.entityId), revision: result.ledger.revision });
  }

  if (name === "health_delete_consumption") {
    const result = await applyHealthCommandToGitHub(env, command("delete_consumption", args, { consumptionId: args.consumption_id }));
    return output("Food consumption deleted. A linked Finance entry, if any, was left untouched.", { consumptionId: result.entityId, revision: result.ledger.revision });
  }

  if (name === "health_update_fast") {
    const payload: Record<string, unknown> = { fastId: args.fast_id };
    if (args.started_at !== undefined) payload.startedAtMillis = millis(args.started_at, "Fast start");
    if (args.ended_at !== undefined) payload.endedAtMillis = millis(args.ended_at, "Fast end");
    if (args.protocol_name !== undefined) payload.protocolName = args.protocol_name;
    const target = numberIf(args.target_hours);
    if (target !== undefined) payload.targetMinutes = Math.round(target * 60);
    const eating = numberIf(args.eating_window_hours);
    if (eating !== undefined) payload.eatingWindowMinutes = Math.round(eating * 60);
    if (args.note !== undefined) payload.note = args.note;
    const result = await applyHealthCommandToGitHub(env, command("update_fast", args, payload));
    return output("Fasting session corrected.", { session: result.ledger.fastingSessions.find((item) => item.id === result.entityId), revision: result.ledger.revision });
  }

  if (name === "health_delete_fast") {
    const result = await applyHealthCommandToGitHub(env, command("delete_fast", args, { fastId: args.fast_id }));
    return output("Fasting session deleted.", { fastId: result.entityId, revision: result.ledger.revision });
  }

  if (name === "health_update_weight") {
    const payload: Record<string, unknown> = { weightId: args.weight_id };
    if (args.kilograms !== undefined) payload.kilograms = args.kilograms;
    if (args.measured_at !== undefined) payload.measuredAtMillis = millis(args.measured_at, "Weight measurement time");
    if (args.note !== undefined) payload.note = args.note;
    const result = await applyHealthCommandToGitHub(env, command("update_weight", args, payload));
    return output("Weight measurement corrected.", { weight: result.ledger.weights.find((item) => item.id === result.entityId), revision: result.ledger.revision });
  }

  if (name === "health_delete_weight") {
    const result = await applyHealthCommandToGitHub(env, command("delete_weight", args, { weightId: args.weight_id }));
    return output("Weight measurement deleted.", { weightId: result.entityId, revision: result.ledger.revision });
  }

  throw new Error("Unknown ManageMe health correction tool.");
}
