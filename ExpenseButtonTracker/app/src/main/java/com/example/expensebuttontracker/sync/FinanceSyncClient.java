package com.example.expensebuttontracker.sync;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.example.expensebuttontracker.data.ExpenseDbHelper;
import com.example.expensebuttontracker.data.FinanceDuplicateCleaner;
import com.example.expensebuttontracker.data.FinanceArchiveStore;
import com.example.expensebuttontracker.data.FinancePlanStore;
import com.example.expensebuttontracker.widget.BudgetProgressWidget;
import com.example.expensebuttontracker.util.SettingsStore;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Local-first synchronization for the native money tracker.
 *
 * SQLite remains the immediate source of truth on the phone. This client sends
 * a stable-id snapshot to the authenticated ManageMe gateway and then merges
 * the gateway's canonical ledger back into SQLite. It is intentionally small,
 * dependency-free, and never blocks quick add or the UI thread.
 */
public final class FinanceSyncClient {
    private static final String OAUTH_CLIENT_ID = "manageme-web-v1";
    private static final int CONNECT_TIMEOUT_MILLIS = 12_000;
    private static final int READ_TIMEOUT_MILLIS = 25_000;
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);
    private static final AtomicBoolean PENDING = new AtomicBoolean(false);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    public interface Callback {
        void onComplete(boolean synced, String message);
    }

    private FinanceSyncClient() {
    }

    public static void syncAsync(Context context) {
        syncAsync(context, null);
    }

    public static void syncAsync(Context context, Callback callback) {
        Context appContext = context.getApplicationContext();
        if (!SettingsStore.hasFinanceSyncCredentials(appContext)) {
            deliver(callback, false, "Connect ManageMe with GitHub once to enable finance sync.");
            return;
        }
        if (!RUNNING.compareAndSet(false, true)) {
            PENDING.set(true);
            deliver(callback, false, "Finance sync queued behind the current sync.");
            return;
        }

        EXECUTOR.execute(() -> {
            boolean synced = false;
            String message;
            try {
                performSync(appContext);
                synced = true;
                message = "Money data synced with ManageMe.";
            } catch (Exception error) {
                message = safeMessage(error);
                SettingsStore.markFinanceSyncError(appContext, message);
            } finally {
                RUNNING.set(false);
            }
            deliver(callback, synced, message);
            if (PENDING.getAndSet(false)) {
                syncAsync(appContext);
            }
        });
    }

    private static void performSync(Context context) throws Exception {
        String apiUrl = SettingsStore.getFinanceApiUrl(context);
        String refreshToken = SettingsStore.getFinanceRefreshToken(context);
        if (apiUrl.isEmpty() || refreshToken.isEmpty()) {
            throw new IOException("Finance sync is not connected.");
        }

        TokenResponse tokens = refreshAccess(apiUrl, refreshToken);
        if (!tokens.refreshToken.isEmpty()) {
            SettingsStore.updateFinanceRefreshToken(context, tokens.refreshToken);
        }

        FinanceDuplicateCleaner.dedupeExact(context);
        ExpenseDbHelper db = new ExpenseDbHelper(context);
        String payload = FinancePlanStore.decorateSyncPayload(context, FinanceArchiveStore.decorateSyncPayload(db.buildFinanceSyncPayload()));
        JSONObject response = requestJson(
                apiUrl + "/v1/finance/sync",
                "POST",
                "application/json; charset=utf-8",
                payload,
                tokens.accessToken);
        JSONObject ledger = response.getJSONObject("ledger");
        db.applyFinanceLedger(ledger.toString());
        FinanceArchiveStore.applyRemoteLedger(context, ledger.toString());
        FinancePlanStore.applyRemoteLedger(context, ledger.toString());
        BudgetProgressWidget.updateAll(context);
        int duplicatesRemoved = FinanceDuplicateCleaner.dedupeExact(context);
        if (duplicatesRemoved > 0) PENDING.set(true);
        SettingsStore.markFinanceSyncSuccess(context, ledger.optLong("revision", 0L));
    }

    private static TokenResponse refreshAccess(String apiUrl, String refreshToken) throws Exception {
        String body = "grant_type=refresh_token"
                + "&client_id=" + encode(OAUTH_CLIENT_ID)
                + "&refresh_token=" + encode(refreshToken);
        JSONObject response = requestJson(
                apiUrl + "/oauth/token",
                "POST",
                "application/x-www-form-urlencoded; charset=utf-8",
                body,
                "");
        String accessToken = response.optString("access_token", "").trim();
        if (accessToken.isEmpty()) {
            throw new IOException("ManageMe did not return a finance access token.");
        }
        return new TokenResponse(accessToken, response.optString("refresh_token", "").trim());
    }

    private static JSONObject requestJson(
            String url,
            String method,
            String contentType,
            String body,
            String bearer) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
            connection.setReadTimeout(READ_TIMEOUT_MILLIS);
            connection.setDoInput(true);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", contentType);
            connection.setRequestProperty("User-Agent", "ManageMeAndroid/2.2");
            if (bearer != null && !bearer.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + bearer);
            }

            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream stream = connection.getOutputStream()) {
                stream.write(bytes);
            }

            int status = connection.getResponseCode();
            String responseBody = readBody(status >= 200 && status < 300
                    ? connection.getInputStream()
                    : connection.getErrorStream());

            JSONObject json = responseBody.isEmpty() ? new JSONObject() : new JSONObject(responseBody);
            if (status < 200 || status >= 300) {
                String detail = json.optString("error_description",
                        json.optString("message", json.optString("error", "Finance sync failed.")));
                throw new IOException(detail + " (HTTP " + status + ")");
            }
            return json;
        } finally {
            connection.disconnect();
        }
    }

    private static String readBody(InputStream stream) throws IOException {
        if (stream == null) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private static String encode(String value) throws Exception {
        return URLEncoder.encode(value, StandardCharsets.UTF_8.name());
    }

    private static String safeMessage(Exception error) {
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) {
            return "Finance sync failed. Local money data is still safe on this phone.";
        }
        return message.trim();
    }

    private static void deliver(Callback callback, boolean synced, String message) {
        if (callback != null) {
            MAIN.post(() -> callback.onComplete(synced, message));
        }
    }

    private static final class TokenResponse {
        final String accessToken;
        final String refreshToken;

        TokenResponse(String accessToken, String refreshToken) {
            this.accessToken = accessToken;
            this.refreshToken = refreshToken;
        }
    }
}
