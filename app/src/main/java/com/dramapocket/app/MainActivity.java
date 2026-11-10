package com.dramapocket.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;
import java.util.Locale;

/**
 * MainActivity for DramaPocket.
 *
 * Implements a pure Android framework WebView architecture (zero AndroidX bloat),
 * adhering to high security standards:
 * - Local asset base: file:///android_asset/www/index.html
 * - Disabled file cross-origin and universal access
 * - Strict URL allowlisting (only nartodrama.com in live site mode, external browser for others)
 * - Safe SSL error handling (cancels, never proceeds blindly)
 * - Fullscreen video playback via WebChromeClient
 * - Bidirectional back button coordination with the frontend
 */
public class MainActivity extends Activity {

    public static final String APP_URL = "file:///android_asset/www/index.html";
    private static final int REQUEST_CODE_PICK_VIDEO = 1001;

    private WebView webView;
    private LinearLayout liveSiteTopBar;
    private Button btnReturnToApp;
    private TextView txtLiveSiteTitle;
    private FrameLayout customViewContainer;

    private AndroidBridge androidBridge;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private View customView;
    private boolean inLiveSiteMode = false;
    private volatile String currentWebViewUrl = APP_URL;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.activity_main);

        initViews();
        setupWebView();

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void initViews() {
        webView = findViewById(R.id.webView);
        liveSiteTopBar = findViewById(R.id.liveSiteTopBar);
        btnReturnToApp = findViewById(R.id.btnReturnToApp);
        txtLiveSiteTitle = findViewById(R.id.txtLiveSiteTitle);
        customViewContainer = findViewById(R.id.customViewContainer);

        btnReturnToApp.setOnClickListener(v -> exitLiveSiteMode());
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        // Security hardening
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowFileAccess(true); // Required for file:///android_asset/
        settings.setAllowContentAccess(true); // Required for picked SAF video URIs
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        androidBridge = new AndroidBridge(this, webView);
        webView.addJavascriptInterface(androidBridge, "AndroidBridge");

        webView.setWebViewClient(new SafeWebViewClient());
        webView.setWebChromeClient(new FullscreenWebChromeClient());
    }

    /**
     * Thread-safe getter for the current WebView URL.
     * Safe to call from background threads (e.g. JavaBridge thread).
     */
    public String getCurrentWebViewUrl() {
        return currentWebViewUrl;
    }

    /**
     * Enters live site browsing mode with an overlay bar allowing one-tap return to the app.
     */
    public void enterLiveSiteMode(String url) {
        inLiveSiteMode = true;
        currentWebViewUrl = url;
        liveSiteTopBar.setVisibility(View.VISIBLE);
        txtLiveSiteTitle.setText("NartoDrama: " + url);
        webView.loadUrl(url);
    }

    /**
     * Exits live site browsing mode and reloads the local offline-capable application.
     */
    public void exitLiveSiteMode() {
        inLiveSiteMode = false;
        currentWebViewUrl = APP_URL;
        liveSiteTopBar.setVisibility(View.GONE);
        webView.loadUrl(APP_URL);
    }

    /**
     * Launches the system Storage Access Framework picker for local video playback.
     */
    public void launchVideoPicker() {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("video/*");
            startActivityForResult(intent, REQUEST_CODE_PICK_VIDEO);
        } catch (Exception e) {
            Toast.makeText(this, "Video seçici başlatılamadı: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_CODE_PICK_VIDEO && resultCode == RESULT_OK && data != null) {
            Uri selectedUri = data.getData();
            if (selectedUri != null) {
                try {
                    getContentResolver().takePersistableUriPermission(
                            selectedUri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {
                }

                String js = "if (window.onLocalVideoSelected) { window.onLocalVideoSelected("
                        + JSONObject.quote(selectedUri.toString()) + "); }";
                webView.evaluateJavascript(js, null);
            }
        }
    }

    @Override
    public void onBackPressed() {
        // 1. If in custom fullscreen video view, exit fullscreen first
        if (customView != null) {
            if (customViewCallback != null) {
                customViewCallback.onCustomViewHidden();
            }
            return;
        }

        // 2. If in live site browsing mode, handle web navigation or return to app
        if (inLiveSiteMode) {
            if (webView.canGoBack()) {
                webView.goBack();
            } else {
                exitLiveSiteMode();
            }
            return;
        }

        // 3. In local app UI, ask the frontend if it consumed the back event
        webView.evaluateJavascript(
                "(function() { return (typeof window.handleAndroidBack === 'function') ? window.handleAndroidBack() : false; })();",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        // "true" means JS handled back press (modal closed, player stopped, etc.)
                        if (!"true".equalsIgnoreCase(value)) {
                            MainActivity.super.onBackPressed();
                        }
                    }
                }
        );
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    private boolean isNartoDramaHost(String host) {
        if (host == null) {
            return false;
        }
        String lower = host.toLowerCase(Locale.ROOT);
        return lower.equals("nartodrama.com") || lower.equals("www.nartodrama.com") || lower.endsWith(".nartodrama.com");
    }

    private void launchExternalBrowser(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Tarayıcı açılamadı: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Custom WebViewClient enforcing strict URL allowlisting and TLS security.
     */
    private class SafeWebViewClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request != null && request.getUrl() != null) {
                return handleUrl(request.getUrl());
            }
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url != null) {
                return handleUrl(Uri.parse(url));
            }
            return true;
        }

        private boolean handleUrl(Uri uri) {
            if (uri == null) {
                return true;
            }
            String scheme = uri.getScheme();
            if (scheme == null) {
                return true;
            }

            // Local assets: allow within /android_asset/www/
            if ("file".equalsIgnoreCase(scheme)) {
                return !uri.toString().startsWith("file:///android_asset/www/");
            }

            // HTTPS links
            if ("https".equalsIgnoreCase(scheme)) {
                String host = uri.getHost();
                if (isNartoDramaHost(host)) {
                    if (!inLiveSiteMode) {
                        enterLiveSiteMode(uri.toString());
                        return true;
                    }
                    return false; // Load inside WebView
                } else {
                    // External link: open in user's browser
                    launchExternalBrowser(uri);
                    return true;
                }
            }

            // Picked local video content URIs
            if ("content".equalsIgnoreCase(scheme)) {
                return false;
            }

            // Block all other schemes (javascript, file:// outside assets, intent://, market://)
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            if (url != null) {
                currentWebViewUrl = url;
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            // NEVER proceed on SSL certificate errors!
            handler.cancel();
            Toast.makeText(MainActivity.this, R.string.ssl_error_warning, Toast.LENGTH_LONG).show();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (url != null) {
                currentWebViewUrl = url;
                if (url.startsWith("file:///android_asset/www/")) {
                    inLiveSiteMode = false;
                    liveSiteTopBar.setVisibility(View.GONE);
                } else if (isNartoDramaHost(Uri.parse(url).getHost())) {
                    inLiveSiteMode = true;
                    liveSiteTopBar.setVisibility(View.VISIBLE);
                    String title = view.getTitle();
                    if (title != null && !title.isEmpty()) {
                        txtLiveSiteTitle.setText(title);
                    }
                }
            }
        }
    }

    /**
     * WebChromeClient enabling HTML5 fullscreen video playback.
     */
    private class FullscreenWebChromeClient extends WebChromeClient {

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) {
                callback.onCustomViewHidden();
                return;
            }

            customView = view;
            customViewCallback = callback;

            webView.setVisibility(View.GONE);
            liveSiteTopBar.setVisibility(View.GONE);

            customViewContainer.addView(view);
            customViewContainer.setVisibility(View.VISIBLE);

            // Immersive fullscreen mode
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            );
        }

        @Override
        public void onHideCustomView() {
            if (customView == null) {
                return;
            }

            customViewContainer.removeView(customView);
            customViewContainer.setVisibility(View.GONE);
            customView = null;

            webView.setVisibility(View.VISIBLE);
            if (inLiveSiteMode) {
                liveSiteTopBar.setVisibility(View.VISIBLE);
            }

            // Restore system UI
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);

            if (customViewCallback != null) {
                customViewCallback.onCustomViewHidden();
                customViewCallback = null;
            }
        }
    }
}
