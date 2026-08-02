export type FinanceEntryType = "EXPENSE" | "INCOME";
export type FinanceCurrency = "HUF" | "EUR" | "TRY";
export type FinanceActor = "kornel" | "assistant" | "web" | "android" | "system";
export type FinanceEntryStatus = "active" | "archived" | "all";

export interface FinanceCategory {
  id: string;
  type: FinanceEntryType;
  name: string;
  sortOrder: number;
  updatedAtMillis: number;
  deletedAtMillis?: number;
}

export interface FinanceEntry {
  id: string;
  type: FinanceEntryType;
  category: string;
  amountCents: number;
  currencyCode: FinanceCurrency;
  name: string;
  createdAtMillis: number;
  updatedAtMillis: number;
  archivedAtMillis?: number;
  deletedAtMillis?: number;
  actor: FinanceActor;
}

export interface FinanceLedger {
  schemaVersion: 1;
  revision: number;
  profileId: "kornel";
  entries: FinanceEntry[];
  categories: FinanceCategory[];
  appliedRequestIds: string[];
  updatedAt: string;
}

export interface FinanceSnapshot {
  requestId: string;
  deviceId?: string;
  entries: unknown[];
  categories: unknown[];
}

export interface FinanceCommand {
  requestId: string;
  profileId: "kornel";
  actor: Exclude<FinanceActor, "system">;
  type:
    | "add_entry"
    | "update_entry"
    | "archive_entry"
    | "restore_entry"
    | "archive_before"
    | "delete_entry"
    | "add_category"
    | "delete_category";
  payload: Record<string, unknown>;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,95}$/i;
const MAX_SAFE_MILLIS = 8_640_000_000_000_000;

function generatedId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 96).toLowerCase();
}

function cleanId(value: unknown, fallbackPrefix: string): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return generatedId(fallbackPrefix);
  if (!ID_PATTERN.test(candidate)) throw new Error("Finance id contains unsupported characters.");
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

function integer(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${label} is invalid.`);
  return parsed;
}

function timestamp(value: unknown, label: string, fallback = Date.now()): number {
  if (value === undefined || value === null || value === "") return fallback;
  return integer(value, label, 0, MAX_SAFE_MILLIS);
}

function optionalTimestamp(value: unknown, label: string, fallback: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return timestamp(value, label, fallback);
}

export function normalizeFinanceType(value: unknown): FinanceEntryType {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "EXPENSE" || normalized === "INCOME") return normalized;
  throw new Error("Finance type must be EXPENSE or INCOME.");
}

export function normalizeFinanceCurrency(value: unknown): FinanceCurrency {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "TL") return "TRY";
  if (normalized === "HUF" || normalized === "EUR" || normalized === "TRY") return normalized;
  throw new Error("Currency must be HUF, EUR, or TRY/TL.");
}

function normalizeActor(value: unknown, fallback: FinanceActor): FinanceActor {
  const actor = String(value || fallback);
  return ["kornel", "assistant", "web", "android", "system"].includes(actor) ? actor as FinanceActor : fallback;
}

export function normalizeFinanceStatus(value: unknown): FinanceEntryStatus {
  const status = String(value || "active").trim().toLowerCase();
  if (status === "active" || status === "archived" || status === "all") return status;
  throw new Error("Finance status must be active, archived, or all.");
}

export function sanitizeFinanceEntry(value: unknown, fallbackActor: FinanceActor = "android"): FinanceEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Finance entry must be an object.");
  const input = value as Record<string, unknown>;
  const category = cleanText(input.category, "Category", 120);
  const createdAtMillis = timestamp(input.createdAtMillis, "Entry date");
  const updatedAtMillis = timestamp(input.updatedAtMillis, "Entry update date", createdAtMillis);
  const deletedAtMillis = optionalTimestamp(input.deletedAtMillis, "Entry deletion date", updatedAtMillis);
  const archivedAtMillis = deletedAtMillis
    ? undefined
    : optionalTimestamp(input.archivedAtMillis, "Entry archive date", updatedAtMillis);
  return {
    id: cleanId(input.id, "money"),
    type: normalizeFinanceType(input.type),
    category,
    amountCents: integer(input.amountCents, "Amount", 1),
    currencyCode: normalizeFinanceCurrency(input.currencyCode),
    name: optionalText(input.name, 240) || category,
    createdAtMillis,
    updatedAtMillis: Math.max(updatedAtMillis, createdAtMillis),
    archivedAtMillis,
    deletedAtMillis,
    actor: normalizeActor(input.actor, fallbackActor),
  };
}

export function sanitizeFinanceCategory(value: unknown): FinanceCategory {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Finance category must be an object.");
  const input = value as Record<string, unknown>;
  const updatedAtMillis = timestamp(input.updatedAtMillis, "Category update date");
  const deletedAtMillis = optionalTimestamp(input.deletedAtMillis, "Category deletion date", updatedAtMillis);
  return {
    id: cleanId(input.id, "category"),
    type: normalizeFinanceType(input.type),
    name: cleanText(input.name, "Category name", 120),
    sortOrder: integer(input.sortOrder ?? 0, "Category sort order", 0, 100_000),
    updatedAtMillis,
    deletedAtMillis,
  };
}

export function createEmptyFinanceLedger(now = new Date()): FinanceLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    profileId: "kornel",
    entries: [],
    categories: [],
    appliedRequestIds: [],
    updatedAt: now.toISOString(),
  };
}

export function isFinanceLedger(value: unknown): value is FinanceLedger {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ledger = value as Partial<FinanceLedger>;
  if (ledger.schemaVersion !== 1 || ledger.profileId !== "kornel" || !Number.isInteger(ledger.revision)) return false;
  if (!Array.isArray(ledger.entries) || !Array.isArray(ledger.categories) || !Array.isArray(ledger.appliedRequestIds)) return false;
  try {
    ledger.entries.forEach((entry) => sanitizeFinanceEntry(entry, "system"));
    ledger.categories.forEach((category) => sanitizeFinanceCategory(category));
    return true;
  } catch {
    return false;
  }
}

export function isFinanceSnapshot(value: unknown): value is FinanceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<FinanceSnapshot>;
  return typeof snapshot.requestId === "string" && ID_PATTERN.test(snapshot.requestId) && Array.isArray(snapshot.entries) && Array.isArray(snapshot.categories);
}

export function isFinanceCommand(value: unknown): value is FinanceCommand {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const command = value as Partial<FinanceCommand>;
  return command.profileId === "kornel"
    && typeof command.requestId === "string"
    && ID_PATTERN.test(command.requestId)
    && ["kornel", "assistant", "web", "android"].includes(String(command.actor))
    && [
      "add_entry",
      "update_entry",
      "archive_entry",
      "restore_entry",
      "archive_before",
      "delete_entry",
      "add_category",
      "delete_category",
    ].includes(String(command.type))
    && Boolean(command.payload)
    && typeof command.payload === "object"
    && !Array.isArray(command.payload);
}

function mergeByUpdatedAt<T extends { id: string; updatedAtMillis: number }>(current: T[], incoming: T[]): { values: T[]; changed: boolean } {
  const map = new Map(current.map((item) => [item.id, item]));
  let changed = false;
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!existing || item.updatedAtMillis > existing.updatedAtMillis) {
      map.set(item.id, item);
      changed = true;
    }
  }
  return { values: [...map.values()], changed };
}

function sortedEntries(entries: FinanceEntry[]): FinanceEntry[] {
  return [...entries].sort((a, b) => b.createdAtMillis - a.createdAtMillis || a.id.localeCompare(b.id));
}

function sortedCategories(categories: FinanceCategory[]): FinanceCategory[] {
  return [...categories].sort((a, b) => a.type.localeCompare(b.type) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function mergeFinanceSnapshot(current: FinanceLedger, snapshot: FinanceSnapshot): { ledger: FinanceLedger; changed: boolean } {
  const incomingEntries = snapshot.entries.map((entry) => sanitizeFinanceEntry(entry, "android"));
  const incomingCategories = snapshot.categories.map((category) => sanitizeFinanceCategory(category));
  const entryMerge = mergeByUpdatedAt(current.entries, incomingEntries);
  const categoryMerge = mergeByUpdatedAt(current.categories, incomingCategories);
  if (!entryMerge.changed && !categoryMerge.changed) return { ledger: current, changed: false };
  const now = new Date();
  return {
    ledger: {
      ...current,
      revision: current.revision + 1,
      entries: sortedEntries(entryMerge.values),
      categories: sortedCategories(categoryMerge.values),
      updatedAt: now.toISOString(),
    },
    changed: true,
  };
}

function rememberRequest(ledger: FinanceLedger, requestId: string): void {
  ledger.appliedRequestIds.unshift(requestId.toLowerCase());
  ledger.appliedRequestIds = [...new Set(ledger.appliedRequestIds)].slice(0, 2000);
}

function findEntry(ledger: FinanceLedger, id: unknown): FinanceEntry {
  const entry = ledger.entries.find((item) => item.id === String(id || "").toLowerCase());
  if (!entry) throw new Error("Finance entry not found.");
  return entry;
}

function findCategory(ledger: FinanceLedger, id: unknown): FinanceCategory {
  const category = ledger.categories.find((item) => item.id === String(id || "").toLowerCase());
  if (!category) throw new Error("Finance category not found.");
  return category;
}

export function applyFinanceCommand(
  current: FinanceLedger,
  command: FinanceCommand,
  now = new Date(),
): { ledger: FinanceLedger; changed: boolean; entityId?: string; affectedCount?: number } {
  if (current.appliedRequestIds.includes(command.requestId.toLowerCase())) return { ledger: current, changed: false };
  const next = structuredClone(current);
  const nowMillis = now.getTime();
  let entityId: string | undefined;
  let affectedCount: number | undefined;

  switch (command.type) {
    case "add_entry": {
      const entry = sanitizeFinanceEntry({
        ...command.payload,
        id: command.payload.id || generatedId("money"),
        createdAtMillis: command.payload.createdAtMillis ?? nowMillis,
        updatedAtMillis: nowMillis,
        actor: command.actor,
      }, command.actor);
      if (next.entries.some((item) => item.id === entry.id)) throw new Error("Finance entry id already exists.");
      next.entries.unshift(entry);
      entityId = entry.id;
      break;
    }
    case "update_entry": {
      const entry = findEntry(next, command.payload.id);
      if (entry.deletedAtMillis) throw new Error("Deleted finance entry cannot be updated.");
      if ("type" in command.payload) entry.type = normalizeFinanceType(command.payload.type);
      if ("category" in command.payload) entry.category = cleanText(command.payload.category, "Category", 120);
      if ("amountCents" in command.payload) entry.amountCents = integer(command.payload.amountCents, "Amount", 1);
      if ("currencyCode" in command.payload) entry.currencyCode = normalizeFinanceCurrency(command.payload.currencyCode);
      if ("name" in command.payload) entry.name = optionalText(command.payload.name, 240) || entry.category;
      if ("createdAtMillis" in command.payload) entry.createdAtMillis = timestamp(command.payload.createdAtMillis, "Entry date");
      entry.updatedAtMillis = Math.max(nowMillis, entry.createdAtMillis);
      entry.actor = command.actor;
      entityId = entry.id;
      break;
    }
    case "archive_entry": {
      const entry = findEntry(next, command.payload.id);
      if (entry.deletedAtMillis) throw new Error("Deleted finance entry cannot be archived.");
      entry.archivedAtMillis = nowMillis;
      entry.updatedAtMillis = nowMillis;
      entry.actor = command.actor;
      entityId = entry.id;
      affectedCount = 1;
      break;
    }
    case "restore_entry": {
      const entry = findEntry(next, command.payload.id);
      if (entry.deletedAtMillis) throw new Error("Deleted finance entry cannot be restored from archive.");
      entry.archivedAtMillis = undefined;
      entry.updatedAtMillis = nowMillis;
      entry.actor = command.actor;
      entityId = entry.id;
      affectedCount = 1;
      break;
    }
    case "archive_before": {
      const beforeMillis = timestamp(command.payload.beforeMillis, "Archive cutoff");
      let count = 0;
      for (const entry of next.entries) {
        if (!entry.deletedAtMillis && !entry.archivedAtMillis && entry.createdAtMillis < beforeMillis) {
          entry.archivedAtMillis = nowMillis;
          entry.updatedAtMillis = nowMillis;
          entry.actor = command.actor;
          count += 1;
        }
      }
      affectedCount = count;
      break;
    }
    case "delete_entry": {
      const entry = findEntry(next, command.payload.id);
      entry.deletedAtMillis = nowMillis;
      entry.archivedAtMillis = undefined;
      entry.updatedAtMillis = nowMillis;
      entry.actor = command.actor;
      entityId = entry.id;
      affectedCount = 1;
      break;
    }
    case "add_category": {
      const type = normalizeFinanceType(command.payload.type);
      const name = cleanText(command.payload.name, "Category name", 120);
      const existing = next.categories.find((item) => !item.deletedAtMillis && item.type === type && item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (existing) {
        entityId = existing.id;
        break;
      }
      const category = sanitizeFinanceCategory({
        id: command.payload.id || generatedId("category"),
        type,
        name,
        sortOrder: command.payload.sortOrder ?? next.categories.filter((item) => item.type === type && !item.deletedAtMillis).length,
        updatedAtMillis: nowMillis,
      });
      next.categories.push(category);
      entityId = category.id;
      break;
    }
    case "delete_category": {
      const category = findCategory(next, command.payload.id);
      category.deletedAtMillis = nowMillis;
      category.updatedAtMillis = nowMillis;
      entityId = category.id;
      break;
    }
    default:
      throw new Error("Unsupported finance command.");
  }

  rememberRequest(next, command.requestId);
  next.revision += 1;
  next.entries = sortedEntries(next.entries);
  next.categories = sortedCategories(next.categories);
  next.updatedAt = now.toISOString();
  return { ledger: next, changed: true, entityId, affectedCount };
}

export interface FinanceSummary {
  entryCount: number;
  byCurrency: Array<{ currencyCode: FinanceCurrency; expenseCents: number; incomeCents: number; balanceCents: number }>;
  byCategory: Array<{ category: string; currencyCode: FinanceCurrency; expenseCents: number; incomeCents: number }>;
}

export function financeEntriesByStatus(ledger: FinanceLedger, status: FinanceEntryStatus = "active"): FinanceEntry[] {
  const notDeleted = ledger.entries.filter((entry) => !entry.deletedAtMillis);
  if (status === "archived") return notDeleted.filter((entry) => Boolean(entry.archivedAtMillis));
  if (status === "all") return notDeleted;
  return notDeleted.filter((entry) => !entry.archivedAtMillis);
}

export function activeFinanceEntries(ledger: FinanceLedger): FinanceEntry[] {
  return financeEntriesByStatus(ledger, "active");
}

export function archivedFinanceEntries(ledger: FinanceLedger): FinanceEntry[] {
  return financeEntriesByStatus(ledger, "archived");
}

export function financeSummary(
  ledger: FinanceLedger,
  fromMillis?: number,
  toMillis?: number,
  status: FinanceEntryStatus = "active",
): FinanceSummary {
  const entries = financeEntriesByStatus(ledger, status).filter((entry) =>
    (fromMillis === undefined || entry.createdAtMillis >= fromMillis)
    && (toMillis === undefined || entry.createdAtMillis < toMillis));
  const currency = new Map<FinanceCurrency, { expenseCents: number; incomeCents: number }>();
  const category = new Map<string, { category: string; currencyCode: FinanceCurrency; expenseCents: number; incomeCents: number }>();
  for (const entry of entries) {
    const totals = currency.get(entry.currencyCode) || { expenseCents: 0, incomeCents: 0 };
    if (entry.type === "EXPENSE") totals.expenseCents += entry.amountCents;
    else totals.incomeCents += entry.amountCents;
    currency.set(entry.currencyCode, totals);

    const key = `${entry.category}\u0000${entry.currencyCode}`;
    const byCategory = category.get(key) || { category: entry.category, currencyCode: entry.currencyCode, expenseCents: 0, incomeCents: 0 };
    if (entry.type === "EXPENSE") byCategory.expenseCents += entry.amountCents;
    else byCategory.incomeCents += entry.amountCents;
    category.set(key, byCategory);
  }
  return {
    entryCount: entries.length,
    byCurrency: [...currency.entries()]
      .map(([currencyCode, totals]) => ({ currencyCode, ...totals, balanceCents: totals.incomeCents - totals.expenseCents }))
      .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode)),
    byCategory: [...category.values()]
      .sort((a, b) => b.expenseCents - a.expenseCents || b.incomeCents - a.incomeCents || a.category.localeCompare(b.category)),
  };
}
