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

export interface FinanceBudget {
  id: string;
  name: string;
  month: string;
  amountCents: number;
  currencyCode: FinanceCurrency;
  updatedAtMillis: number;
  deletedAtMillis?: number;
}

export interface FinanceCommitment {
  id: string;
  name: string;
  month: string;
  plannedAmountCents: number;
  currencyCode: FinanceCurrency;
  category: string;
  dueDate?: string;
  repeatMonthly: boolean;
  linkedEntryId?: string;
  updatedAtMillis: number;
  deletedAtMillis?: number;
}

export interface FinanceAllocation {
  id: string;
  entryId: string;
  budgetId: string;
  amountCents: number;
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
  budgets?: FinanceBudget[];
  commitments?: FinanceCommitment[];
  allocations?: FinanceAllocation[];
  appliedRequestIds: string[];
  updatedAt: string;
}

export interface FinanceSnapshot {
  requestId: string;
  deviceId?: string;
  entries: unknown[];
  categories: unknown[];
  budgets?: unknown[];
  commitments?: unknown[];
  allocations?: unknown[];
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
    | "delete_category"
    | "add_budget"
    | "update_budget"
    | "delete_budget"
    | "add_commitment"
    | "update_commitment"
    | "delete_commitment"
    | "link_commitment"
    | "set_allocation"
    | "delete_allocation";
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

function optionalId(value: unknown): string | undefined {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return undefined;
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

export function normalizeFinanceMonth(value: unknown): string {
  const month = String(value || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Month must use YYYY-MM.");
  return month;
}

function optionalIsoDate(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00Z`))) {
    throw new Error("Due date must use YYYY-MM-DD.");
  }
  return text;
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


export function sanitizeFinanceBudget(value: unknown): FinanceBudget {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Finance budget must be an object.");
  const input = value as Record<string, unknown>;
  const updatedAtMillis = timestamp(input.updatedAtMillis, "Budget update date");
  return {
    id: cleanId(input.id, "budget"),
    name: cleanText(input.name, "Budget name", 120),
    month: normalizeFinanceMonth(input.month),
    amountCents: integer(input.amountCents, "Budget amount", 1),
    currencyCode: normalizeFinanceCurrency(input.currencyCode),
    updatedAtMillis,
    deletedAtMillis: optionalTimestamp(input.deletedAtMillis, "Budget deletion date", updatedAtMillis),
  };
}

export function sanitizeFinanceCommitment(value: unknown): FinanceCommitment {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Finance commitment must be an object.");
  const input = value as Record<string, unknown>;
  const updatedAtMillis = timestamp(input.updatedAtMillis, "Commitment update date");
  return {
    id: cleanId(input.id, "commitment"),
    name: cleanText(input.name, "Commitment name", 180),
    month: normalizeFinanceMonth(input.month),
    plannedAmountCents: integer(input.plannedAmountCents, "Planned amount", 1),
    currencyCode: normalizeFinanceCurrency(input.currencyCode),
    category: optionalText(input.category, 120) || "Bills",
    dueDate: optionalIsoDate(input.dueDate),
    repeatMonthly: Boolean(input.repeatMonthly),
    linkedEntryId: optionalId(input.linkedEntryId),
    updatedAtMillis,
    deletedAtMillis: optionalTimestamp(input.deletedAtMillis, "Commitment deletion date", updatedAtMillis),
  };
}

export function sanitizeFinanceAllocation(value: unknown): FinanceAllocation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Finance allocation must be an object.");
  const input = value as Record<string, unknown>;
  const updatedAtMillis = timestamp(input.updatedAtMillis, "Allocation update date");
  return {
    id: cleanId(input.id, "allocation"),
    entryId: cleanId(input.entryId, "money"),
    budgetId: cleanId(input.budgetId, "budget"),
    amountCents: integer(input.amountCents, "Allocation amount", 1),
    updatedAtMillis,
    deletedAtMillis: optionalTimestamp(input.deletedAtMillis, "Allocation deletion date", updatedAtMillis),
  };
}

export function createEmptyFinanceLedger(now = new Date()): FinanceLedger {
  return {
    schemaVersion: 1,
    revision: 0,
    profileId: "kornel",
    entries: [],
    categories: [],
    budgets: [],
    commitments: [],
    allocations: [],
    appliedRequestIds: [],
    updatedAt: now.toISOString(),
  };
}

export function isFinanceLedger(value: unknown): value is FinanceLedger {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ledger = value as Partial<FinanceLedger>;
  if (ledger.schemaVersion !== 1 || ledger.profileId !== "kornel" || !Number.isInteger(ledger.revision)) return false;
  if (!Array.isArray(ledger.entries) || !Array.isArray(ledger.categories) || !Array.isArray(ledger.appliedRequestIds)) return false;
  if (ledger.budgets !== undefined && !Array.isArray(ledger.budgets)) return false;
  if (ledger.commitments !== undefined && !Array.isArray(ledger.commitments)) return false;
  if (ledger.allocations !== undefined && !Array.isArray(ledger.allocations)) return false;
  try {
    ledger.entries.forEach((entry) => sanitizeFinanceEntry(entry, "system"));
    ledger.categories.forEach((category) => sanitizeFinanceCategory(category));
    (ledger.budgets || []).forEach((budget) => sanitizeFinanceBudget(budget));
    (ledger.commitments || []).forEach((commitment) => sanitizeFinanceCommitment(commitment));
    (ledger.allocations || []).forEach((allocation) => sanitizeFinanceAllocation(allocation));
    return true;
  } catch {
    return false;
  }
}

export function isFinanceSnapshot(value: unknown): value is FinanceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<FinanceSnapshot>;
  return typeof snapshot.requestId === "string"
    && ID_PATTERN.test(snapshot.requestId)
    && Array.isArray(snapshot.entries)
    && Array.isArray(snapshot.categories)
    && (snapshot.budgets === undefined || Array.isArray(snapshot.budgets))
    && (snapshot.commitments === undefined || Array.isArray(snapshot.commitments))
    && (snapshot.allocations === undefined || Array.isArray(snapshot.allocations));
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
      "add_budget",
      "update_budget",
      "delete_budget",
      "add_commitment",
      "update_commitment",
      "delete_commitment",
      "link_commitment",
      "set_allocation",
      "delete_allocation",
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

function sortedBudgets(budgets: FinanceBudget[]): FinanceBudget[] {
  return [...budgets].sort((a, b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function sortedCommitments(commitments: FinanceCommitment[]): FinanceCommitment[] {
  return [...commitments].sort((a, b) => b.month.localeCompare(a.month) || (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99") || a.name.localeCompare(b.name));
}

function sortedAllocations(allocations: FinanceAllocation[]): FinanceAllocation[] {
  return [...allocations].sort((a, b) => a.entryId.localeCompare(b.entryId) || a.budgetId.localeCompare(b.budgetId) || a.id.localeCompare(b.id));
}


function normalizeFingerprintText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function entryFingerprint(entry: FinanceEntry): string {
  return [
    entry.type,
    normalizeFingerprintText(entry.category),
    String(entry.amountCents),
    entry.currencyCode,
    normalizeFingerprintText(entry.name),
    String(Math.floor(entry.createdAtMillis / 1000)),
  ].join("\u0000");
}

export function dedupeFinanceLedger(
  current: FinanceLedger,
  now = new Date(),
): { ledger: FinanceLedger; changed: boolean; affectedCount: number } {
  const next = structuredClone(current);
  const candidates = next.entries
    .filter((entry) => !entry.deletedAtMillis)
    .sort((left, right) => {
      const leftArchived = left.archivedAtMillis ? 1 : 0;
      const rightArchived = right.archivedAtMillis ? 1 : 0;
      return leftArchived - rightArchived
        || right.updatedAtMillis - left.updatedAtMillis
        || left.id.localeCompare(right.id);
    });
  const seen = new Set<string>();
  const nowMillis = now.getTime();
  let affectedCount = 0;
  for (const entry of candidates) {
    const fingerprint = entryFingerprint(entry);
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      continue;
    }
    entry.deletedAtMillis = nowMillis;
    entry.archivedAtMillis = undefined;
    entry.updatedAtMillis = nowMillis;
    entry.actor = "system";
    affectedCount += 1;
  }
  if (affectedCount === 0) return { ledger: current, changed: false, affectedCount: 0 };
  next.revision += 1;
  next.entries = sortedEntries(next.entries);
  next.updatedAt = now.toISOString();
  return { ledger: next, changed: true, affectedCount };
}

export function mergeFinanceSnapshot(current: FinanceLedger, snapshot: FinanceSnapshot): { ledger: FinanceLedger; changed: boolean } {
  const incomingEntries = snapshot.entries.map((entry) => sanitizeFinanceEntry(entry, "android"));
  const incomingCategories = snapshot.categories.map((category) => sanitizeFinanceCategory(category));
  const incomingBudgets = (snapshot.budgets || []).map((budget) => sanitizeFinanceBudget(budget));
  const incomingCommitments = (snapshot.commitments || []).map((commitment) => sanitizeFinanceCommitment(commitment));
  const incomingAllocations = (snapshot.allocations || []).map((allocation) => sanitizeFinanceAllocation(allocation));
  const entryMerge = mergeByUpdatedAt(current.entries, incomingEntries);
  const categoryMerge = mergeByUpdatedAt(current.categories, incomingCategories);
  const budgetMerge = mergeByUpdatedAt(current.budgets || [], incomingBudgets);
  const commitmentMerge = mergeByUpdatedAt(current.commitments || [], incomingCommitments);
  const allocationMerge = mergeByUpdatedAt(current.allocations || [], incomingAllocations);
  if (!entryMerge.changed && !categoryMerge.changed && !budgetMerge.changed && !commitmentMerge.changed && !allocationMerge.changed) {
    return { ledger: current, changed: false };
  }
  const now = new Date();
  return {
    ledger: {
      ...current,
      revision: current.revision + 1,
      entries: sortedEntries(entryMerge.values),
      categories: sortedCategories(categoryMerge.values),
      budgets: sortedBudgets(budgetMerge.values),
      commitments: sortedCommitments(commitmentMerge.values),
      allocations: sortedAllocations(allocationMerge.values),
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

function findBudget(ledger: FinanceLedger, id: unknown): FinanceBudget {
  const budget = (ledger.budgets || []).find((item) => item.id === String(id || "").toLowerCase());
  if (!budget) throw new Error("Finance budget not found.");
  return budget;
}

function findCommitment(ledger: FinanceLedger, id: unknown): FinanceCommitment {
  const commitment = (ledger.commitments || []).find((item) => item.id === String(id || "").toLowerCase());
  if (!commitment) throw new Error("Finance commitment not found.");
  return commitment;
}

function findAllocation(ledger: FinanceLedger, id: unknown): FinanceAllocation {
  const allocation = (ledger.allocations || []).find((item) => item.id === String(id || "").toLowerCase());
  if (!allocation) throw new Error("Finance allocation not found.");
  return allocation;
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
      const semanticDuplicate = next.entries.find((item) => !item.deletedAtMillis && entryFingerprint(item) === entryFingerprint(entry));
      if (semanticDuplicate) {
        entityId = semanticDuplicate.id;
        break;
      }
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
    case "add_budget": {
      const budget = sanitizeFinanceBudget({
        ...command.payload,
        id: command.payload.id || generatedId("budget"),
        updatedAtMillis: nowMillis,
      });
      next.budgets ||= [];
      const existing = next.budgets.find((item) => !item.deletedAtMillis
        && item.month === budget.month
        && item.currencyCode === budget.currencyCode
        && item.name.toLocaleLowerCase() === budget.name.toLocaleLowerCase());
      if (existing) {
        entityId = existing.id;
        break;
      }
      if (next.budgets.some((item) => item.id === budget.id)) throw new Error("Finance budget id already exists.");
      next.budgets.push(budget);
      entityId = budget.id;
      break;
    }
    case "update_budget": {
      const budget = findBudget(next, command.payload.id);
      if (budget.deletedAtMillis) throw new Error("Deleted finance budget cannot be updated.");
      if ("name" in command.payload) budget.name = cleanText(command.payload.name, "Budget name", 120);
      if ("month" in command.payload) budget.month = normalizeFinanceMonth(command.payload.month);
      if ("amountCents" in command.payload) budget.amountCents = integer(command.payload.amountCents, "Budget amount", 1);
      if ("currencyCode" in command.payload) budget.currencyCode = normalizeFinanceCurrency(command.payload.currencyCode);
      budget.updatedAtMillis = nowMillis;
      entityId = budget.id;
      break;
    }
    case "delete_budget": {
      const budget = findBudget(next, command.payload.id);
      budget.deletedAtMillis = nowMillis;
      budget.updatedAtMillis = nowMillis;
      entityId = budget.id;
      break;
    }
    case "add_commitment": {
      const commitment = sanitizeFinanceCommitment({
        ...command.payload,
        id: command.payload.id || generatedId("commitment"),
        updatedAtMillis: nowMillis,
      });
      next.commitments ||= [];
      if (next.commitments.some((item) => item.id === commitment.id)) throw new Error("Finance commitment id already exists.");
      next.commitments.push(commitment);
      entityId = commitment.id;
      break;
    }
    case "update_commitment": {
      const commitment = findCommitment(next, command.payload.id);
      if (commitment.deletedAtMillis) throw new Error("Deleted finance commitment cannot be updated.");
      if ("name" in command.payload) commitment.name = cleanText(command.payload.name, "Commitment name", 180);
      if ("month" in command.payload) commitment.month = normalizeFinanceMonth(command.payload.month);
      if ("plannedAmountCents" in command.payload) commitment.plannedAmountCents = integer(command.payload.plannedAmountCents, "Planned amount", 1);
      if ("currencyCode" in command.payload) commitment.currencyCode = normalizeFinanceCurrency(command.payload.currencyCode);
      if ("category" in command.payload) commitment.category = cleanText(command.payload.category, "Category", 120);
      if ("dueDate" in command.payload) commitment.dueDate = optionalIsoDate(command.payload.dueDate);
      if ("repeatMonthly" in command.payload) commitment.repeatMonthly = Boolean(command.payload.repeatMonthly);
      commitment.updatedAtMillis = nowMillis;
      entityId = commitment.id;
      break;
    }
    case "delete_commitment": {
      const commitment = findCommitment(next, command.payload.id);
      commitment.deletedAtMillis = nowMillis;
      commitment.updatedAtMillis = nowMillis;
      entityId = commitment.id;
      break;
    }
    case "link_commitment": {
      const commitment = findCommitment(next, command.payload.id);
      if (commitment.deletedAtMillis) throw new Error("Deleted finance commitment cannot be linked.");
      const entryId = optionalId(command.payload.entryId);
      if (!entryId) {
        commitment.linkedEntryId = undefined;
      } else {
        const entry = findEntry(next, entryId);
        if (entry.deletedAtMillis) throw new Error("Deleted finance entry cannot satisfy a commitment.");
        if (entry.type !== "EXPENSE") throw new Error("Only an expense can satisfy a planned payment.");
        if (entry.currencyCode !== commitment.currencyCode) throw new Error("Payment currency must match the planned payment currency.");
        commitment.linkedEntryId = entry.id;
      }
      commitment.updatedAtMillis = nowMillis;
      entityId = commitment.id;
      break;
    }
    case "set_allocation": {
      const entry = findEntry(next, command.payload.entryId);
      const budget = findBudget(next, command.payload.budgetId);
      if (entry.deletedAtMillis) throw new Error("Deleted finance entry cannot be allocated.");
      if (budget.deletedAtMillis) throw new Error("Deleted finance budget cannot receive allocations.");
      if (entry.type !== "EXPENSE") throw new Error("Only expenses can be allocated to spending budgets.");
      if (entry.currencyCode !== budget.currencyCode) throw new Error("Expense currency must match the budget currency.");
      const amountCents = command.payload.amountCents === undefined
        ? entry.amountCents
        : integer(command.payload.amountCents, "Allocation amount", 1, entry.amountCents);
      next.allocations ||= [];
      const requestedId = optionalId(command.payload.id);
      let allocation = requestedId ? next.allocations.find((item) => item.id === requestedId) : undefined;
      if (!allocation) {
        allocation = next.allocations.find((item) => !item.deletedAtMillis && item.entryId === entry.id && item.budgetId === budget.id);
      }
      const otherAllocated = next.allocations
        .filter((item) => !item.deletedAtMillis && item.entryId === entry.id && item.id !== allocation?.id)
        .reduce((sum, item) => sum + item.amountCents, 0);
      if (otherAllocated + amountCents > entry.amountCents) throw new Error("Budget allocations cannot exceed the expense amount.");
      if (allocation) {
        allocation.entryId = entry.id;
        allocation.budgetId = budget.id;
        allocation.amountCents = amountCents;
        allocation.updatedAtMillis = nowMillis;
        allocation.deletedAtMillis = undefined;
      } else {
        allocation = sanitizeFinanceAllocation({
          id: requestedId || generatedId("allocation"),
          entryId: entry.id,
          budgetId: budget.id,
          amountCents,
          updatedAtMillis: nowMillis,
        });
        next.allocations.push(allocation);
      }
      entityId = allocation.id;
      break;
    }
    case "delete_allocation": {
      const allocation = findAllocation(next, command.payload.id);
      allocation.deletedAtMillis = nowMillis;
      allocation.updatedAtMillis = nowMillis;
      entityId = allocation.id;
      break;
    }
    default:
      throw new Error("Unsupported finance command.");
  }

  rememberRequest(next, command.requestId);
  next.revision += 1;
  next.entries = sortedEntries(next.entries);
  next.categories = sortedCategories(next.categories);
  next.budgets = sortedBudgets(next.budgets || []);
  next.commitments = sortedCommitments(next.commitments || []);
  next.allocations = sortedAllocations(next.allocations || []);
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


export interface FinancePlanInsight {
  kind: "budget" | "commitment";
  id: string;
  name: string;
  amountCents: number;
  currencyCode: FinanceCurrency;
}

export interface FinancePlanSummary {
  month: string;
  budgets: Array<FinanceBudget & {
    spentCents: number;
    remainingCents: number;
    percentUsed: number;
    status: "available" | "exhausted" | "overspent";
  }>;
  commitments: Array<FinanceCommitment & {
    paid: boolean;
    actualAmountCents?: number;
    actualEntryName?: string;
    varianceCents?: number;
    status: "unpaid" | "on_plan" | "under_plan" | "over_plan";
  }>;
  insights: {
    overspent: FinancePlanInsight[];
    available: FinancePlanInsight[];
    underPlan: FinancePlanInsight[];
    unpaid: FinancePlanInsight[];
  };
}

export function financePlanSummary(ledger: FinanceLedger, rawMonth: unknown): FinancePlanSummary {
  const month = normalizeFinanceMonth(rawMonth);
  const liveEntries = new Map(ledger.entries.filter((entry) => !entry.deletedAtMillis).map((entry) => [entry.id, entry]));
  const allocations = (ledger.allocations || []).filter((allocation) => !allocation.deletedAtMillis);
  const budgets = (ledger.budgets || [])
    .filter((budget) => !budget.deletedAtMillis && budget.month === month)
    .map((budget) => {
      const spentCents = allocations
        .filter((allocation) => allocation.budgetId === budget.id && liveEntries.has(allocation.entryId))
        .reduce((sum, allocation) => sum + allocation.amountCents, 0);
      const remainingCents = budget.amountCents - spentCents;
      return {
        ...budget,
        spentCents,
        remainingCents,
        percentUsed: Math.round((spentCents / budget.amountCents) * 1000) / 10,
        status: remainingCents < 0 ? "overspent" as const : remainingCents === 0 ? "exhausted" as const : "available" as const,
      };
    });
  const commitments = (ledger.commitments || [])
    .filter((commitment) => !commitment.deletedAtMillis && commitment.month === month)
    .map((commitment) => {
      const entry = commitment.linkedEntryId ? liveEntries.get(commitment.linkedEntryId) : undefined;
      const varianceCents = entry ? entry.amountCents - commitment.plannedAmountCents : undefined;
      const status = !entry
        ? "unpaid" as const
        : varianceCents! > 0
          ? "over_plan" as const
          : varianceCents! < 0
            ? "under_plan" as const
            : "on_plan" as const;
      return {
        ...commitment,
        paid: Boolean(entry),
        status,
        ...(entry ? {
          actualAmountCents: entry.amountCents,
          actualEntryName: entry.name,
          varianceCents,
        } : {}),
      };
    });

  const insights = {
    overspent: [] as FinancePlanInsight[],
    available: [] as FinancePlanInsight[],
    underPlan: [] as FinancePlanInsight[],
    unpaid: [] as FinancePlanInsight[],
  };
  for (const budget of budgets) {
    if (budget.status === "overspent") {
      insights.overspent.push({ kind: "budget", id: budget.id, name: budget.name, amountCents: Math.abs(budget.remainingCents), currencyCode: budget.currencyCode });
    } else if (budget.status === "available") {
      insights.available.push({ kind: "budget", id: budget.id, name: budget.name, amountCents: budget.remainingCents, currencyCode: budget.currencyCode });
    }
  }
  for (const commitment of commitments) {
    if (commitment.status === "over_plan") {
      insights.overspent.push({ kind: "commitment", id: commitment.id, name: commitment.name, amountCents: commitment.varianceCents || 0, currencyCode: commitment.currencyCode });
    } else if (commitment.status === "under_plan") {
      insights.underPlan.push({ kind: "commitment", id: commitment.id, name: commitment.name, amountCents: Math.abs(commitment.varianceCents || 0), currencyCode: commitment.currencyCode });
    } else if (commitment.status === "unpaid") {
      insights.unpaid.push({ kind: "commitment", id: commitment.id, name: commitment.name, amountCents: commitment.plannedAmountCents, currencyCode: commitment.currencyCode });
    }
  }
  return { month, budgets, commitments, insights };
}
