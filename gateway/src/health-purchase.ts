import { applyFinanceCommandToGitHub } from "./finance-store";
import { applyHealthCommandToGitHub, readHealthLedger } from "./health-store";
import { normalizeHealthCurrency } from "./health";
import type { FinanceCommand } from "./finance";
import type { HealthCommand } from "./health";
import type { Env } from "./types";

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,95}$/i;

function stableRequest(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim().toLowerCase() : "";
  return candidate && ID_PATTERN.test(candidate) ? candidate : `buy_eat_${crypto.randomUUID().replaceAll("-", "")}`.slice(0, 96);
}

function childRequest(root: string, suffix: string): string {
  return `${root.slice(0, 86)}_${suffix}`.slice(0, 96);
}

export async function buyAndEat(env: Env, input: unknown): Promise<Record<string, unknown>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Food purchase request is invalid.");
  const body = input as Record<string, unknown>;
  const foodId = String(body.foodId || "").trim().toLowerCase();
  if (!foodId) throw new Error("Food id is required.");
  const ledger = (await readHealthLedger(env)).ledger;
  const food = ledger.foods.find((item) => item.id === foodId && item.archivedAtMillis === undefined);
  if (!food) throw new Error("Saved food was not found or is archived.");

  const amountCents = body.priceCents === undefined ? food.priceCents : Number(body.priceCents);
  const currencyCode = body.currencyCode === undefined ? food.currencyCode : normalizeHealthCurrency(body.currencyCode);
  if (!Number.isSafeInteger(amountCents) || Number(amountCents) <= 0 || !currencyCode) throw new Error("A valid saved or explicit purchase price and currency is required.");
  const occurredAtMillis = body.occurredAtMillis === undefined ? Date.now() : Number(body.occurredAtMillis);
  if (!Number.isSafeInteger(occurredAtMillis) || occurredAtMillis < 0) throw new Error("Purchase time is invalid.");

  const root = stableRequest(body.requestId);
  const financeCommand: FinanceCommand = {
    requestId: childRequest(root, "finance"),
    profileId: "kornel",
    actor: "web",
    type: "add_entry",
    payload: {
      type: "EXPENSE",
      category: typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Food",
      amountCents,
      currencyCode,
      name: food.name,
      createdAtMillis: occurredAtMillis,
    },
  };
  const finance = await applyFinanceCommandToGitHub(env, financeCommand);

  const healthCommand: HealthCommand = {
    requestId: childRequest(root, "health"),
    profileId: "kornel",
    actor: "web",
    type: "log_food",
    payload: {
      foodId: food.id,
      ...(body.amountGrams !== undefined ? { amountGrams: body.amountGrams } : {}),
      consumedAtMillis: occurredAtMillis,
      financeEntryId: finance.entityId,
      ...(body.note !== undefined ? { note: body.note } : {}),
    },
  };

  try {
    const health = await applyHealthCommandToGitHub(env, healthCommand);
    return { ledger: health.ledger, entityId: health.entityId, financeEntryId: finance.entityId, partial: false };
  } catch (error) {
    return { financeEntryId: finance.entityId, partial: true, error: error instanceof Error ? error.message : "Health consumption could not be saved." };
  }
}
