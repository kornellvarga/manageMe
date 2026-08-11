package com.example.expensebuttontracker.data;

import android.content.Context;
import android.content.SharedPreferences;

import com.example.expensebuttontracker.util.CurrencyUtils;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Local-first storage for monthly spending envelopes, planned payments and allocations. */
public final class FinancePlanStore {
    private static final String PREFS = "finance_planning_v1";
    private static final String KEY_BUDGETS = "budgets";
    private static final String KEY_COMMITMENTS = "commitments";
    private static final String KEY_ALLOCATIONS = "allocations";
    private static final String WIDGET_PREFIX = "widget_budget_";

    public static final class Budget {
        public final String id;
        public final String name;
        public final String month;
        public final long amountCents;
        public final String currencyCode;
        public final long updatedAtMillis;

        Budget(JSONObject json) {
            id = json.optString("id", "");
            name = json.optString("name", "Budget");
            month = json.optString("month", currentMonth());
            amountCents = json.optLong("amountCents", 0L);
            currencyCode = CurrencyUtils.normalize(json.optString("currencyCode", CurrencyUtils.DEFAULT_CURRENCY));
            updatedAtMillis = json.optLong("updatedAtMillis", 0L);
        }
    }

    public static final class Commitment {
        public final String id;
        public final String name;
        public final String month;
        public final long plannedAmountCents;
        public final String currencyCode;
        public final String category;
        public final String dueDate;
        public final boolean repeatMonthly;
        public final String linkedEntryId;
        public final long updatedAtMillis;

        Commitment(JSONObject json) {
            id = json.optString("id", "");
            name = json.optString("name", "Planned payment");
            month = json.optString("month", currentMonth());
            plannedAmountCents = json.optLong("plannedAmountCents", 0L);
            currencyCode = CurrencyUtils.normalize(json.optString("currencyCode", CurrencyUtils.DEFAULT_CURRENCY));
            category = json.optString("category", "Bills");
            dueDate = json.optString("dueDate", "");
            repeatMonthly = json.optBoolean("repeatMonthly", false);
            linkedEntryId = json.optString("linkedEntryId", "");
            updatedAtMillis = json.optLong("updatedAtMillis", 0L);
        }

        public boolean isPaid() {
            return linkedEntryId != null && !linkedEntryId.isEmpty();
        }
    }

    private FinancePlanStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray readArray(Context context, String key) {
        String raw = prefs(context).getString(key, "[]");
        try {
            return new JSONArray(raw == null ? "[]" : raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static void writeArray(Context context, String key, JSONArray array) {
        prefs(context).edit().putString(key, array.toString()).apply();
    }

    public static String decorateSyncPayload(Context context, String payloadJson) throws JSONException {
        JSONObject root = new JSONObject(payloadJson);
        root.put(KEY_BUDGETS, readArray(context, KEY_BUDGETS));
        root.put(KEY_COMMITMENTS, readArray(context, KEY_COMMITMENTS));
        root.put(KEY_ALLOCATIONS, readArray(context, KEY_ALLOCATIONS));
        return root.toString();
    }

    public static void applyRemoteLedger(Context context, String ledgerJson) throws JSONException {
        JSONObject ledger = new JSONObject(ledgerJson);
        SharedPreferences.Editor editor = prefs(context).edit();
        if (ledger.has(KEY_BUDGETS)) editor.putString(KEY_BUDGETS, ledger.optJSONArray(KEY_BUDGETS).toString());
        if (ledger.has(KEY_COMMITMENTS)) editor.putString(KEY_COMMITMENTS, ledger.optJSONArray(KEY_COMMITMENTS).toString());
        if (ledger.has(KEY_ALLOCATIONS)) editor.putString(KEY_ALLOCATIONS, ledger.optJSONArray(KEY_ALLOCATIONS).toString());
        editor.apply();
    }

    public static String currentMonth() {
        Calendar calendar = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d", calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1);
    }

    public static String shiftMonth(String month, int delta) {
        String[] parts = month.split("-");
        Calendar calendar = Calendar.getInstance();
        calendar.clear();
        calendar.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, 1);
        calendar.add(Calendar.MONTH, delta);
        return String.format(Locale.US, "%04d-%02d", calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH) + 1);
    }

    public static List<Budget> listBudgets(Context context, String month) {
        ArrayList<Budget> result = new ArrayList<>();
        JSONArray array = readArray(context, KEY_BUDGETS);
        for (int i = 0; i < array.length(); i++) {
            JSONObject json = array.optJSONObject(i);
            if (json == null || json.has("deletedAtMillis")) continue;
            Budget budget = new Budget(json);
            if (month.equals(budget.month)) result.add(budget);
        }
        result.sort(Comparator.comparing(budget -> budget.name.toLowerCase(Locale.ROOT)));
        return result;
    }

    public static List<Commitment> listCommitments(Context context, String month) {
        ArrayList<Commitment> result = new ArrayList<>();
        JSONArray array = readArray(context, KEY_COMMITMENTS);
        for (int i = 0; i < array.length(); i++) {
            JSONObject json = array.optJSONObject(i);
            if (json == null || json.has("deletedAtMillis")) continue;
            Commitment commitment = new Commitment(json);
            if (month.equals(commitment.month)) result.add(commitment);
        }
        result.sort(Comparator.comparing(commitment -> commitment.dueDate.isEmpty() ? "9999-99-99" : commitment.dueDate));
        return result;
    }

    public static Budget getBudget(Context context, String id) {
        if (id == null || id.isEmpty()) return null;
        JSONArray array = readArray(context, KEY_BUDGETS);
        for (int i = 0; i < array.length(); i++) {
            JSONObject json = array.optJSONObject(i);
            if (json != null && id.equals(json.optString("id")) && !json.has("deletedAtMillis")) return new Budget(json);
        }
        return null;
    }

    public static Commitment getCommitment(Context context, String id) {
        if (id == null || id.isEmpty()) return null;
        JSONArray array = readArray(context, KEY_COMMITMENTS);
        for (int i = 0; i < array.length(); i++) {
            JSONObject json = array.optJSONObject(i);
            if (json != null && id.equals(json.optString("id")) && !json.has("deletedAtMillis")) return new Commitment(json);
        }
        return null;
    }

    public static Budget findDefaultBudget(Context context, String month) {
        List<Budget> budgets = listBudgets(context, month);
        for (Budget budget : budgets) {
            if ("pocket money".equalsIgnoreCase(budget.name)) return budget;
        }
        return budgets.isEmpty() ? null : budgets.get(0);
    }

    public static void saveBudget(Context context, String id, String name, String month, long amountCents, String currencyCode) throws JSONException {
        if (name == null || name.trim().isEmpty()) throw new IllegalArgumentException("Budget name is required.");
        if (amountCents <= 0L) throw new IllegalArgumentException("Budget amount must be greater than zero.");
        String normalized = CurrencyUtils.normalize(currencyCode);
        JSONArray array = readArray(context, KEY_BUDGETS);
        JSONObject item = findOrCreate(array, id, "budget");
        long now = System.currentTimeMillis();
        item.put("name", name.trim());
        item.put("month", month);
        item.put("amountCents", amountCents);
        item.put("currencyCode", normalized);
        item.put("updatedAtMillis", now);
        item.remove("deletedAtMillis");
        writeArray(context, KEY_BUDGETS, array);
    }

    public static void deleteBudget(Context context, String id) throws JSONException {
        softDelete(context, KEY_BUDGETS, id);
    }

    public static void saveCommitment(Context context, String id, String name, String month, long amountCents, String currencyCode, String category, String dueDate, boolean repeatMonthly) throws JSONException {
        if (name == null || name.trim().isEmpty()) throw new IllegalArgumentException("Payment name is required.");
        if (amountCents <= 0L) throw new IllegalArgumentException("Planned amount must be greater than zero.");
        JSONArray array = readArray(context, KEY_COMMITMENTS);
        JSONObject item = findOrCreate(array, id, "commitment");
        long now = System.currentTimeMillis();
        item.put("name", name.trim());
        item.put("month", month);
        item.put("plannedAmountCents", amountCents);
        item.put("currencyCode", CurrencyUtils.normalize(currencyCode));
        item.put("category", category == null || category.trim().isEmpty() ? "Bills" : category.trim());
        if (dueDate == null || dueDate.trim().isEmpty()) item.remove("dueDate"); else item.put("dueDate", dueDate.trim());
        item.put("repeatMonthly", repeatMonthly);
        item.put("updatedAtMillis", now);
        item.remove("deletedAtMillis");
        writeArray(context, KEY_COMMITMENTS, array);
    }

    public static void deleteCommitment(Context context, String id) throws JSONException {
        softDelete(context, KEY_COMMITMENTS, id);
    }

    public static void allocateEntry(Context context, String entrySyncId, String budgetId, long amountCents, String entryCurrency) throws JSONException {
        if (entrySyncId == null || entrySyncId.isEmpty() || budgetId == null || budgetId.isEmpty()) return;
        Budget budget = getBudget(context, budgetId);
        if (budget == null) throw new IllegalArgumentException("Budget no longer exists.");
        if (!budget.currencyCode.equals(CurrencyUtils.normalize(entryCurrency))) throw new IllegalArgumentException("Expense and budget currencies must match.");
        JSONArray array = readArray(context, KEY_ALLOCATIONS);
        JSONObject item = null;
        for (int i = 0; i < array.length(); i++) {
            JSONObject candidate = array.optJSONObject(i);
            if (candidate != null && entrySyncId.equals(candidate.optString("entryId")) && budgetId.equals(candidate.optString("budgetId"))) {
                item = candidate;
                break;
            }
        }
        if (item == null) {
            item = new JSONObject();
            item.put("id", newId("allocation"));
            array.put(item);
        }
        item.put("entryId", entrySyncId);
        item.put("budgetId", budgetId);
        item.put("amountCents", amountCents);
        item.put("updatedAtMillis", System.currentTimeMillis());
        item.remove("deletedAtMillis");
        writeArray(context, KEY_ALLOCATIONS, array);
    }

    public static void linkCommitment(Context context, String commitmentId, String entrySyncId, String entryCurrency) throws JSONException {
        if (commitmentId == null || commitmentId.isEmpty()) return;
        JSONArray array = readArray(context, KEY_COMMITMENTS);
        for (int i = 0; i < array.length(); i++) {
            JSONObject item = array.optJSONObject(i);
            if (item == null || !commitmentId.equals(item.optString("id"))) continue;
            String plannedCurrency = CurrencyUtils.normalize(item.optString("currencyCode", CurrencyUtils.DEFAULT_CURRENCY));
            if (!plannedCurrency.equals(CurrencyUtils.normalize(entryCurrency))) throw new IllegalArgumentException("Payment and planned bill currencies must match.");
            item.put("linkedEntryId", entrySyncId);
            item.put("updatedAtMillis", System.currentTimeMillis());
            writeArray(context, KEY_COMMITMENTS, array);
            return;
        }
        throw new IllegalArgumentException("Planned payment no longer exists.");
    }

    public static void removeEntryReferences(Context context, String entrySyncId) throws JSONException {
        if (entrySyncId == null || entrySyncId.isEmpty()) return;
        long now = System.currentTimeMillis();
        JSONArray allocations = readArray(context, KEY_ALLOCATIONS);
        for (int i = 0; i < allocations.length(); i++) {
            JSONObject item = allocations.optJSONObject(i);
            if (item != null && entrySyncId.equals(item.optString("entryId")) && !item.has("deletedAtMillis")) {
                item.put("deletedAtMillis", now);
                item.put("updatedAtMillis", now);
            }
        }
        writeArray(context, KEY_ALLOCATIONS, allocations);
        JSONArray commitments = readArray(context, KEY_COMMITMENTS);
        for (int i = 0; i < commitments.length(); i++) {
            JSONObject item = commitments.optJSONObject(i);
            if (item != null && entrySyncId.equals(item.optString("linkedEntryId"))) {
                item.remove("linkedEntryId");
                item.put("updatedAtMillis", now);
            }
        }
        writeArray(context, KEY_COMMITMENTS, commitments);
    }

    public static long spentCents(Context context, String budgetId) {
        long total = 0L;
        JSONArray allocations = readArray(context, KEY_ALLOCATIONS);
        for (int i = 0; i < allocations.length(); i++) {
            JSONObject item = allocations.optJSONObject(i);
            if (item != null && !item.has("deletedAtMillis") && budgetId.equals(item.optString("budgetId"))) total += item.optLong("amountCents", 0L);
        }
        return total;
    }

    public static void setWidgetBudgetId(Context context, int appWidgetId, String budgetId) {
        prefs(context).edit().putString(WIDGET_PREFIX + appWidgetId, budgetId == null ? "" : budgetId).apply();
    }

    public static Budget resolveWidgetBudget(Context context, int appWidgetId) {
        String selected = prefs(context).getString(WIDGET_PREFIX + appWidgetId, "");
        Budget explicit = getBudget(context, selected);
        return explicit != null ? explicit : findDefaultBudget(context, currentMonth());
    }

    public static void clearWidget(Context context, int appWidgetId) {
        prefs(context).edit().remove(WIDGET_PREFIX + appWidgetId).apply();
    }

    private static JSONObject findOrCreate(JSONArray array, String id, String prefix) throws JSONException {
        if (id != null && !id.isEmpty()) {
            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.optJSONObject(i);
                if (item != null && id.equals(item.optString("id"))) return item;
            }
        }
        JSONObject created = new JSONObject();
        created.put("id", newId(prefix));
        array.put(created);
        return created;
    }

    private static void softDelete(Context context, String key, String id) throws JSONException {
        JSONArray array = readArray(context, key);
        long now = System.currentTimeMillis();
        for (int i = 0; i < array.length(); i++) {
            JSONObject item = array.optJSONObject(i);
            if (item != null && id.equals(item.optString("id"))) {
                item.put("deletedAtMillis", now);
                item.put("updatedAtMillis", now);
                break;
            }
        }
        writeArray(context, key, array);
    }

    private static String newId(String prefix) {
        return prefix + "_" + UUID.randomUUID().toString().replace("-", "").toLowerCase(Locale.ROOT);
    }
}
