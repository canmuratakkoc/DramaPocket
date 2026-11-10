package com.dramapocket.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
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
import android.widget.RelativeLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;
import java.util.Locale;

/**
 * MainActivity for DramaPocket.
 *
 * Implements a pure Android framework Dual-WebView architecture (zero AndroidX bloat)
 * with strict bridge isolation, popup window management, and comprehensive navigation security:
 *
 * 1. Dual-WebView Bridge Isolation:
 *    - webView (appWebView): Loads ONLY file:///android_asset/www/index.html.
 *      Exposes window.AndroidBridge. Never navigates to external HTTP/HTTPS hosts.
 *    - siteWebView: Used exclusively for live NartoDrama site navigation and episode streaming.
 *      Has ZERO JavascriptInterface attachments. Sanitizes User-Agent by stripping '; wv'
 *      and 'Version/4.0' to prevent detection by NartoDrama wrapper-guards.
 *
 * 2. In-App Popup Window Management:
 *    - FullscreenWebChromeClient.onCreateWindow strictly blocks non-user-gesture popups (!isUserGesture).
 *    - User-gesture popups (e.g. ad-gate verification buttons) are presented in a dismissible
 *      in-app overlay container (popupContainer) without JavascriptInterface and with sanitized UA,
 *      allowing ad interactions to register with window.opener while keeping external Chrome closed.
 *    - If popup targets allowlisted NartoDrama hosts, it navigates siteWebView directly.
 *
 * 3. Safe URL Interception & Navigation:
 *    - Allows allowlisted domains: nartodrama.com, narto-drama.com, nartodrama-api.online.
 *    - Blocks dangerous schemes (intent://, market://, javascript:, file:// outside assets).
 *    - Never proceeds blindly on SSL certificate errors (explicit handler.cancel()).
 *    - Does NOT automatically redirect unknown URLs or subframes to external Chrome.
 *
 * 4. 4-Stage Back Button Coordination:
 *    - Stage 1: Fullscreen video (customView) -> exit fullscreen.
 *    - Stage 2: In-app popup overlay (popupContainer visible) -> dismiss popup.
 *    - Stage 3: Live site mode (inLiveSiteMode) -> history back or exit live site mode.
 *    - Stage 4: App UI -> evaluate window.handleAndroidBack() in frontend JavaScript.
 */
public class MainActivity extends Activity {

    public static final String APP_URL = "file:///android_asset/www/index.html";
    private static final int REQUEST_CODE_PICK_VIDEO = 1001;

    // View Components
    private WebView webView;
    private WebView siteWebView;
    private LinearLayout liveSiteTopBar;
    private Button btnReturnToApp;
    private TextView txtLiveSiteTitle;

    // In-App Popup Overlay Components
    private RelativeLayout popupContainer;
    private TextView txtPopupTitle;
    private Button btnClosePopup;
    private FrameLayout popupWebViewHolder;
    private WebView popupWebView;

    // Fullscreen Video Components
    private FrameLayout customViewContainer;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private View customView;

    // State & Bridge
    private AndroidBridge androidBridge;
    private boolean inLiveSiteMode = false;
    private volatile String currentWebViewUrl = APP_URL;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.activity_main);

        initViews();
        setupWebViews();

        if (savedInstanceState == null) {
            webView.loadUrl(APP_URL);
        } else {
            inLiveSiteMode = savedInstanceState.getBoolean("inLiveSiteMode", false);
            if (inLiveSiteMode) {
                siteWebView.restoreState(savedInstanceState);
                siteWebView.setVisibility(View.VISIBLE);
                liveSiteTopBar.setVisibility(View.VISIBLE);
                webView.setVisibility(View.GONE);
            } else {
                webView.restoreState(savedInstanceState);
            }
        }
    }

    private void initViews() {
        webView = findViewById(R.id.webView);
        siteWebView = findViewById(R.id.siteWebView);
        liveSiteTopBar = findViewById(R.id.liveSiteTopBar);
        btnReturnToApp = findViewById(R.id.btnReturnToApp);
        txtLiveSiteTitle = findViewById(R.id.txtLiveSiteTitle);

        popupContainer = findViewById(R.id.popupContainer);
        txtPopupTitle = findViewById(R.id.txtPopupTitle);
        btnClosePopup = findViewById(R.id.btnClosePopup);
        popupWebViewHolder = findViewById(R.id.popupWebViewHolder);
        customViewContainer = findViewById(R.id.customViewContainer);

        btnReturnToApp.setOnClickListener(v -> exitLiveSiteMode());
        btnClosePopup.setOnClickListener(v -> closePopup());
    }

    private void setupWebViews() {
        // Universal Cookie Configuration
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
            cookieManager.setAcceptThirdPartyCookies(siteWebView, true);
        }

        // 1. Primary App WebView (Local SPA with AndroidBridge)
        WebSettings appSettings = webView.getSettings();
        appSettings.setJavaScriptEnabled(true);
        appSettings.setDomStorageEnabled(true);
        appSettings.setDatabaseEnabled(true);
        appSettings.setMediaPlaybackRequiresUserGesture(false);

        // Security hardening
        appSettings.setAllowFileAccessFromFileURLs(false);
        appSettings.setAllowUniversalAccessFromFileURLs(false);
        appSettings.setAllowFileAccess(true); // Required for file:///android_asset/
        appSettings.setAllowContentAccess(true); // Required for picked SAF video URIs
        appSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        androidBridge = new AndroidBridge(this, webView);
        webView.addJavascriptInterface(androidBridge, "AndroidBridge");

        webView.setWebViewClient(new SafeWebViewClient());
        webView.setWebChromeClient(new FullscreenWebChromeClient());

        // 2. Site WebView (Live site player - 100% Bridge Isolated)
        WebSettings siteSettings = siteWebView.getSettings();
        siteSettings.setJavaScriptEnabled(true);
        siteSettings.setDomStorageEnabled(true);
        siteSettings.setDatabaseEnabled(true);
        siteSettings.setMediaPlaybackRequiresUserGesture(false);

        // Security hardening for external web
        siteSettings.setAllowFileAccessFromFileURLs(false);
        siteSettings.setAllowUniversalAccessFromFileURLs(false);
        siteSettings.setAllowFileAccess(false); // No access to local file assets
        siteSettings.setAllowContentAccess(false);
        siteSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // Enable popup management
        siteSettings.setSupportMultipleWindows(true);
        siteSettings.setJavaScriptCanOpenWindowsAutomatically(false);

        // Sanitize User-Agent: strip '; wv' and 'Version/4.0 ' so nartodrama.com
        // treats the webview as standard mobile Chrome and does NOT trigger /open-in-browser
        String defaultUa = siteSettings.getUserAgentString();
        if (defaultUa != null) {
            String cleanUa = defaultUa.replace("; wv", "").replace("Version/4.0 ", "");
            siteSettings.setUserAgentString(cleanUa);
        }

        // NOTE: siteWebView has ZERO addJavascriptInterface calls!
        siteWebView.setWebViewClient(new SiteWebViewClient());
        siteWebView.setWebChromeClient(new FullscreenWebChromeClient());
    }

    /**
     * Thread-safe getter for the current WebView URL.
     * Safe to call from background threads (e.g. JavaBridge thread).
     */
    public String getCurrentWebViewUrl() {
        return currentWebViewUrl;
    }

    /**
     * Checks whether a host belongs strictly to nartodrama.com, narto-drama.com,
     * nartodrama-api.online or their subdomains.
     */
    public static boolean isAllowedSiteHost(String host) {
        if (host == null) {
            return false;
        }
        String lower = host.toLowerCase(Locale.ROOT);
        return lower.equals("nartodrama.com") || lower.endsWith(".nartodrama.com")
                || lower.equals("narto-drama.com") || lower.endsWith(".narto-drama.com")
                || lower.equals("nartodrama-api.online") || lower.endsWith(".nartodrama-api.online");
    }

    /**
     * Backward-compatible alias for isAllowedSiteHost.
     */
    public boolean isNartoDramaHost(String host) {
        return isAllowedSiteHost(host);
    }

    /**
     * Enters live site browsing mode with an overlay bar allowing one-tap return to the app.
     * Preserves the local app webView in background with its DOM state intact.
     */
    public void enterLiveSiteMode(String url) {
        inLiveSiteMode = true;
        liveSiteTopBar.setVisibility(View.VISIBLE);
        txtLiveSiteTitle.setText("NartoDrama: " + url);
        webView.setVisibility(View.GONE);
        siteWebView.setVisibility(View.VISIBLE);
        siteWebView.loadUrl(url);
    }

    /**
     * Exits live site browsing mode and restores the local offline-capable application.
     */
    public void exitLiveSiteMode() {
        inLiveSiteMode = false;
        closePopup();
        siteWebView.stopLoading();
        siteWebView.loadUrl("about:blank");
        siteWebView.setVisibility(View.GONE);
        liveSiteTopBar.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
    }

    /**
     * Closes and dismantles any active in-app popup overlay WebView.
     */
    public void closePopup() {
        if (popupContainer != null) {
            popupContainer.setVisibility(View.GONE);
        }
        if (popupWebViewHolder != null) {
            popupWebViewHolder.removeAllViews();
        }
        if (popupWebView != null) {
            popupWebView.stopLoading();
            popupWebView.loadUrl("about:blank");
            popupWebView.destroy();
            popupWebView = null;
        }
    }

    /**
     * Explicitly launches external browser for a validated HTTPS URL.
     */
    public void launchExternalBrowser(Uri uri) {
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
        // Stage 1: If in custom fullscreen video view, exit fullscreen first
        if (customView != null) {
            if (customViewCallback != null) {
                customViewCallback.onCustomViewHidden();
            }
            return;
        }

        // Stage 2: If in-app popup overlay is visible, close popup overlay
        if (popupContainer != null && popupContainer.getVisibility() == View.VISIBLE) {
            closePopup();
            return;
        }

        // Stage 3: If in live site browsing mode, handle web navigation or return to app
        if (inLiveSiteMode) {
            if (siteWebView != null && siteWebView.canGoBack()) {
                siteWebView.goBack();
            } else {
                exitLiveSiteMode();
            }
            return;
        }

        // Stage 4: In local app UI, ask the frontend if it consumed the back event
        if (webView != null) {
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
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
        if (siteWebView != null) {
            siteWebView.onResume();
        }
        if (popupWebView != null) {
            popupWebView.onResume();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        if (siteWebView != null) {
            siteWebView.onPause();
        }
        if (popupWebView != null) {
            popupWebView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        closePopup();
        if (siteWebView != null) {
            siteWebView.destroy();
        }
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
        if (siteWebView != null && inLiveSiteMode) {
            siteWebView.saveState(outState);
        }
        outState.putBoolean("inLiveSiteMode", inLiveSiteMode);
    }

    /**
     * Primary App WebView Client: Confines webView to local assets and content URIs.
     * Dispatches external NartoDrama navigation to live site mode without invoking external Chrome.
     */
    private class SafeWebViewClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request != null && request.getUrl() != null) {
                return handleAppUrl(request.getUrl(), request.isForMainFrame());
            }
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url != null) {
                return handleAppUrl(Uri.parse(url), true);
            }
            return true;
        }

        private boolean handleAppUrl(Uri uri, boolean isForMainFrame) {
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

            // Picked local video content URIs
            if ("content".equalsIgnoreCase(scheme)) {
                return false;
            }

            // HTTPS links
            if ("https".equalsIgnoreCase(scheme)) {
                if (isForMainFrame) {
                    String host = uri.getHost();
                    if (isAllowedSiteHost(host)) {
                        enterLiveSiteMode(uri.toString());
                        return true;
                    }
                    // Do NOT automatically redirect unknown URLs to Chrome.
                    // Only open external browser when explicitly requested via AndroidBridge.openExternalUrl(url).
                    return true;
                } else {
                    // For sub-frames (!request.isForMainFrame()), allow https:// loads without kicking out to launchExternalBrowser
                    return false;
                }
            }

            // Block all other schemes (javascript:, intent://, market://, tel:, etc.)
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
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
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
    }

    /**
     * Site WebView Client: Manages live site navigation and episode streaming.
     * Blocks non-web schemes and keeps all HTTPS navigations inside the app.
     */
    private class SiteWebViewClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request != null && request.getUrl() != null) {
                return handleSiteUrl(request.getUrl(), request.isForMainFrame());
            }
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url != null) {
                return handleSiteUrl(Uri.parse(url), true);
            }
            return true;
        }

        private boolean handleSiteUrl(Uri uri, boolean isForMainFrame) {
            if (uri == null) {
                return true;
            }
            String scheme = uri.getScheme();
            if (scheme == null) {
                return true;
            }

            // Block dangerous non-web schemes (intent://, market://, javascript:, file://, tel:, mailto:)
            if (!"https".equalsIgnoreCase(scheme)) {
                return true; // Blocked, never launch external intents
            }

            // If NartoDrama attempts to navigate to /open-in-browser, intercept it
            String path = uri.getPath();
            if (path != null && path.contains("open-in-browser")) {
                Toast.makeText(MainActivity.this, "Uygulama içi oynatma korunuyor.", Toast.LENGTH_SHORT).show();
                return true;
            }

            // For https:// navigations in siteWebView (both main-frame and sub-frames):
            // keep them inside siteWebView so episode players, CDNs, and legitimate site navigation
            // stay inside the app without automatically redirecting to Chrome!
            return false;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (url != null) {
                String title = view.getTitle();
                if (title != null && !title.isEmpty()) {
                    txtLiveSiteTitle.setText(title);
                }
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            // NEVER proceed on SSL certificate errors!
            handler.cancel();
            Toast.makeText(MainActivity.this, R.string.ssl_error_warning, Toast.LENGTH_LONG).show();
        }
    }

    /**
     * Popup WebView Client: Governs temporary popup windows created during user interactions.
     * Routes allowlisted site hosts back into siteWebView; contains ad-gate pages in-app.
     */
    private class PopupWebViewClient extends WebViewClient {

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request != null && request.getUrl() != null) {
                return handlePopupUrl(request.getUrl());
            }
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url != null) {
                return handlePopupUrl(Uri.parse(url));
            }
            return true;
        }

        private boolean handlePopupUrl(Uri uri) {
            if (uri == null) {
                return true;
            }
            String scheme = uri.getScheme();
            if (scheme == null) {
                return true;
            }

            // Block dangerous schemes
            if (!"https".equalsIgnoreCase(scheme)) {
                return true;
            }

            String host = uri.getHost();
            if (isAllowedSiteHost(host)) {
                if (siteWebView != null) {
                    siteWebView.loadUrl(uri.toString());
                }
                closePopup();
                return true;
            }

            // Keep ad-gate interaction / external verification page inside popupWebView
            return false;
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            Toast.makeText(MainActivity.this, R.string.ssl_error_warning, Toast.LENGTH_LONG).show();
        }
    }

    /**
     * WebChromeClient enabling HTML5 fullscreen video playback and in-app popup window management.
     */
    private class FullscreenWebChromeClient extends WebChromeClient {

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            // Rule 1: Block background / non-user-gesture popups immediately
            if (!isUserGesture) {
                return false;
            }

            // Rule 2: User gesture popup (e.g. ad-gate verification button tap)
            closePopup();

            popupWebView = new WebView(MainActivity.this);
            WebSettings popSettings = popupWebView.getSettings();
            popSettings.setJavaScriptEnabled(true);
            popSettings.setDomStorageEnabled(true);
            popSettings.setDatabaseEnabled(true);
            popSettings.setSupportMultipleWindows(false);
            popSettings.setAllowFileAccess(false);
            popSettings.setAllowContentAccess(false);
            popSettings.setAllowFileAccessFromFileURLs(false);
            popSettings.setAllowUniversalAccessFromFileURLs(false);
            popSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

            // Clean User-Agent for popup WebView
            String popUa = popSettings.getUserAgentString();
            if (popUa != null) {
                popSettings.setUserAgentString(popUa.replace("; wv", "").replace("Version/4.0 ", ""));
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                CookieManager.getInstance().setAcceptThirdPartyCookies(popupWebView, true);
            }

            // NO JavascriptInterface attached to popupWebView!
            popupWebView.setWebViewClient(new PopupWebViewClient());
            popupWebView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onCloseWindow(WebView window) {
                    closePopup();
                }
            });

            if (popupWebViewHolder != null) {
                popupWebViewHolder.addView(popupWebView, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }
            if (popupContainer != null) {
                popupContainer.setVisibility(View.VISIBLE);
            }

            if (resultMsg != null && resultMsg.obj instanceof WebView.WebViewTransport) {
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(popupWebView);
                resultMsg.sendToTarget();
                return true;
            }
            return false;
        }

        @Override
        public void onCloseWindow(WebView window) {
            closePopup();
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback callback) {
            if (customView != null) {
                callback.onCustomViewHidden();
                return;
            }

            customView = view;
            customViewCallback = callback;

            if (webView != null) webView.setVisibility(View.GONE);
            if (siteWebView != null) siteWebView.setVisibility(View.GONE);
            if (liveSiteTopBar != null) liveSiteTopBar.setVisibility(View.GONE);
            if (popupContainer != null) popupContainer.setVisibility(View.GONE);

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

            if (inLiveSiteMode) {
                if (siteWebView != null) siteWebView.setVisibility(View.VISIBLE);
                if (liveSiteTopBar != null) liveSiteTopBar.setVisibility(View.VISIBLE);
            } else {
                if (webView != null) webView.setVisibility(View.VISIBLE);
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
