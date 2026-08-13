export type HealthActor = "kornel" | "assistant" | "web" | "android" | "system";
export type HealthCurrency = "HUF" | "EUR" | "TRY";
export type HealthMetricType = "steps" | "active_calories" | "total_calories" | "heart_rate" | "resting_heart_rate" | "sleep" | "exercise";

export interface Nutrition {
  caloriesKcal: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  sugarGrams?: number;
  saturatedFatGrams?: number;
  sodiumMilligrams?: number;
}

export interface HealthSource {
  kind: "manageme" | "health_connect";
  app?: string;
  packageName?: string;
  externalId?: string;
}

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  variant?: string;
  packageGrams?: number;
  defaultServingGrams?: number;
  priceCents?: number;
  currencyCode?: HealthCurrency;
  nutritionPer100g: Nutrition;
  createdAtMillis: number;
  updatedAtMillis: number;
  archivedAtMillis?: number;
  actor: HealthActor;
}

export interface FoodConsumption {
  id: string;
  foodId?: string;
  foodName: string;
  amountGrams: number;
  nutrition: Nutrition;
  consumedAtMillis: number;
  financeEntryId?: string;
  note?: string;
  createdAtMillis: number;
  updatedAtMillis: number;
  actor: HealthActor;
  source: HealthSource;
}

export interface FastingSession {
  id: string;
  protocolName: string;
  targetMinutes: number;
  eatingWindowMinutes?: number;
  startedAtMillis: number;
  endedAtMillis?: number;
  note?: string;
  createdAtMillis: number;
  updatedAtMillis: number;
  actor: HealthActor;
}

export interface WeightEntry {
  id: string;
  kilograms: number;
  measuredAtMillis: number;
  note?: string;
  createdAtMillis: number;
  updatedAtMillis: number;
  actor: HealthActor;
  source: HealthSource;
}

export interface HealthMetric {
  id: string;
  type: HealthMetricType;
  value?: number;
  unit?: string;
  startAtMillis: number;
  endAtMillis?: number;
  title?: string;
  createdAtMillis: number;
  updatedAtMillis: number;
  source: HealthSource;
}

export interface HealthLedger {
  schemaVersion: 1;
  revision: number;
  profileId: "kornel";
  foods: FoodItem[];
  consumptions: FoodConsumption[];
  fastingSessions: FastingSession[];
  weights: WeightEntry[];
  metrics: HealthMetric[];
  appliedRequestIds: string[];
  updatedAt: string;
}

export interface HealthCommand {
  requestId: string;
  profileId: "kornel";
  actor: Exclude<HealthActor, "system">;
  type:
    | "add_food"
    | "update_food"
    | "archive_food"
    | "restore_food"
    | "log_food"
    | "update_consumption"
    | "delete_consumption"
    | "start_fast"
    | "end_fast"
    | "update_fast"
    | "delete_fast"
    | "add_weight"
    | "update_weight"
    | "delete_weight";
  payload: Record<string, unknown>;
}

export interface HealthConnectSnapshot {
  requestId: string;
  profileId: "kornel";
  deviceId?: string;
  capturedAtMillis?: number;
  weights?: unknown[];
  metrics?: unknown[];
}

export interface HealthTodaySummary {
  caloriesKcal: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  consumptions: FoodConsumption[];
  activeFast?: FastingSession;
  latestWeight?: WeightEntry;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,95}$/i;
const MAX_SAFE_MILLIS = 8_640_000_000_000_000;
const MAX_REQUEST_IDS = 500;

function generatedId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 96).toLowerCase();
}

function cleanId(value: unknown, fallbackPrefix: string): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return generatedId(fallbackPrefix);
  if (!ID_PATTERN.test(candidate)) throw new Error("Health id contains unsupported characters.");
  return candidate.slice(0, 96).toLowerCase();
}

function requiredId(value: unknown, label = "Health id"): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate || !ID_PATTERN.test(candidate)) throw new Error(`${label} is invalid.`);
  return candidate.slice(0, 96).toLowerCase();
}

function optionalId(value: unknown): string | undefined {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return undefined;
  if (!ID_PATTERN.test(candidate)) throw new Error("Health id contains unsupported characters.");
  return candidate.slice(0, 96).toLowerCase();
}

function cleanText(value: unknown, label: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  return text.slice(0, max);
}

function optionalText(value: unknown, max: number): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, max) : undefined;
}

function finiteNumber(value: unknown, label: string, minimum = 0, maximum = 1_000_000): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${label} is invalid.`);
  return Math.round(parsed * 1000) / 1000;
}

function optionalNumber(value: unknown, label: string, minimum = 0, maximum = 1_000_000): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return finiteNumber(value, label, minimum, maximum);
}

function positiveInt(value: unknown, label: string, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) throw new Error(`${label} is invalid.`);
  return parsed;
}

function timestamp(value: unknown, label: string, fallback = Date.now()): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_SAFE_MILLIS) throw new Error(`${label} is invalid.`);
  return parsed;
}

function optionalTimestamp(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return timestamp(value, label);
}

function normalizeActor(value: unknown, fallback: HealthActor): HealthActor {
  const actor = String(value || fallback);
  return ["kornel", "assistant", "web", "android", "system"].includes(actor) ? actor as HealthActor : fallback;
}

export function normalizeHealthCurrency(value: unknown): HealthCurrency {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "TL") return "TRY";
  if (normalized === "HUF" || normalized === "EUR" || normalized === "TRY") return normalized;
  throw new Error("Currency must be HUF, EUR, or TRY/TL.");
}

function optionalCurrency(value: unknown): HealthCurrency | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return normalizeHealthCurrency(value);
}

function nutrition(value: unknown, label = "Nutrition"): Nutrition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is required.`);
  const input = value as Record<string, unknown>;
  const result: Nutrition = {
    caloriesKcal: finiteNumber(input.caloriesKcal, `${label} calories`),
    proteinGrams: finiteNumber(input.proteinGrams, `${label} protein`),
    carbsGrams: finiteNumber(input.carbsGrams, `${label} carbohydrates`),
    fatGrams: finiteNumber(input.fatGrams, `${label} fat`),
  };
  const optional: Array<[keyof Nutrition, string]> = [
    ["fiberGrams", "fiber"],
    ["sugarGrams", "sugar"],
    ["saturatedFatGrams", "saturated fat"],
    ["sodiumMilligrams", "sodium"],
  ];
  for (const [key, fieldLabel] of optional) {
    const parsed = optionalNumber(input[key], `${label} ${fieldLabel}`);
    if (parsed !== undefined) result[key] = parsed;
  }
  return result;
}

function scaledNutrition(per100g: Nutrition, grams: number): Nutrition {
  const factor = grams / 100;
  const scale = (value: number | undefined): number | undefined => value === undefined ? undefined : Math.round(value * factor * 1000) / 1000;
  return {
    caloriesKcal: scale(per100g.caloriesKcal) || 0,
    proteinGrams: scale(per100g.proteinGrams) || 0,
    carbsGrams: scale(per100g.carbsGrams) || 0,
    fatGrams: scale(per100g.fatGrams) || 0,
    ...(per100g.fiberGrams !== undefined ? { fiberGrams: scale(per100g.fiberGrams) } : {}),
    ...(per100g.sugarGrams !== undefined ? { sugarGrams: scale(per100g.sugarGrams) } : {}),
    ...(per100g.saturatedFatGrams !== undefined ? { saturatedFatGrams: scale(per100g.saturatedFatGrams) } : {}),
    ...(per100g.sodiumMilligrams !== undefined ? { sodiumMilligrams: scale(per100g.sodiumMilligrams) } : {}),
  };
}

function source(value: unknown, fallback: HealthSource = { kind: "manageme" }): HealthSource {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const input = value as Record<string, unknown>;
  const kind = input.kind === "health_connect" ? "health_connect" : "manageme";
  return {
    kind,
    ...(optionalText(input.app, 120) ? { app: optionalText(input.app, 120) } : {}),
    ...(optionalText(input.packageName, 240) ? { packageName: optionalText(input.packageName, 240) } : {}),
    ...(optionalText(input.externalId, 240) ? { externalId: optionalText(input.externalId, 240) } : {}),
  };
}

export function sanitizeFoodItem(value: unknown, fallbackActor: HealthActor = "android"): FoodItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Food item must be an object.");
  const input = value as Record<string, unknown>;
  const createdAtMillis = timestamp(input.createdAtMillis, "Food creation date");
  const updatedAtMillis = timestamp(input.updatedAtMillis, "Food update date", createdAtMillis);
  const packageGrams = optionalNumber(input.packageGrams, "Package grams", 0.001, 1_000_000);
  const defaultServingGrams = optionalNumber(input.defaultServingGrams, "Serving grams", 0.001, 1_000_000);
  const priceCents = input.priceCents === undefined || input.priceCents === null || input.priceCents === "" ? undefined : positiveInt(input.priceCents, "Food price");
  const currencyCode = optionalCurrency(input.currencyCode);
  if ((priceCents === undefined) !== (currencyCode === undefined)) throw new Error("Food price and currency must be supplied together.");
  return {
    id: cleanId(input.id, "food"),
    name: cleanText(input.name, "Food name", 180),
    ...(optionalText(input.brand, 120) ? { brand: optionalText(input.brand, 120) } : {}),
    ...(optionalText(input.variant, 120) ? { variant: optionalText(input.variant, 120) } : {}),
    ...(packageGrams !== undefined ? { packageGrams } : {}),
    ...(defaultServingGrams !== undefined ? { defaultServingGrams } : {}),
    ...(priceCents !== undefined && currencyCode ? { priceCents, currencyCode } : {}),
    nutritionPer100g: nutrition(input.nutritionPer100g, "Nutrition per 100 g"),
    createdAtMillis,
    updatedAtMillis: Math.max(createdAtMillis, updatedAtMillis),
    ...(optionalTimestamp(input.archivedAtMillis, "Food archive date") !== undefined ? { archivedAtMillis: optionalTimestamp(input.archivedAtMillis, "Food archive date") } : {}),
    actor: normalizeActor(input.actor, fallbackActor),
  };
}

export function sanitizeFoodConsumption(value: unknown, fallbackActor: HealthActor = "android"): FoodConsumption {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Food consumption must be an object.");
  const input = value as Record<string, unknown>;
  const consumedAtMillis = timestamp(input.consumedAtMillis, "Consumption date");
  const createdAtMillis = timestamp(input.createdAtMillis, "Consumption creation date", consumedAtMillis);
  return {
    id: cleanId(input.id, "meal"),
    ...(optionalId(input.foodId) ? { foodId: optionalId(input.foodId) } : {}),
    foodName: cleanText(input.foodName, "Food name", 240),
    amountGrams: finiteNumber(input.amountGrams, "Consumed grams", 0.001, 1_000_000),
    nutrition: nutrition(input.nutrition),
    consumedAtMillis,
    ...(optionalId(input.financeEntryId) ? { financeEntryId: optionalId(input.financeEntryId) } : {}),
    ...(optionalText(input.note, 500) ? { note: optionalText(input.note, 500) } : {}),
    createdAtMillis,
    updatedAtMillis: Math.max(createdAtMillis, timestamp(input.updatedAtMillis, "Consumption update date", createdAtMillis)),
    actor: normalizeActor(input.actor, fallbackActor),
    source: source(input.source),
  };
}

export function sanitizeFastingSession(value: unknown, fallbackActor: HealthActor = "android"): FastingSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Fasting session must be an object.");
  const input = value as Record<string, unknown>;
  const startedAtMillis = timestamp(input.startedAtMillis, "Fast start");
  const endedAtMillis = optionalTimestamp(input.endedAtMillis, "Fast end");
  if (endedAtMillis !== undefined && endedAtMillis < startedAtMillis) throw new Error("Fast end cannot be before fast start.");
  const createdAtMillis = timestamp(input.createdAtMillis, "Fast creation date", startedAtMillis);
  return {
    id: cleanId(input.id, "fast"),
    protocolName: optionalText(input.protocolName, 80) || "16:8",
    targetMinutes: positiveInt(input.targetMinutes ?? 960, "Fasting target", 7 * 24 * 60),
    ...(input.eatingWindowMinutes !== undefined ? { eatingWindowMinutes: positiveInt(input.eatingWindowMinutes, "Eating window", 7 * 24 * 60) } : {}),
    startedAtMillis,
    ...(endedAtMillis !== undefined ? { endedAtMillis } : {}),
    ...(optionalText(input.note, 500) ? { note: optionalText(input.note, 500) } : {}),
    createdAtMillis,
    updatedAtMillis: Math.max(createdAtMillis, timestamp(input.updatedAtMillis, "Fast update date", createdAtMillis)),
    actor: normalizeActor(input.actor, fallbackActor),
  };
}

export function sanitizeWeightEntry(value: unknown, fallbackActor: HealthActor = "android"): WeightEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Weight entry must be an object.");
  const input = value as Record<string, unknown>;
  const measuredAtMillis = timestamp(input.measuredAtMillis, "Weight measurement date");
  const createdAtMillis = timestamp(input.createdAtMillis, "Weight creation date", measuredAtMillis);
  return {
    id: cleanId(input.id, "weight"),
    kilograms: finiteNumber(input.kilograms, "Weight", 1, 1000),
    measuredAtMillis,
    ...(optionalText(input.note, 500) ? { note: optionalText(input.note, 500) } : {}),
    createdAtMillis,
    updatedAtMillis: Math.max(createdAtMillis, timestamp(input.updatedAtMillis, "Weight update date", createdAtMillis)),
    actor: normalizeActor(input.actor, fallbackActor),
    source: source(input.source),
  };
}

function normalizeMetricType(value: unknown): HealthMetricType {
  const type = String(value || "").trim().toLowerCase();
  if (["steps", "active_calories", "total_calories", "heart_rate", "resting_heart_rate", "sleep", "exercise"].includes(type)) return type as HealthMetricType;
  throw new Error("Unsupported health metric type.");
}

export function sanitizeHealthMetric(value: unknown): HealthMetric {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Health metric must be an object.");
  const input = value as Record<string, unknown>;
  const startAtMillis = timestamp(input.startAtMillis, "Metric start");
  const endAtMillis = optionalTimestamp(input.endAtMillis, "Metric end");
  if (endAtMillis !== undefined && endAtMillis < startAtMillis) throw new Error("Metric end cannot be before metric start.");
  const createdAtMillis = timestamp(input.createdAtMillis, "Metric creation date", startAtMillis);
  return {
    id: cleanId(input.id, "metric"),
    type: normalizeMetricType(input.type),
    ...(input.value !== undefined ? { value: finiteNumber(input.value, "Metric value", -1_000_000, 1_000_000) } : {}),
    ...(optionalText(input.unit, 60) ? { unit: optionalText(input.unit, 60) } : {}),
    startAtMillis,
    ...(endAtMillis !== undefined ? { endAtMillis } : {}),
    ...(optionalText(input.title, 180) ? { title: optionalText(input.title, 180) } : {}),
    createdAtMillis,
    updatedAtMillis: Math.max(createdAtMillis, timestamp(input.updatedAtMillis, "Metric update date", createdAtMillis)),
    source: source(input.source, { kind: "health_connect" }),
  };
}

export function createEmptyHealthLedger(now = new Date()): HealthLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    profileId: "kornel",
    foods: [],
    consumptions: [],
    fastingSessions: [],
    weights: [],
    metrics: [],
    appliedRequestIds: [],
    updatedAt: now.toISOString(),
  };
}

export function isHealthLedger(value: unknown): value is HealthLedger {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const input = value as Record<string, unknown>;
    if (input.schemaVersion !== 1 || input.profileId !== "kornel" || !Number.isSafeInteger(input.revision)) return false;
    if (![input.foods, input.consumptions, input.fastingSessions, input.weights, input.metrics, input.appliedRequestIds].every(Array.isArray)) return false;
    (input.foods as unknown[]).forEach((item) => sanitizeFoodItem(item));
    (input.consumptions as unknown[]).forEach((item) => sanitizeFoodConsumption(item));
    (input.fastingSessions as unknown[]).forEach((item) => sanitizeFastingSession(item));
    (input.weights as unknown[]).forEach((item) => sanitizeWeightEntry(item));
    (input.metrics as unknown[]).forEach((item) => sanitizeHealthMetric(item));
    return true;
  } catch {
    return false;
  }
}

export function isHealthCommand(value: unknown): value is HealthCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const types = new Set(["add_food", "update_food", "archive_food", "restore_food", "log_food", "update_consumption", "delete_consumption", "start_fast", "end_fast", "update_fast", "delete_fast", "add_weight", "update_weight", "delete_weight"]);
  return input.profileId === "kornel" && typeof input.requestId === "string" && ID_PATTERN.test(input.requestId) && ["kornel", "assistant", "web", "android"].includes(String(input.actor)) && types.has(String(input.type)) && Boolean(input.payload && typeof input.payload === "object" && !Array.isArray(input.payload));
}

export function isHealthConnectSnapshot(value: unknown): value is HealthConnectSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return input.profileId === "kornel" && typeof input.requestId === "string" && ID_PATTERN.test(input.requestId) && (input.weights === undefined || Array.isArray(input.weights)) && (input.metrics === undefined || Array.isArray(input.metrics));
}

function cloneLedger(ledger: HealthLedger): HealthLedger {
  return structuredClone(ledger);
}

function completeCommand(ledger: HealthLedger, requestId: string, at = Date.now()): HealthLedger {
  ledger.revision += 1;
  ledger.appliedRequestIds = [...ledger.appliedRequestIds.filter((id) => id !== requestId), requestId].slice(-MAX_REQUEST_IDS);
  ledger.updatedAt = new Date(at).toISOString();
  return ledger;
}

function activeFast(ledger: HealthLedger): FastingSession | undefined {
  return [...ledger.fastingSessions].filter((item) => item.endedAtMillis === undefined).sort((a, b) => b.startedAtMillis - a.startedAtMillis)[0];
}

function foodById(ledger: HealthLedger, id: string): FoodItem {
  const food = ledger.foods.find((item) => item.id === id && item.archivedAtMillis === undefined);
  if (!food) throw new Error("Food item was not found or is archived.");
  return food;
}

function mergePatch<T extends object>(current: T, patch: Partial<T>): T {
  return { ...current, ...patch };
}

export function applyHealthCommand(ledger: HealthLedger, command: HealthCommand): { ledger: HealthLedger; changed: boolean; entityId?: string } {
  if (!isHealthCommand(command)) throw new Error("Health command is invalid.");
  if (ledger.appliedRequestIds.includes(command.requestId)) return { ledger, changed: false };
  const next = cloneLedger(ledger);
  const payload = command.payload;
  const now = Date.now();
  let entityId: string | undefined;

  if (command.type === "add_food") {
    const food = sanitizeFoodItem({ ...payload, actor: command.actor, createdAtMillis: payload.createdAtMillis ?? now, updatedAtMillis: payload.updatedAtMillis ?? now }, command.actor);
    if (next.foods.some((item) => item.id === food.id)) throw new Error("Food id already exists.");
    next.foods.push(food);
    entityId = food.id;
  } else if (command.type === "update_food") {
    const id = requiredId(payload.foodId ?? payload.id, "Food id");
    const index = next.foods.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Food item was not found.");
    const current = next.foods[index];
    const updated = sanitizeFoodItem({
      ...current,
      ...payload,
      id,
      actor: command.actor,
      createdAtMillis: current.createdAtMillis,
      updatedAtMillis: now,
      nutritionPer100g: payload.nutritionPer100g ?? current.nutritionPer100g,
    }, command.actor);
    next.foods[index] = updated;
    entityId = id;
  } else if (command.type === "archive_food" || command.type === "restore_food") {
    const id = requiredId(payload.foodId ?? payload.id, "Food id");
    const index = next.foods.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Food item was not found.");
    next.foods[index] = { ...next.foods[index], archivedAtMillis: command.type === "archive_food" ? now : undefined, updatedAtMillis: now, actor: command.actor };
    entityId = id;
  } else if (command.type === "log_food") {
    const foodId = optionalId(payload.foodId);
    const food = foodId ? foodById(next, foodId) : undefined;
    const amountGrams = finiteNumber(payload.amountGrams ?? food?.defaultServingGrams ?? food?.packageGrams, "Consumed grams", 0.001, 1_000_000);
    const snapshotNutrition = food ? scaledNutrition(food.nutritionPer100g, amountGrams) : nutrition(payload.nutrition, "Consumed nutrition");
    const consumedAtMillis = timestamp(payload.consumedAtMillis, "Consumption date", now);
    const entry = sanitizeFoodConsumption({
      id: payload.id,
      foodId,
      foodName: food?.name ?? payload.foodName,
      amountGrams,
      nutrition: snapshotNutrition,
      consumedAtMillis,
      financeEntryId: payload.financeEntryId,
      note: payload.note,
      createdAtMillis: now,
      updatedAtMillis: now,
      actor: command.actor,
      source: { kind: "manageme" },
    }, command.actor);
    next.consumptions.push(entry);
    entityId = entry.id;
  } else if (command.type === "update_consumption") {
    const id = requiredId(payload.consumptionId ?? payload.id, "Consumption id");
    const index = next.consumptions.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Food consumption was not found.");
    const current = next.consumptions[index];
    const foodId = payload.foodId !== undefined ? optionalId(payload.foodId) : current.foodId;
    const food = foodId ? foodById(next, foodId) : undefined;
    const amountGrams = payload.amountGrams !== undefined ? finiteNumber(payload.amountGrams, "Consumed grams", 0.001, 1_000_000) : current.amountGrams;
    const updatedNutrition = payload.nutrition !== undefined ? nutrition(payload.nutrition, "Consumed nutrition") : (food && (payload.foodId !== undefined || payload.amountGrams !== undefined) ? scaledNutrition(food.nutritionPer100g, amountGrams) : current.nutrition);
    next.consumptions[index] = sanitizeFoodConsumption({
      ...current,
      ...payload,
      id,
      foodId,
      foodName: food?.name ?? payload.foodName ?? current.foodName,
      amountGrams,
      nutrition: updatedNutrition,
      createdAtMillis: current.createdAtMillis,
      updatedAtMillis: now,
      actor: command.actor,
      source: current.source,
    }, command.actor);
    entityId = id;
  } else if (command.type === "delete_consumption") {
    const id = requiredId(payload.consumptionId ?? payload.id, "Consumption id");
    const before = next.consumptions.length;
    next.consumptions = next.consumptions.filter((item) => item.id !== id);
    if (next.consumptions.length === before) throw new Error("Food consumption was not found.");
    entityId = id;
  } else if (command.type === "start_fast") {
    if (activeFast(next)) throw new Error("A fast is already active. End or correct it before starting another one.");
    const startedAtMillis = timestamp(payload.startedAtMillis, "Fast start", now);
    const session = sanitizeFastingSession({
      id: payload.id,
      protocolName: payload.protocolName ?? "16:8",
      targetMinutes: payload.targetMinutes ?? 960,
      eatingWindowMinutes: payload.eatingWindowMinutes ?? 480,
      startedAtMillis,
      note: payload.note,
      createdAtMillis: now,
      updatedAtMillis: now,
      actor: command.actor,
    }, command.actor);
    next.fastingSessions.push(session);
    entityId = session.id;
  } else if (command.type === "end_fast") {
    const suppliedId = optionalId(payload.fastId ?? payload.id);
    const session = suppliedId ? next.fastingSessions.find((item) => item.id === suppliedId) : activeFast(next);
    if (!session) throw new Error("There is no active fast to end.");
    if (session.endedAtMillis !== undefined) throw new Error("That fast has already ended.");
    const endedAtMillis = timestamp(payload.endedAtMillis, "Fast end", now);
    if (endedAtMillis < session.startedAtMillis) throw new Error("Fast end cannot be before fast start.");
    const index = next.fastingSessions.findIndex((item) => item.id === session.id);
    next.fastingSessions[index] = { ...session, endedAtMillis, updatedAtMillis: now, actor: command.actor };
    entityId = session.id;
  } else if (command.type === "update_fast") {
    const id = requiredId(payload.fastId ?? payload.id, "Fast id");
    const index = next.fastingSessions.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Fasting session was not found.");
    const current = next.fastingSessions[index];
    const updated = sanitizeFastingSession({ ...current, ...payload, id, createdAtMillis: current.createdAtMillis, updatedAtMillis: now, actor: command.actor }, command.actor);
    if (updated.endedAtMillis === undefined && next.fastingSessions.some((item) => item.id !== id && item.endedAtMillis === undefined)) throw new Error("Another fast is already active.");
    next.fastingSessions[index] = updated;
    entityId = id;
  } else if (command.type === "delete_fast") {
    const id = requiredId(payload.fastId ?? payload.id, "Fast id");
    const before = next.fastingSessions.length;
    next.fastingSessions = next.fastingSessions.filter((item) => item.id !== id);
    if (next.fastingSessions.length === before) throw new Error("Fasting session was not found.");
    entityId = id;
  } else if (command.type === "add_weight") {
    const entry = sanitizeWeightEntry({
      id: payload.id,
      kilograms: payload.kilograms,
      measuredAtMillis: payload.measuredAtMillis ?? now,
      note: payload.note,
      createdAtMillis: now,
      updatedAtMillis: now,
      actor: command.actor,
      source: { kind: "manageme" },
    }, command.actor);
    next.weights.push(entry);
    entityId = entry.id;
  } else if (command.type === "update_weight") {
    const id = requiredId(payload.weightId ?? payload.id, "Weight id");
    const index = next.weights.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Weight entry was not found.");
    const current = next.weights[index];
    next.weights[index] = sanitizeWeightEntry({ ...current, ...payload, id, createdAtMillis: current.createdAtMillis, updatedAtMillis: now, actor: command.actor, source: current.source }, command.actor);
    entityId = id;
  } else if (command.type === "delete_weight") {
    const id = requiredId(payload.weightId ?? payload.id, "Weight id");
    const before = next.weights.length;
    next.weights = next.weights.filter((item) => item.id !== id);
    if (next.weights.length === before) throw new Error("Weight entry was not found.");
    entityId = id;
  }

  return { ledger: completeCommand(next, command.requestId, now), changed: true, entityId };
}

function externalKey(sourceValue: HealthSource, fallbackId: string): string {
  return `${sourceValue.packageName || sourceValue.app || "health-connect"}:${sourceValue.externalId || fallbackId}`;
}

function importedWeight(value: unknown, now: number): WeightEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Imported weight must be an object.");
  const input = value as Record<string, unknown>;
  const importedSource = source({
    kind: "health_connect",
    app: input.app,
    packageName: input.packageName,
    externalId: input.externalId,
  }, { kind: "health_connect" });
  if (!importedSource.externalId) throw new Error("Health Connect weight needs an external id.");
  return sanitizeWeightEntry({
    id: input.id ?? `hcw_${hashKey(externalKey(importedSource, String(input.externalId)))}`,
    kilograms: input.kilograms,
    measuredAtMillis: input.measuredAtMillis,
    note: input.note,
    createdAtMillis: input.createdAtMillis ?? now,
    updatedAtMillis: input.updatedAtMillis ?? now,
    actor: "system",
    source: importedSource,
  }, "system");
}

function importedMetric(value: unknown, now: number): HealthMetric {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Imported metric must be an object.");
  const input = value as Record<string, unknown>;
  const importedSource = source({ kind: "health_connect", app: input.app, packageName: input.packageName, externalId: input.externalId }, { kind: "health_connect" });
  if (!importedSource.externalId) throw new Error("Health Connect metric needs an external id.");
  return sanitizeHealthMetric({
    ...input,
    id: input.id ?? `hcm_${hashKey(externalKey(importedSource, String(input.externalId)))}`,
    createdAtMillis: input.createdAtMillis ?? now,
    updatedAtMillis: input.updatedAtMillis ?? now,
    source: importedSource,
  });
}

function hashKey(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function mergeHealthConnectSnapshot(ledger: HealthLedger, snapshot: HealthConnectSnapshot): { ledger: HealthLedger; changed: boolean; affectedCount: number } {
  if (!isHealthConnectSnapshot(snapshot)) throw new Error("Health Connect snapshot is invalid.");
  if (ledger.appliedRequestIds.includes(snapshot.requestId)) return { ledger, changed: false, affectedCount: 0 };
  const next = cloneLedger(ledger);
  const now = timestamp(snapshot.capturedAtMillis, "Health Connect capture date", Date.now());
  let affectedCount = 0;

  for (const raw of snapshot.weights || []) {
    const item = importedWeight(raw, now);
    const key = externalKey(item.source, item.id);
    const index = next.weights.findIndex((candidate) => candidate.source.kind === "health_connect" && externalKey(candidate.source, candidate.id) === key);
    if (index < 0) next.weights.push(item);
    else if (JSON.stringify(next.weights[index]) !== JSON.stringify(item)) next.weights[index] = item;
    else continue;
    affectedCount += 1;
  }

  for (const raw of snapshot.metrics || []) {
    const item = importedMetric(raw, now);
    const key = externalKey(item.source, item.id);
    const index = next.metrics.findIndex((candidate) => candidate.source.kind === "health_connect" && externalKey(candidate.source, candidate.id) === key);
    if (index < 0) next.metrics.push(item);
    else if (JSON.stringify(next.metrics[index]) !== JSON.stringify(item)) next.metrics[index] = item;
    else continue;
    affectedCount += 1;
  }

  completeCommand(next, snapshot.requestId, now);
  return { ledger: next, changed: true, affectedCount };
}

export function healthTodaySummary(ledger: HealthLedger, fromMillis: number, toMillis: number): HealthTodaySummary {
  if (!Number.isFinite(fromMillis) || !Number.isFinite(toMillis) || toMillis <= fromMillis) throw new Error("Health summary range is invalid.");
  const consumptions = ledger.consumptions.filter((item) => item.consumedAtMillis >= fromMillis && item.consumedAtMillis < toMillis).sort((a, b) => b.consumedAtMillis - a.consumedAtMillis);
  const sum = (field: keyof Pick<Nutrition, "caloriesKcal" | "proteinGrams" | "carbsGrams" | "fatGrams">) => Math.round(consumptions.reduce((total, item) => total + item.nutrition[field], 0) * 1000) / 1000;
  const latestWeight = [...ledger.weights].sort((a, b) => b.measuredAtMillis - a.measuredAtMillis)[0];
  return {
    caloriesKcal: sum("caloriesKcal"),
    proteinGrams: sum("proteinGrams"),
    carbsGrams: sum("carbsGrams"),
    fatGrams: sum("fatGrams"),
    consumptions,
    ...(activeFast(ledger) ? { activeFast: activeFast(ledger) } : {}),
    ...(latestWeight ? { latestWeight } : {}),
  };
}

export function weightTrend(ledger: HealthLedger, days: number, now = Date.now()): { latest?: WeightEntry; baseline?: WeightEntry; changeKg?: number; movingAverageKg?: number } {
  const weights = [...ledger.weights].filter((item) => item.measuredAtMillis <= now).sort((a, b) => a.measuredAtMillis - b.measuredAtMillis);
  const latest = weights.at(-1);
  if (!latest) return {};
  const cutoff = now - Math.max(1, days) * 86_400_000;
  const baseline = weights.find((item) => item.measuredAtMillis >= cutoff) || weights[0];
  const recent = weights.filter((item) => item.measuredAtMillis >= now - 7 * 86_400_000);
  const movingAverageKg = recent.length ? Math.round((recent.reduce((sum, item) => sum + item.kilograms, 0) / recent.length) * 1000) / 1000 : latest.kilograms;
  return { latest, baseline, changeKg: Math.round((latest.kilograms - baseline.kilograms) * 1000) / 1000, movingAverageKg };
}
