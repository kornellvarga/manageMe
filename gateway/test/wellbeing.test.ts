import assert from "node:assert/strict";
import test from "node:test";
import { applyHealthCommand, createEmptyHealthLedger, healthTodaySummary, mergeHealthConnectSnapshot, type HealthCommand } from "../src/health";

function command(requestId: string, type: HealthCommand["type"], payload: Record<string, unknown>): HealthCommand {
  return { requestId, profileId: "kornel", actor: "assistant", type, payload };
}

function withFood() {
  return applyHealthCommand(createEmptyHealthLedger(), command("food_request_001", "add_food", {
    id: "food_pudding",
    name: "Protein pudding",
    defaultServingGrams: 200,
    nutritionPer100g: { caloriesKcal: 80, proteinGrams: 10, carbsGrams: 6, fatGrams: 1.5 },
    createdAtMillis: 1000,
    updatedAtMillis: 1000,
  })).ledger;
}

test("consumption snapshots nutrition instead of following later food edits", () => {
  let ledger = withFood();
  ledger = applyHealthCommand(ledger, command("meal_request_001", "log_food", {
    foodId: "food_pudding",
    amountGrams: 150,
    consumedAtMillis: 2000,
  })).ledger;
  assert.equal(ledger.consumptions[0].nutrition.caloriesKcal, 120);
  assert.equal(ledger.consumptions[0].nutrition.proteinGrams, 15);

  ledger = applyHealthCommand(ledger, command("food_request_002", "update_food", {
    foodId: "food_pudding",
    nutritionPer100g: { caloriesKcal: 90, proteinGrams: 11, carbsGrams: 7, fatGrams: 2 },
  })).ledger;
  assert.equal(ledger.consumptions[0].nutrition.caloriesKcal, 120);
});

test("food logging never silently ends a fast", () => {
  let ledger = withFood();
  ledger = applyHealthCommand(ledger, command("fast_request_001", "start_fast", {
    id: "fast_current",
    startedAtMillis: 10_000,
    targetMinutes: 960,
    eatingWindowMinutes: 480,
  })).ledger;
  ledger = applyHealthCommand(ledger, command("meal_request_002", "log_food", {
    foodId: "food_pudding",
    consumedAtMillis: 20_000,
  })).ledger;
  assert.equal(ledger.fastingSessions[0].endedAtMillis, undefined);
  assert.throws(() => applyHealthCommand(ledger, command("fast_request_002", "start_fast", { startedAtMillis: 30_000 })), /already active/i);
});

test("today summary totals consumption", () => {
  let ledger = withFood();
  ledger = applyHealthCommand(ledger, command("meal_request_003", "log_food", { foodId: "food_pudding", amountGrams: 100, consumedAtMillis: 100_000 })).ledger;
  ledger = applyHealthCommand(ledger, command("meal_request_004", "log_food", { foodId: "food_pudding", amountGrams: 50, consumedAtMillis: 200_000 })).ledger;
  const summary = healthTodaySummary(ledger, 0, 500_000);
  assert.equal(summary.caloriesKcal, 120);
  assert.equal(summary.proteinGrams, 15);
});

test("external measurements are idempotent by request and source id", () => {
  const snapshot = {
    requestId: "external_request_001",
    profileId: "kornel" as const,
    capturedAtMillis: 20_000,
    weights: [{ externalId: "weight-source-1", packageName: "com.example.source", kilograms: 81.4, measuredAtMillis: 10_000 }],
    metrics: [{ externalId: "steps-source-1", packageName: "com.example.source", type: "steps", value: 6543, unit: "count", startAtMillis: 0, endAtMillis: 10_000 }],
  };
  const first = mergeHealthConnectSnapshot(createEmptyHealthLedger(), snapshot);
  assert.equal(first.ledger.weights.length, 1);
  assert.equal(first.ledger.metrics.length, 1);
  const retry = mergeHealthConnectSnapshot(first.ledger, snapshot);
  assert.equal(retry.changed, false);
  assert.equal(retry.ledger.weights.length, 1);
});
