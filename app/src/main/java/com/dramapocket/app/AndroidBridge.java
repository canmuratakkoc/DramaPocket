package com.dramapocket.app;

import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;

/**
 * JavaScript Bridge exposed to the primary local WebView as window.AndroidBridge.
 *
 * Security Principles:
 * 1. Origin verification: Privileged bridge actions verify that the calling
 *    WebView currently resides in local asset storage (file:///android_asset/www/).
 * 2. Strict Host validation: fetchHtml and openSiteWebView permit HTTPS requests
 *    only to allowlisted hosts: nartodrama.com, narto-drama.com, nartodrama-api.online
 *    and their legitimate subdomains.
 * 3. File sanitization: Downloaded file names are strictly sanitized to prevent path traversal.
 * 4. Resource throttling: fetchHtml imposes a 1.5 MB read limit and 10-second connect/read timeouts.
 * 5. Bridge Isolation: This bridge is NEVER attached to siteWebView or popup WebViews.
 */
public class AndroidBridge {

    private static final String ALLOWED_ORIGIN_PREFIX = "file:///android_asset/www/";
    private static final int MAX_FETCH_BYTES = (int) (1.5 * 1024 * 1024); // 1.5 MB limit
    private static final int TIMEOUT_MS = 10000; // 10 seconds

    private final MainActivity activity;
    private final WebView webView;
    private final DownloadManager downloadManager;

    public AndroidBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.downloadManager = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
    }

    /**
     * Verifies that the caller currently resides in the trusted local asset space.
     * Uses MainActivity.getCurrentWebViewUrl() which is safely updated on the UI thread
     * to avoid "A WebView method was called on thread 'JavaBridge'" crashes.
     */
    private boolean isCallerAllowed() {
        String currentUrl = activity.getCurrentWebViewUrl();
        return currentUrl != null && currentUrl.startsWith(ALLOWED_ORIGIN_PREFIX);
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
     * Fetches raw HTML/JSON from allowlisted NartoDrama hosts via native HttpsURLConnection.
     * Bypasses WebView CORS while strictly confining network access to authorized domains.
     *
     * @param urlString Target HTTPS URL on nartodrama.com / narto-drama.com
     * @return JSON string: {"ok":true,"status":200,"body":"...","finalUrl":"..."}
     *         or {"ok":false,"error":"..."}
     */
    @JavascriptInterface
    public String fetchHtml(String urlString) {
        JSONObject result = new JSONObject();
        try {
            if (!isCallerAllowed()) {
                result.put("ok", false);
                result.put("error", "Unauthorized caller origin");
                return result.toString();
            }

            if (urlString == null || urlString.trim().isEmpty()) {
                result.put("ok", false);
                result.put("error", "URL cannot be empty");
                return result.toString();
            }

            Uri uri = Uri.parse(urlString.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme())) {
                result.put("ok", false);
                result.put("error", "Only HTTPS protocol is permitted");
                return result.toString();
            }

            if (!isAllowedSiteHost(uri.getHost())) {
                result.put("ok", false);
                result.put("error", "Host restricted to allowlisted NartoDrama domains: " + uri.getHost());
                return result.toString();
            }

            URL url = new URL(urlString.trim());
            HttpsURLConnection conn = (HttpsURLConnection) url.openConnection();
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setInstanceFollowRedirects(true);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent",
                    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 DramaPocket/1.0");
            conn.setRequestProperty("Accept",
                    "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7");
            conn.setRequestProperty("Accept-Language", "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7");

            // Attach cookies from WebView CookieManager + ensure NartoDrama nd_ck cookie exists
            CookieManager cookieManager = CookieManager.getInstance();
            String existingCookies = cookieManager.getCookie(urlString.trim());
            StringBuilder cookieHeader = new StringBuilder();
            if (existingCookies != null && !existingCookies.trim().isEmpty()) {
                cookieHeader.append(existingCookies.trim());
            }
            if (!cookieHeader.toString().contains("nd_ck=")) {
                String ndCk = "nd_ck=" + Long.toString(System.currentTimeMillis(), 36) + "dramapocket";
                if (cookieHeader.length() > 0) {
                    cookieHeader.append("; ");
                }
                cookieHeader.append(ndCk);
                try {
                    cookieManager.setCookie(urlString.trim(), ndCk);
                } catch (Exception ignored) {
                }
            }
            if (cookieHeader.length() > 0) {
                conn.setRequestProperty("Cookie", cookieHeader.toString());
            }

            int responseCode = conn.getResponseCode();

            // Validate redirect host if redirected
            URL finalUrl = conn.getURL();
            if (!isAllowedSiteHost(finalUrl.getHost())) {
                conn.disconnect();
                result.put("ok", false);
                result.put("error", "Redirected to untrusted external host: " + finalUrl.getHost());
                return result.toString();
            }

            // Sync any Set-Cookie response headers back to CookieManager
            try {
                Map<String, List<String>> headers = conn.getHeaderFields();
                if (headers != null) {
                    List<String> setCookies = headers.get("Set-Cookie");
                    if (setCookies != null && !setCookies.isEmpty()) {
                        String cookieDomain = finalUrl.toString();
                        for (String sc : setCookies) {
                            if (sc != null && !sc.trim().isEmpty()) {
                                cookieManager.setCookie(cookieDomain, sc);
                            }
                        }
                        cookieManager.flush();
                    }
                }
            } catch (Exception ignored) {
            }

            InputStream is = (responseCode >= 200 && responseCode < 400)
                    ? conn.getInputStream()
                    : conn.getErrorStream();

            if (is == null) {
                result.put("ok", responseCode >= 200 && responseCode < 400);
                result.put("status", responseCode);
                result.put("body", "");
                result.put("finalUrl", finalUrl.toString());
                return result.toString();
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            int totalBytes = 0;

            while ((read = is.read(buffer)) != -1) {
                totalBytes += read;
                if (totalBytes > MAX_FETCH_BYTES) {
                    baos.write(buffer, 0, read);
                    break;
                }
                baos.write(buffer, 0, read);
            }
            is.close();
            conn.disconnect();

            String body = baos.toString("UTF-8");

            result.put("ok", responseCode >= 200 && responseCode < 400);
            result.put("status", responseCode);
            result.put("body", body);
            result.put("finalUrl", finalUrl.toString());
            return result.toString();

        } catch (Exception e) {
            try {
                result.put("ok", false);
                result.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            } catch (Exception ignored) {
            }
            return result.toString();
        }
    }

    /**
     * Enqueues an authorized media download using the Android system DownloadManager.
     * Stores files in the public Downloads directory under "DramaPocket/".
     *
     * @param urlString HTTPS URL of the video file
     * @param title Title displayed in notifications and download list
     * @param fileName Target filename (sanitized internally)
     * @return JSON string: {"ok":true,"downloadId":"...","fileName":"..."} or {"ok":false,"error":"..."}
     */
    @JavascriptInterface
    public String enqueueDownload(String urlString, String title, String fileName) {
        JSONObject result = new JSONObject();
        try {
            if (!isCallerAllowed()) {
                result.put("ok", false);
                result.put("error", "Unauthorized caller origin");
                return result.toString();
            }

            if (urlString == null || !urlString.trim().startsWith("https://")) {
                result.put("ok", false);
                result.put("error", "Only HTTPS URLs are allowed for download");
                return result.toString();
            }

            // Sanitize filename: prevent path traversal and ensure valid media extension
            String safeFileName = sanitizeFileName(fileName);

            // Check for existing active or finished download with same URL
            long existingId = findExistingDownloadId(urlString.trim());
            if (existingId != -1) {
                result.put("ok", true);
                result.put("downloadId", String.valueOf(existingId));
                result.put("fileName", safeFileName);
                result.put("existing", true);
                return result.toString();
            }

            Uri uri = Uri.parse(urlString.trim());
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setTitle(title != null && !title.trim().isEmpty() ? title.trim() : safeFileName);
            request.setDescription("DramaPocket");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "DramaPocket/" + safeFileName);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);

            long downloadId = downloadManager.enqueue(request);

            result.put("ok", true);
            result.put("downloadId", String.valueOf(downloadId));
            result.put("fileName", safeFileName);
            return result.toString();

        } catch (Exception e) {
            try {
                result.put("ok", false);
                result.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            } catch (Exception ignored) {
            }
            return result.toString();
        }
    }

    /**
     * Queries DownloadManager for all downloads managed by this application.
     *
     * @return JSON array string of download objects
     */
    @JavascriptInterface
    public String getDownloadsStatus() {
        JSONArray array = new JSONArray();
        Cursor cursor = null;
        try {
            if (!isCallerAllowed()) {
                return "[]";
            }

            DownloadManager.Query query = new DownloadManager.Query();
            cursor = downloadManager.query(query);

            if (cursor != null && cursor.moveToFirst()) {
                int idIdx = cursor.getColumnIndex(DownloadManager.COLUMN_ID);
                int titleIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TITLE);
                int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                int downloadedIdx = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
                int totalIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
                int localUriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                int reasonIdx = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                int uriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_URI);

                do {
                    JSONObject item = new JSONObject();
                    long id = cursor.getLong(idIdx);
                    String title = titleIdx != -1 ? cursor.getString(titleIdx) : "";
                    int statusInt = statusIdx != -1 ? cursor.getInt(statusIdx) : 0;
                    long downloaded = downloadedIdx != -1 ? cursor.getLong(downloadedIdx) : 0;
                    long total = totalIdx != -1 ? cursor.getLong(totalIdx) : 0;
                    String localUri = localUriIdx != -1 ? cursor.getString(localUriIdx) : "";
                    int reason = reasonIdx != -1 ? cursor.getInt(reasonIdx) : 0;
                    String uri = uriIdx != -1 ? cursor.getString(uriIdx) : "";

                    int progress = (total > 0) ? (int) ((downloaded * 100) / total) : 0;

                    item.put("downloadId", String.valueOf(id));
                    item.put("title", title);
                    item.put("status", mapStatus(statusInt));
                    item.put("statusCode", statusInt);
                    item.put("bytesDownloaded", downloaded);
                    item.put("bytesTotal", total);
                    item.put("progress", progress);
                    item.put("localUri", localUri != null ? localUri : "");
                    item.put("reason", reason);
                    item.put("url", uri != null ? uri : "");

                    array.put(item);
                } while (cursor.moveToNext());
            }
        } catch (Exception e) {
            // Return whatever was collected
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return array.toString();
    }

    /**
     * Cancels / removes a download by ID.
     */
    @JavascriptInterface
    public boolean cancelDownload(String downloadId) {
        try {
            if (!isCallerAllowed() || downloadId == null) {
                return false;
            }
            long id = Long.parseLong(downloadId.trim());
            return downloadManager.remove(id) > 0;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Launches external browser for a validated HTTPS URL.
     * Note: Only called when the user or frontend explicitly requests an external browser.
     */
    @JavascriptInterface
    public void openExternalUrl(String urlString) {
        if (!isCallerAllowed()) {
            return;
        }
        if (urlString == null || !urlString.trim().startsWith("https://")) {
            return;
        }
        activity.runOnUiThread(() -> {
            activity.launchExternalBrowser(Uri.parse(urlString.trim()));
        });
    }

    /**
     * Opens live NartoDrama website in the dedicated siteWebView with a persistent return button.
     * Strictly verifies host is an allowlisted NartoDrama host.
     */
    @JavascriptInterface
    public void openSiteWebView(String urlString) {
        if (!isCallerAllowed() || urlString == null) {
            return;
        }
        Uri uri = Uri.parse(urlString.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !isAllowedSiteHost(uri.getHost())) {
            return;
        }
        activity.runOnUiThread(() -> activity.enterLiveSiteMode(urlString.trim()));
    }

    /**
     * Exits live site browsing mode and returns to the local app UI.
     */
    @JavascriptInterface
    public void returnToApp() {
        activity.runOnUiThread(activity::exitLiveSiteMode);
    }

    /**
     * Launches the system Storage Access Framework picker for local video playback.
     */
    @JavascriptInterface
    public void pickLocalVideo() {
        if (!isCallerAllowed()) {
            return;
        }
        activity.runOnUiThread(activity::launchVideoPicker);
    }

    /**
     * Returns platform and application metadata.
     */
    @JavascriptInterface
    public String getAppInfo() {
        JSONObject obj = new JSONObject();
        try {
            obj.put("versionName", "1.0.0");
            obj.put("versionCode", 1);
            obj.put("sdkInt", Build.VERSION.SDK_INT);
            obj.put("platform", "android");
        } catch (Exception ignored) {
        }
        return obj.toString();
    }

    // --- Helper Methods ---

    private String sanitizeFileName(String input) {
        if (input == null || input.trim().isEmpty()) {
            return "video_" + System.currentTimeMillis() + ".mp4";
        }
        // Extract basename
        String name = input.trim();
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0 && slash < name.length() - 1) {
            name = name.substring(slash + 1);
        }
        // Strip out unsafe characters
        name = name.replaceAll("[^a-zA-Z0-9._-]", "_");
        if (name.isEmpty() || name.equals(".")) {
            name = "video_" + System.currentTimeMillis();
        }
        // Ensure valid video extension
        String lower = name.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".mp4") && !lower.endsWith(".webm") && !lower.endsWith(".mkv")) {
            name = name + ".mp4";
        }
        return name;
    }

    private long findExistingDownloadId(String urlString) {
        Cursor cursor = null;
        try {
            DownloadManager.Query query = new DownloadManager.Query();
            cursor = downloadManager.query(query);
            if (cursor != null && cursor.moveToFirst()) {
                int idIdx = cursor.getColumnIndex(DownloadManager.COLUMN_ID);
                int uriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_URI);
                int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                do {
                    String uri = cursor.getString(uriIdx);
                    int status = cursor.getInt(statusIdx);
                    if (urlString.equals(uri)) {
                        // Return if running, pending, paused, or successful
                        if (status == DownloadManager.STATUS_RUNNING
                                || status == DownloadManager.STATUS_PENDING
                                || status == DownloadManager.STATUS_PAUSED
                                || status == DownloadManager.STATUS_SUCCESSFUL) {
                            return cursor.getLong(idIdx);
                        }
                    }
                } while (cursor.moveToNext());
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return -1;
    }

    private String mapStatus(int status) {
        switch (status) {
            case DownloadManager.STATUS_PENDING:
                return "PENDING";
            case DownloadManager.STATUS_RUNNING:
                return "RUNNING";
            case DownloadManager.STATUS_PAUSED:
                return "PAUSED";
            case DownloadManager.STATUS_SUCCESSFUL:
                return "SUCCESSFUL";
            case DownloadManager.STATUS_FAILED:
                return "FAILED";
            default:
                return "UNKNOWN";
        }
    }
}
