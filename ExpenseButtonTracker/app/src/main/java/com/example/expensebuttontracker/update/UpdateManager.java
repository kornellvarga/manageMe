package com.example.expensebuttontracker.update;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import com.example.expensebuttontracker.BuildConfig;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.net.ssl.HttpsURLConnection;

/**
 * Checks the signed GitHub Pages release manifest whenever ManageMe opens.
 *
 * A newer APK is downloaded to private cache, SHA-256 checked, validated for
 * the same package and advertised version, and handed to Android's installer.
 * Android intentionally requires the user to confirm the final installation.
 */
public final class UpdateManager {
    private static final String UPDATE_MANIFEST_URL =
            "https://kornellvarga.github.io/manageMe/update.json";
    private static final String TRUSTED_HOST = "kornellvarga.github.io";
    private static final String TRUSTED_APK_PATH = "/manageMe/ManageMe.apk";
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final String PREFS = "manageme_updates";
    private static final String KEY_PENDING_PATH = "pending_path";
    private static final String KEY_PENDING_VERSION = "pending_version";
    private static final long MAX_APK_BYTES = 100L * 1024L * 1024L;
    private static final int CONNECT_TIMEOUT_MILLIS = 15_000;
    private static final int READ_TIMEOUT_MILLIS = 45_000;

    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final AtomicBoolean CHECKING = new AtomicBoolean(false);
    private static final AtomicBoolean DOWNLOADING = new AtomicBoolean(false);
    private static final AtomicBoolean INSTALLER_LAUNCHED = new AtomicBoolean(false);

    private UpdateManager() {
    }

    public static void checkForUpdates(Activity activity) {
        if (!isUsable(activity)) return;
        if (hasPendingUpdate(activity)) {
            resumePendingInstall(activity);
            return;
        }
        if (!CHECKING.compareAndSet(false, true)) return;

        Context appContext = activity.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                JSONObject manifest = fetchJson(
                        UPDATE_MANIFEST_URL + "?installed=" + BuildConfig.VERSION_CODE
                                + "&t=" + System.currentTimeMillis());
                int versionCode = manifest.getInt("versionCode");
                if (versionCode <= BuildConfig.VERSION_CODE) {
                    clearCompletedPending(appContext);
                    return;
                }
                String versionName = manifest.optString("versionName", String.valueOf(versionCode));
                String apkUrl = manifest.getString("apkUrl");
                String sha256 = manifest.getString("sha256").trim().toLowerCase(Locale.ROOT);
                validateManifest(apkUrl, sha256);
                downloadUpdate(activity, versionCode, versionName, apkUrl, sha256);
            } catch (Exception error) {
                // Update checks are deliberately quiet so an offline release server never blocks the app.
            } finally {
                CHECKING.set(false);
            }
        });
    }

    public static void resumePendingInstall(Activity activity) {
        if (!isUsable(activity) || INSTALLER_LAUNCHED.get()) return;
        SharedPreferences prefs = prefs(activity);
        int pendingVersion = prefs.getInt(KEY_PENDING_VERSION, 0);
        String pendingPath = prefs.getString(KEY_PENDING_PATH, "");
        if (pendingVersion <= BuildConfig.VERSION_CODE) {
            clearPending(activity);
            return;
        }
        File apk = pendingPath == null || pendingPath.isEmpty() ? null : new File(pendingPath);
        if (apk == null || !apk.isFile()) {
            clearPending(activity);
            return;
        }
        launchInstaller(activity, apk);
    }

    private static void downloadUpdate(
            Activity activity,
            int versionCode,
            String versionName,
            String apkUrl,
            String expectedSha256) throws Exception {
        if (!DOWNLOADING.compareAndSet(false, true)) return;
        MAIN.post(() -> {
            if (isUsable(activity)) {
                Toast.makeText(activity,
                        "Downloading ManageMe " + versionName + " update…",
                        Toast.LENGTH_LONG).show();
            }
        });

        try {
            File directory = new File(activity.getCacheDir(), "updates");
            if (!directory.exists() && !directory.mkdirs()) {
                throw new IOException("Could not create update cache.");
            }
            File partial = new File(directory, "ManageMe-" + versionCode + ".apk.part");
            File complete = new File(directory, "ManageMe-" + versionCode + ".apk");
            if (partial.exists()) partial.delete();
            if (complete.exists()) complete.delete();

            download(apkUrl, partial);
            String actualSha256 = sha256(partial);
            if (!expectedSha256.equals(actualSha256)) {
                partial.delete();
                throw new IOException("Downloaded update failed integrity verification.");
            }
            validateApk(activity, partial, versionCode);
            if (!partial.renameTo(complete)) {
                copy(partial, complete);
                partial.delete();
            }

            prefs(activity).edit()
                    .putString(KEY_PENDING_PATH, complete.getAbsolutePath())
                    .putInt(KEY_PENDING_VERSION, versionCode)
                    .apply();

            MAIN.post(() -> {
                if (isUsable(activity)) launchInstaller(activity, complete);
            });
        } catch (Exception error) {
            MAIN.post(() -> {
                if (isUsable(activity)) {
                    Toast.makeText(activity,
                            "ManageMe update failed. The current app is unchanged.",
                            Toast.LENGTH_LONG).show();
                }
            });
            throw error;
        } finally {
            DOWNLOADING.set(false);
        }
    }

    private static void launchInstaller(Activity activity, File apk) {
        if (!isUsable(activity) || INSTALLER_LAUNCHED.get()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !activity.getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(activity,
                    "Allow updates from ManageMe, then return to the app.",
                    Toast.LENGTH_LONG).show();
            Intent permission = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName()));
            activity.startActivity(permission);
            return;
        }

        Uri uri = FileProvider.getUriForFile(
                activity,
                activity.getPackageName() + ".updates",
                apk);
        Intent install = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, APK_MIME)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            INSTALLER_LAUNCHED.set(true);
            activity.startActivity(install);
        } catch (Exception error) {
            INSTALLER_LAUNCHED.set(false);
            Toast.makeText(activity,
                    "Android could not open the ManageMe update installer.",
                    Toast.LENGTH_LONG).show();
        }
    }

    private static JSONObject fetchJson(String url) throws Exception {
        HttpsURLConnection connection = open(url);
        try {
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-cache, no-store");
            connection.setUseCaches(false);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IOException("Update server returned HTTP " + status + ".");
            }
            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            return new JSONObject(body.toString());
        } finally {
            connection.disconnect();
        }
    }

    private static void download(String url, File destination) throws Exception {
        HttpsURLConnection connection = open(url);
        try {
            connection.setRequestProperty("Accept", APK_MIME);
            connection.setRequestProperty("Cache-Control", "no-cache, no-store");
            connection.setUseCaches(false);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IOException("APK server returned HTTP " + status + ".");
            }
            long declaredLength = connection.getContentLengthLong();
            if (declaredLength > MAX_APK_BYTES) throw new IOException("APK is unexpectedly large.");

            long total = 0L;
            byte[] buffer = new byte[32 * 1024];
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream output = new FileOutputStream(destination)) {
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > MAX_APK_BYTES) throw new IOException("APK exceeded the size limit.");
                    output.write(buffer, 0, read);
                }
                output.getFD().sync();
            }
            if (total <= 0L) throw new IOException("Downloaded APK is empty.");
        } finally {
            connection.disconnect();
        }
    }

    private static HttpsURLConnection open(String url) throws Exception {
        URL parsed = new URL(url);
        if (!"https".equalsIgnoreCase(parsed.getProtocol())) {
            throw new IOException("Update URL must use HTTPS.");
        }
        HttpsURLConnection connection = (HttpsURLConnection) parsed.openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
        connection.setReadTimeout(READ_TIMEOUT_MILLIS);
        connection.setInstanceFollowRedirects(true);
        connection.setRequestProperty("User-Agent", "ManageMeAndroid/" + BuildConfig.VERSION_NAME);
        return connection;
    }

    private static void validateManifest(String apkUrl, String sha256) throws Exception {
        Uri uri = Uri.parse(apkUrl);
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || !TRUSTED_HOST.equalsIgnoreCase(uri.getHost())
                || !TRUSTED_APK_PATH.equals(uri.getPath())) {
            throw new IOException("Update manifest contains an untrusted APK URL.");
        }
        if (!sha256.matches("[0-9a-f]{64}")) {
            throw new IOException("Update manifest contains an invalid SHA-256 value.");
        }
    }

    @SuppressWarnings("deprecation")
    private static void validateApk(Context context, File apk, int expectedVersionCode) throws Exception {
        PackageManager manager = context.getPackageManager();
        PackageInfo info = manager.getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (info == null || !context.getPackageName().equals(info.packageName)) {
            throw new IOException("Downloaded APK belongs to a different application.");
        }
        long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
        if (versionCode != expectedVersionCode || versionCode <= BuildConfig.VERSION_CODE) {
            throw new IOException("Downloaded APK version does not match the release manifest.");
        }
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[32 * 1024];
        try (FileInputStream input = new FileInputStream(file)) {
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        StringBuilder result = new StringBuilder(64);
        for (byte value : digest.digest()) result.append(String.format(Locale.ROOT, "%02x", value));
        return result.toString();
    }

    private static void copy(File source, File destination) throws IOException {
        byte[] buffer = new byte[32 * 1024];
        try (FileInputStream input = new FileInputStream(source);
             FileOutputStream output = new FileOutputStream(destination)) {
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            output.getFD().sync();
        }
    }

    private static boolean hasPendingUpdate(Context context) {
        int pendingVersion = prefs(context).getInt(KEY_PENDING_VERSION, 0);
        String pendingPath = prefs(context).getString(KEY_PENDING_PATH, "");
        return pendingVersion > BuildConfig.VERSION_CODE
                && pendingPath != null
                && !pendingPath.isEmpty()
                && new File(pendingPath).isFile();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void clearCompletedPending(Context context) {
        SharedPreferences preferences = prefs(context);
        if (preferences.getInt(KEY_PENDING_VERSION, 0) <= BuildConfig.VERSION_CODE) {
            clearPending(context);
        }
    }

    private static void clearPending(Context context) {
        String path = prefs(context).getString(KEY_PENDING_PATH, "");
        if (path != null && !path.isEmpty()) {
            File file = new File(path);
            if (file.isFile()) file.delete();
        }
        prefs(context).edit().remove(KEY_PENDING_PATH).remove(KEY_PENDING_VERSION).apply();
        INSTALLER_LAUNCHED.set(false);
    }

    private static boolean isUsable(Activity activity) {
        return activity != null
                && !activity.isFinishing()
                && (Build.VERSION.SDK_INT < Build.VERSION_CODES.JELLY_BEAN_MR1 || !activity.isDestroyed());
    }
}
