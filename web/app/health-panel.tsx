"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { healthRequestId, type HealthCommand, type HealthLedger } from "./health-domain";
import { buyAndEatFood, fetchHealthLedger, sendHealthCommand } from "./sync-client";

type Food = { id: string; name: string; brand?: string; variant?: string; packageGrams?: number; defaultServingGrams?: number; priceCents?: number; currencyCode?: string; nutritionPer100g: { caloriesKcal: number; proteinGrams: number; carbsGrams: number; fatGrams: number }; archivedAtMillis?: number };
type Consumption = { id: string; foodId?: string; foodName: string; amountGrams: number; nutrition: { caloriesKcal: number; proteinGrams: number; carbsGrams: number; fatGrams: number }; consumedAtMillis: number; financeEntryId?: string };
type Fast = { id: string; protocolName: string; targetMinutes: number; eatingWindowMinutes?: number; startedAtMillis: number; endedAtMillis?: number };
type Weight = { id: string; kilograms: number; measuredAtMillis: number; source?: { kind?: string; app?: string } };
type Metric = { id: string; type: string; value?: number; unit?: string; startAtMillis: number; endAtMillis?: number; source?: { app?: string } };

function command(type: string, payload: Record<string, unknown>): HealthCommand {
  return { requestId: healthRequestId(), profileId: "kornel", actor: "web", type, payload };
}

function duration(minutes: number): string {
  const hours = Math.floor(Math.max(0, minutes) / 60);
  const remainder = Math.max(0, minutes) % 60;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

function formatTime(value: number): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function localDayStart(value: number): number {
  if (value <= 0) return 0;
  const now = new Date(value);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function servingFor(food: Food | undefined): string {
  if (!food) return "";
  return String(food.defaultServingGrams || food.packageGrams || "");
}

export function HealthPanel({ connected }: { connected: boolean }) {
  const [ledger, setLedger] = useState<HealthLedger | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading health data…");
  const [tick, setTick] = useState(0);
  const [selectedFood, setSelectedFood] = useState("");
  const [amountGrams, setAmountGrams] = useState("");
  const [recordPurchase, setRecordPurchase] = useState(false);
  const [fastPromptAt, setFastPromptAt] = useState<number | null>(null);
  const [weight, setWeight] = useState("");
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [foodForm, setFoodForm] = useState({ name: "", brand: "", packageGrams: "", servingGrams: "", price: "", currency: "HUF", calories: "", protein: "", carbs: "", fat: "" });
  const [nativeHealth, setNativeHealth] = useState("Available in the Android app");

  const foods = (ledger?.foods || []) as unknown as Food[];
  const consumptions = (ledger?.consumptions || []) as unknown as Consumption[];
  const fasts = (ledger?.fastingSessions || []) as unknown as Fast[];
  const weights = (ledger?.weights || []) as unknown as Weight[];
  const metrics = (ledger?.metrics || []) as unknown as Metric[];
  const activeFast = [...fasts].filter((item) => item.endedAtMillis === undefined).sort((a, b) => b.startedAtMillis - a.startedAtMillis)[0];
  const activeFoods = foods.filter((item) => item.archivedAtMillis === undefined);
  const dayStart = localDayStart(tick);
  const todayFood = dayStart > 0 ? consumptions.filter((item) => item.consumedAtMillis >= dayStart).sort((a, b) => b.consumedAtMillis - a.consumedAtMillis) : [];
  const totals = todayFood.reduce((sum, item) => ({ calories: sum.calories + item.nutrition.caloriesKcal, protein: sum.protein + item.nutrition.proteinGrams, carbs: sum.carbs + item.nutrition.carbsGrams, fat: sum.fat + item.nutrition.fatGrams }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const latestWeight = [...weights].sort((a, b) => b.measuredAtMillis - a.measuredAtMillis)[0];
  const todaySteps = dayStart > 0 ? metrics.filter((item) => item.type === "steps" && item.startAtMillis >= dayStart).reduce((sum, item) => sum + (item.value || 0), 0) : 0;
  const completedFasts = fasts.filter((item) => item.endedAtMillis !== undefined);
  const averageFast = completedFasts.length ? Math.round(completedFasts.reduce((sum, item) => sum + ((item.endedAtMillis || item.startedAtMillis) - item.startedAtMillis) / 60000, 0) / completedFasts.length) : 0;

  const refresh = useCallback(async () => {
    if (!connected) {
      setMessage("Connect ManageMe to use the shared Health ledger.");
      return;
    }
    try {
      const next = await fetchHealthLedger();
      setLedger(next);
      setMessage("Health data is synced with ManageMe.");
      const first = (next.foods as unknown as Food[]).find((item) => item.archivedAtMillis === undefined);
      if (first) {
        setSelectedFood(first.id);
        setAmountGrams(servingFor(first));
      } else {
        setSelectedFood("");
        setAmountGrams("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Health data could not be loaded.");
    }
  }, [connected]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);

  useEffect(() => {
    const initialize = window.setTimeout(() => {
      setTick(Date.now());
      try {
        const status = window.ManageMeAndroid?.healthConnectStatus?.();
        if (status) setNativeHealth(status);
      } catch {
        // Browser mode has no native Health Connect bridge.
      }
    }, 0);
    const timer = window.setInterval(() => setTick(Date.now()), 30000);
    const synced = () => {
      setNativeHealth("Health Connect synced");
      void refresh();
    };
    window.addEventListener("manageme-health-synced", synced);
    return () => {
      window.clearTimeout(initialize);
      window.clearInterval(timer);
      window.removeEventListener("manageme-health-synced", synced);
    };
  }, [refresh]);

  async function mutate(next: HealthCommand, success: string) {
    setBusy(true);
    try {
      const result = await sendHealthCommand(next);
      setLedger(result.ledger);
      setMessage(success);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Health change could not be saved.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function startFast() {
    await mutate(command("start_fast", { protocolName: "16:8", targetMinutes: 960, eatingWindowMinutes: 480 }), "16:8 fast started.");
  }

  async function endFast(at = Date.now()) {
    await mutate(command("end_fast", { ...(activeFast ? { fastId: activeFast.id } : {}), endedAtMillis: at }), "Fast ended.");
    setFastPromptAt(null);
  }

  async function logFood(event: FormEvent) {
    event.preventDefault();
    const food = activeFoods.find((item) => item.id === selectedFood);
    if (!food) return;
    const grams = Number(amountGrams || food.defaultServingGrams || food.packageGrams);
    if (!Number.isFinite(grams) || grams <= 0) {
      setMessage("Enter how many grams you ate.");
      return;
    }
    const at = Date.now();
    setBusy(true);
    try {
      if (recordPurchase) {
        const result = await buyAndEatFood({ foodId: food.id, amountGrams: grams, occurredAtMillis: at, requestId: healthRequestId() });
        if (result.partial) {
          setMessage(`The expense was saved but the food log failed: ${result.error || "unknown error"}`);
          return;
        }
        if (result.ledger) setLedger(result.ledger);
        setMessage(`Bought and ate ${food.name}; Finance and Health are linked.`);
      } else {
        const result = await sendHealthCommand(command("log_food", { foodId: food.id, amountGrams: grams, consumedAtMillis: at }));
        setLedger(result.ledger);
        setMessage(`Logged ${food.name}.`);
      }
      if (activeFast && at >= activeFast.startedAtMillis) setFastPromptAt(at);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Food could not be logged.");
    } finally {
      setBusy(false);
    }
  }

  async function saveWeight(event: FormEvent) {
    event.preventDefault();
    const kilograms = Number(weight);
    if (!Number.isFinite(kilograms) || kilograms <= 0) return;
    const result = await mutate(command("add_weight", { kilograms }), `Recorded ${kilograms} kg.`);
    if (result) setWeight("");
  }

  async function saveFood(event: FormEvent) {
    event.preventDefault();
    const payload: Record<string, unknown> = {
      name: foodForm.name.trim(),
      ...(foodForm.brand.trim() ? { brand: foodForm.brand.trim() } : {}),
      ...(foodForm.packageGrams ? { packageGrams: Number(foodForm.packageGrams) } : {}),
      ...(foodForm.servingGrams ? { defaultServingGrams: Number(foodForm.servingGrams) } : {}),
      nutritionPer100g: { caloriesKcal: Number(foodForm.calories), proteinGrams: Number(foodForm.protein), carbsGrams: Number(foodForm.carbs), fatGrams: Number(foodForm.fat) },
    };
    if (foodForm.price) {
      payload.priceCents = Math.round(Number(foodForm.price) * 100);
      payload.currencyCode = foodForm.currency;
    }
    if (!foodForm.name.trim()) return;
    const result = await mutate(command(editingFoodId ? "update_food" : "add_food", { ...(editingFoodId ? { foodId: editingFoodId } : {}), ...payload }), editingFoodId ? "Food updated. Past logs kept their original nutrition." : "Food added to your library.");
    if (result) {
      setEditingFoodId(null);
      setFoodForm({ name: "", brand: "", packageGrams: "", servingGrams: "", price: "", currency: "HUF", calories: "", protein: "", carbs: "", fat: "" });
    }
  }

  function editFood(food: Food) {
    setEditingFoodId(food.id);
    setFoodForm({ name: food.name, brand: food.brand || "", packageGrams: food.packageGrams ? String(food.packageGrams) : "", servingGrams: food.defaultServingGrams ? String(food.defaultServingGrams) : "", price: food.priceCents ? String(food.priceCents / 100) : "", currency: food.currencyCode || "HUF", calories: String(food.nutritionPer100g.caloriesKcal), protein: String(food.nutritionPer100g.proteinGrams), carbs: String(food.nutritionPer100g.carbsGrams), fat: String(food.nutritionPer100g.fatGrams) });
  }

  async function correctFast(item: Fast) {
    const start = window.prompt("Fast start (ISO date-time)", new Date(item.startedAtMillis).toISOString());
    if (!start) return;
    const endDefault = item.endedAtMillis ? new Date(item.endedAtMillis).toISOString() : "";
    const end = window.prompt("Fast end (ISO date-time; leave empty to keep active)", endDefault);
    const startedAtMillis = Date.parse(start);
    const endedAtMillis = end ? Date.parse(end) : undefined;
    if (!Number.isFinite(startedAtMillis) || (end && !Number.isFinite(endedAtMillis))) {
      setMessage("Those fasting times were not valid.");
      return;
    }
    await mutate(command("update_fast", { fastId: item.id, startedAtMillis, ...(endedAtMillis !== undefined ? { endedAtMillis } : {}) }), "Fasting session corrected.");
  }

  function requestHealthPermissions() {
    try {
      if (!window.ManageMeAndroid?.requestHealthConnectPermissions) {
        setNativeHealth("Open ManageMe on Android to connect health apps.");
        return;
      }
      window.ManageMeAndroid.requestHealthConnectPermissions();
      setNativeHealth("Health Connect permission screen opened");
    } catch {
      setNativeHealth("Health Connect is not available in this client");
    }
  }

  function syncHealthConnect() {
    try {
      if (!window.ManageMeAndroid?.requestHealthSync) {
        setNativeHealth("Open ManageMe on Android to sync Health Connect.");
        return;
      }
      window.ManageMeAndroid.requestHealthSync();
      setNativeHealth("Health Connect sync requested…");
    } catch {
      setNativeHealth("Health Connect sync could not start");
    }
  }

  function chooseFood(id: string) {
    setSelectedFood(id);
    setAmountGrams(servingFor(activeFoods.find((food) => food.id === id)));
  }

  const fastMinutes = activeFast && tick > 0 ? Math.max(0, Math.floor((tick - activeFast.startedAtMillis) / 60000)) : 0;
  const fastProgress = activeFast ? Math.min(100, (fastMinutes / activeFast.targetMinutes) * 100) : 0;

  return (
    <section className="health-page">
      <div className="section-heading health-heading">
        <div><p className="eyebrow">Food · fasting · weight · activity</p><h2>Health</h2><p className="health-subtitle">{message}</p></div>
        <button className="quiet-button" onClick={() => void refresh()} disabled={!connected || busy}>Refresh</button>
      </div>

      <div className="health-dashboard-grid">
        <article className="health-card fasting-card">
          <p className="eyebrow">{activeFast ? "Fasting now" : "Eating window"}</p>
          <strong className="health-big">{activeFast ? duration(fastMinutes) : "No active fast"}</strong>
          {activeFast ? <><div className="health-progress"><span style={{ width: `${fastProgress}%` }} /></div><p>{activeFast.protocolName} · target {duration(activeFast.targetMinutes)} · {fastProgress >= 100 ? "target reached" : `${duration(Math.max(0, activeFast.targetMinutes - fastMinutes))} to target`}</p><button onClick={() => void endFast()} disabled={busy}>End fast</button></> : <><p>Default protocol: 16 hours fasting / 8 hours eating.</p><button onClick={() => void startFast()} disabled={busy}>Start 16:8 fast</button></>}
        </article>

        <article className="health-card"><p className="eyebrow">Today</p><strong className="health-big">{Math.round(totals.calories)} kcal</strong><p>{Math.round(totals.protein)} g protein · {Math.round(totals.carbs)} g carbs · {Math.round(totals.fat)} g fat</p><small>{todayFood.length} food entr{todayFood.length === 1 ? "y" : "ies"}</small></article>
        <article className="health-card"><p className="eyebrow">Weight</p><strong className="health-big">{latestWeight ? `${latestWeight.kilograms} kg` : "—"}</strong><p>{latestWeight ? `${latestWeight.source?.kind === "health_connect" ? latestWeight.source.app || "Health Connect" : "ManageMe"} · ${formatTime(latestWeight.measuredAtMillis)}` : "No measurements yet"}</p><form className="health-inline" onSubmit={saveWeight}><input value={weight} onChange={(event) => setWeight(event.target.value)} type="number" step="0.1" min="1" placeholder="kg" /><button disabled={busy || !weight}>Add</button></form></article>
        <article className="health-card"><p className="eyebrow">Connected activity</p><strong className="health-big">{Math.round(todaySteps).toLocaleString()}</strong><p>steps imported today</p><small>{nativeHealth}</small><div className="health-inline"><button onClick={requestHealthPermissions}>Connect</button><button className="secondary" onClick={syncHealthConnect}>Sync</button></div></article>
      </div>

      {fastPromptAt ? <div className="health-alert"><div><strong>This food looks like it may have ended your fast.</strong><p>The food is logged, but the fast is still active. ManageMe will not change it without you.</p></div><div><button onClick={() => void endFast(fastPromptAt)}>End fast at meal</button><button className="secondary" onClick={() => setFastPromptAt(null)}>Keep fasting</button></div></div> : null}

      <div className="health-two-column">
        <section className="health-panel">
          <div className="section-heading compact"><div><p className="eyebrow">Quick log</p><h3>Eat something</h3></div></div>
          <form className="health-form" onSubmit={logFood}>
            <label>Food<select value={selectedFood} onChange={(event) => chooseFood(event.target.value)}>{activeFoods.map((food) => <option key={food.id} value={food.id}>{food.brand ? `${food.brand} · ` : ""}{food.name}</option>)}</select></label>
            <label>Amount (g)<input type="number" step="0.1" min="0.1" value={amountGrams} onChange={(event) => setAmountGrams(event.target.value)} /></label>
            <label className="health-checkbox"><input type="checkbox" checked={recordPurchase} onChange={(event) => setRecordPurchase(event.target.checked)} /><span>I bought this now too — record the expense and link it</span></label>
            <button type="submit" disabled={busy || !selectedFood}>{recordPurchase ? "Buy + eat" : "Log food"}</button>
          </form>

          <div className="health-history"><h3>Today&apos;s food</h3>{todayFood.map((item) => <article key={item.id}><div><strong>{item.foodName}</strong><small>{item.amountGrams} g · {Math.round(item.nutrition.caloriesKcal)} kcal{item.financeEntryId ? " · linked to Finance" : ""}</small></div><button className="text-button" onClick={() => void mutate(command("delete_consumption", { consumptionId: item.id }), "Food entry deleted.")}>Delete</button></article>)}{todayFood.length === 0 ? <p className="empty-note">Nothing logged today.</p> : null}</div>
        </section>

        <section className="health-panel">
          <div className="section-heading compact"><div><p className="eyebrow">Reusable library</p><h3>{editingFoodId ? "Edit food" : "Add regular food"}</h3></div>{editingFoodId ? <button className="text-button" onClick={() => setEditingFoodId(null)}>Cancel</button> : null}</div>
          <form className="health-form food-editor" onSubmit={saveFood}>
            <label>Name<input value={foodForm.name} onChange={(event) => setFoodForm({ ...foodForm, name: event.target.value })} required /></label>
            <label>Brand<input value={foodForm.brand} onChange={(event) => setFoodForm({ ...foodForm, brand: event.target.value })} /></label>
            <div className="health-form-row"><label>Package g<input type="number" step="0.1" value={foodForm.packageGrams} onChange={(event) => setFoodForm({ ...foodForm, packageGrams: event.target.value })} /></label><label>Serving g<input type="number" step="0.1" value={foodForm.servingGrams} onChange={(event) => setFoodForm({ ...foodForm, servingGrams: event.target.value })} /></label></div>
            <div className="health-form-row"><label>Price<input type="number" step="0.01" value={foodForm.price} onChange={(event) => setFoodForm({ ...foodForm, price: event.target.value })} /></label><label>Currency<select value={foodForm.currency} onChange={(event) => setFoodForm({ ...foodForm, currency: event.target.value })}><option>HUF</option><option>EUR</option><option>TRY</option></select></label></div>
            <p className="health-form-note">Nutrition per 100 g</p>
            <div className="health-form-row four"><label>kcal<input type="number" step="0.1" value={foodForm.calories} onChange={(event) => setFoodForm({ ...foodForm, calories: event.target.value })} required /></label><label>Protein<input type="number" step="0.1" value={foodForm.protein} onChange={(event) => setFoodForm({ ...foodForm, protein: event.target.value })} required /></label><label>Carbs<input type="number" step="0.1" value={foodForm.carbs} onChange={(event) => setFoodForm({ ...foodForm, carbs: event.target.value })} required /></label><label>Fat<input type="number" step="0.1" value={foodForm.fat} onChange={(event) => setFoodForm({ ...foodForm, fat: event.target.value })} required /></label></div>
            <button type="submit" disabled={busy}>{editingFoodId ? "Save changes" : "Add to library"}</button>
          </form>
          <div className="health-library">{activeFoods.map((food) => <article key={food.id}><div><strong>{food.name}</strong><small>{food.defaultServingGrams || food.packageGrams || "—"} g · {food.nutritionPer100g.caloriesKcal} kcal/100g{food.priceCents && food.currencyCode ? ` · ${(food.priceCents / 100).toLocaleString()} ${food.currencyCode}` : ""}</small></div><div><button className="text-button" onClick={() => editFood(food)}>Edit</button><button className="text-button" onClick={() => void mutate(command("archive_food", { foodId: food.id }), "Food archived.")}>Archive</button></div></article>)}</div>
        </section>
      </div>

      <div className="health-two-column lower">
        <section className="health-panel"><div className="section-heading compact"><div><p className="eyebrow">Consistency</p><h3>Fasting history</h3></div><span className="count-label">avg {averageFast ? duration(averageFast) : "—"}</span></div><div className="health-history">{[...fasts].sort((a, b) => b.startedAtMillis - a.startedAtMillis).slice(0, 12).map((item) => { const minutes = Math.round(((item.endedAtMillis || tick || item.startedAtMillis) - item.startedAtMillis) / 60000); return <article key={item.id}><div><strong>{duration(minutes)} {minutes >= item.targetMinutes ? "· target reached" : item.endedAtMillis ? "" : "· active"}</strong><small>{formatTime(item.startedAtMillis)} → {item.endedAtMillis ? formatTime(item.endedAtMillis) : "now"}</small></div><button className="text-button" onClick={() => void correctFast(item)}>Correct</button></article>; })}{fasts.length === 0 ? <p className="empty-note">No fasting sessions yet.</p> : null}</div></section>
        <section className="health-panel"><div className="section-heading compact"><div><p className="eyebrow">Trend</p><h3>Weight history</h3></div></div><div className="health-history">{[...weights].sort((a, b) => b.measuredAtMillis - a.measuredAtMillis).slice(0, 12).map((item) => <article key={item.id}><div><strong>{item.kilograms} kg</strong><small>{formatTime(item.measuredAtMillis)} · {item.source?.kind === "health_connect" ? item.source.app || "Health Connect" : "ManageMe"}</small></div>{item.source?.kind !== "health_connect" ? <button className="text-button" onClick={() => void mutate(command("delete_weight", { weightId: item.id }), "Weight entry deleted.")}>Delete</button> : null}</article>)}{weights.length === 0 ? <p className="empty-note">No weight measurements yet.</p> : null}</div></section>
      </div>
    </section>
  );
}
