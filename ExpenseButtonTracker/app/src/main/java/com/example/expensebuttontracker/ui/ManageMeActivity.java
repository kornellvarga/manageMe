package com.example.expensebuttontracker.ui;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import com.example.expensebuttontracker.R;

/**
 * Thin Android home for the same ManageMe web client used on GitHub Pages.
 * OAuth tokens stay inside this app's WebView storage; no GitHub credential is
 * compiled into the APK.
 */
public final class ManageMeActivity extends Activity {
    private WebView webView;
    private ProgressBar progress;
    private LinearLayout unavailable;
    private boolean pageLoaded;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        configureWebView();
        webView.loadUrl(getString(R.string.manage_me_url));
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(getColorCompat(R.color.app_background));

        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(16), dp(4), dp(8), dp(4));
        toolbar.setBackgroundColor(getColorCompat(R.color.surface));

        TextView title = new TextView(this);
        title.setText(R.string.app_name);
        title.setTextColor(getColorCompat(R.color.text_primary));
        title.setTextSize(20);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(52), 1f));

        Button money = new Button(this);
        money.setAllCaps(false);
        money.setText(R.string.money_tracker_name);
        money.setTextColor(getColorCompat(R.color.text_primary));
        money.setBackgroundResource(R.drawable.rounded_button_secondary);
        money.setOnClickListener(view -> startActivity(new Intent(this, MainActivity.class)));
        toolbar.addView(money, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(44)));
        root.addView(toolbar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(60)));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(2)));

        FrameLayout content = new FrameLayout(this);
        webView = new WebView(this);
        content.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        unavailable = new LinearLayout(this);
        unavailable.setOrientation(LinearLayout.VERTICAL);
        unavailable.setGravity(Gravity.CENTER);
        unavailable.setPadding(dp(28), dp(28), dp(28), dp(28));
        unavailable.setBackgroundColor(getColorCompat(R.color.app_background));
        unavailable.setVisibility(View.GONE);

        TextView offlineTitle = new TextView(this);
        offlineTitle.setText("ManageMe is offline");
        offlineTitle.setTextColor(getColorCompat(R.color.text_primary));
        offlineTitle.setTextSize(22);
        offlineTitle.setTypeface(Typeface.DEFAULT_BOLD);
        offlineTitle.setGravity(Gravity.CENTER);
        unavailable.addView(offlineTitle);

        TextView offlineHelp = new TextView(this);
        offlineHelp.setText("Reconnect and retry. Captures already saved in ManageMe remain on this phone.");
        offlineHelp.setTextColor(getColorCompat(R.color.text_secondary));
        offlineHelp.setTextSize(15);
        offlineHelp.setGravity(Gravity.CENTER);
        offlineHelp.setPadding(0, dp(8), 0, dp(16));
        unavailable.addView(offlineHelp);

        Button retry = new Button(this);
        retry.setAllCaps(false);
        retry.setText("Retry");
        retry.setTextColor(getColorCompat(android.R.color.white));
        retry.setBackgroundResource(R.drawable.rounded_button);
        retry.setOnClickListener(view -> {
            unavailable.setVisibility(View.GONE);
            webView.reload();
        });
        unavailable.addView(retry, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)));
        content.addView(unavailable, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        root.addView(content, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " ManageMeAndroid/1");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
                progress.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternalScheme(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
                unavailable.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && !pageLoaded) unavailable.setVisibility(View.VISIBLE);
            }
        });
    }

    private boolean openExternalScheme(Uri uri) {
        String scheme = uri.getScheme();
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No app can open this link.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }
        super.onDestroy();
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private int getColorCompat(int resource) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) return getColor(resource);
        return getResources().getColor(resource);
    }
}
