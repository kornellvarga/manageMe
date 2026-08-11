from pathlib import Path

script_path = Path(__file__).with_name("implement_finance_plan_ux_v2.py")
source = script_path.read_text()
start_marker = '''replace_between(\n    "gateway/src/finance.ts",\n    "export function financePlanSummary(ledger: FinanceLedger, rawMonth: unknown): FinancePlanSummary {",'''
end_marker = '''replace_once(\n    "gateway/src/finance-mcp.ts",'''
start = source.find(start_marker)
end = source.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("Could not locate financePlanSummary patch block in staging script")

replacement = r"""finance_path = "gateway/src/finance.ts"
finance_text = read(finance_path)
signature = "export function financePlanSummary(ledger: FinanceLedger, rawMonth: unknown): FinancePlanSummary {"
fn_start = finance_text.find(signature)
if fn_start < 0:
    raise SystemExit("Could not find financePlanSummary function")
brace_start = finance_text.find("{", fn_start)
depth = 0
fn_end = -1
for i in range(brace_start, len(finance_text)):
    ch = finance_text[i]
    if ch == "{":
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth == 0:
            fn_end = i + 1
            break
if fn_end < 0:
    raise SystemExit("Could not find end of financePlanSummary function")
new_finance_plan_function = '''export function financePlanSummary(ledger: FinanceLedger, rawMonth: unknown): FinancePlanSummary {
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
}'''
write(finance_path, finance_text[:fn_start] + new_finance_plan_function + finance_text[fn_end:])

"""

fixed_source = source[:start] + replacement + source[end:]
exec(compile(fixed_source, str(script_path), "exec"), {"__file__": str(script_path), "__name__": "__main__"})
