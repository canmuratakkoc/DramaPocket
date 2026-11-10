/**
 * DramaPocket - Development-Only AndroidBridge Substitute
 * Project: DramaPocket (Android WebView Asian Drama App)
 *
 * Requirements:
 * - Only activates if typeof window.AndroidBridge === 'undefined' (never overrides real Android!).
 * - Exposes full window.AndroidBridge interface for zero-APK desktop browser development.
 * - Synchronous fetchHtml() via /__dev/fetch endpoint (matches Java @JavascriptInterface return type).
 * - Realistic DownloadManager simulation (PENDING -> RUNNING -> SUCCESSFUL) with localStorage persistence.
 * - Simulated Android Live Site Mode overlay with return bar.
 * - Native SAF video picker simulation via #local-video-file-input.
 * - Collapsible floating Dev Bar for testing window.handleAndroidBack() and mobile viewport toggle.
 */

(function () {
  'use strict';

  // 1. Safety Guard: Never override real Android runtime!
  if (typeof window === 'undefined') return;

  if (typeof window.AndroidBridge !== 'undefined') {
    console.info('[DevBridge] Native AndroidBridge detected. Dev simulator will NOT attach.');
    return;
  }

  console.info(
    '%c[DramaPocket DevBridge]%c Zero-Dependency AndroidBridge Simulator Active at http://localhost:5500',
    'background: #3b82f6; color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px;',
    'color: #93c5fd; font-weight: normal; margin-left: 6px;'
  );

  // Storage key for simulated downloads
  var DEV_DOWNLOADS_STORAGE_KEY = 'dramapocket_dev_downloads_v1';

  // Load existing simulated downloads from localStorage
  function loadSimulatedDownloads() {
    try {
      var raw = localStorage.getItem(DEV_DOWNLOADS_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('[DevBridge] Error loading simulated downloads:', e);
    }
    return [];
  }

  function saveSimulatedDownloads(list) {
    try {
      localStorage.setItem(DEV_DOWNLOADS_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[DevBridge] Error saving simulated downloads:', e);
    }
  }

  var simulatedDownloads = loadSimulatedDownloads();

  // Helper to sanitize filename matching AndroidBridge.java sanitizeFileName
  function sanitizeFileName(input) {
    if (!input || !input.trim()) {
      return 'video_' + Date.now() + '.mp4';
    }
    var name = input.trim();
    var slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
    if (slash >= 0 && slash < name.length - 1) {
      name = name.substring(slash + 1);
    }
    name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!name || name === '.') {
      name = 'video_' + Date.now();
    }
    var lower = name.toLowerCase();
    if (!lower.endsWith('.mp4') && !lower.endsWith('.webm') && !lower.endsWith('.mkv')) {
      name = name + '.mp4';
    }
    return name;
  }

  // Background progress ticker for RUNNING downloads
  var downloadTickerInterval = null;

  function ensureDownloadTicker() {
    if (downloadTickerInterval) return;

    downloadTickerInterval = setInterval(function () {
      var hasRunning = false;
      var updated = false;

      simulatedDownloads.forEach(function (item) {
        if (item.status === 'RUNNING') {
          hasRunning = true;
          item.progress = Math.min(100, item.progress + 25);
          item.bytesDownloaded = Math.floor((item.progress / 100) * item.bytesTotal);

          if (item.progress >= 100) {
            item.status = 'SUCCESSFUL';
            item.statusCode = 8; // DownloadManager.STATUS_SUCCESSFUL
            console.log('[DevBridge] Simulated download complete:', item.title);
          }
          updated = true;
        }
      });

      if (updated) {
        saveSimulatedDownloads(simulatedDownloads);
      }

      if (!hasRunning) {
        clearInterval(downloadTickerInterval);
        downloadTickerInterval = null;
      }
    }, 1000);
  }

  // Start ticker if any downloads are already running on startup
  if (simulatedDownloads.some(function (d) { return d.status === 'RUNNING'; })) {
    ensureDownloadTicker();
  }

  // =========================================================================
  // WINDOW.ANDROIDBRIDGE SIMULATOR IMPLEMENTATION
  // =========================================================================
  var devBridge = {
    /**
     * fetchHtml(url): Synchronous XMLHttpRequest matching Java's return contract.
     * Uses Node dev-server proxy (/__dev/fetch) which manages cookies and bypasses CORS.
     */
    fetchHtml: function (url) {
      if (!url || typeof url !== 'string' || !url.trim().startsWith('https://')) {
        return JSON.stringify({
          ok: false,
          status: 400,
          error: 'Only HTTPS protocol is permitted'
        });
      }

      try {
        var xhr = new XMLHttpRequest();
        // Synchronous GET to dev proxy endpoint
        var proxyUrl = '/__dev/fetch?url=' + encodeURIComponent(url.trim());
        xhr.open('GET', proxyUrl, false);
        xhr.setRequestHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7');
        xhr.send(null);

        if (xhr.status >= 200 && xhr.status < 300) {
          // Response is already JSON { ok: true, status: 200, body: "...", finalUrl: "..." }
          return xhr.responseText;
        } else {
          try {
            var errJson = JSON.parse(xhr.responseText);
            return JSON.stringify(errJson);
          } catch (_) {
            return JSON.stringify({
              ok: false,
              status: xhr.status,
              error: 'Dev proxy HTTP ' + xhr.status + ': ' + xhr.statusText
            });
          }
        }
      } catch (err) {
        console.error('[DevBridge] fetchHtml error:', err);
        return JSON.stringify({
          ok: false,
          status: 0,
          error: 'Dev proxy request error: ' + err.message
        });
      }
    },

    /**
     * enqueueDownload: Simulates Android DownloadManager queueing.
     */
    enqueueDownload: function (urlString, title, fileName) {
      console.log('[DevBridge] enqueueDownload called:', { urlString: urlString, title: title, fileName: fileName });

      if (!urlString || typeof urlString !== 'string' || !urlString.trim().startsWith('https://')) {
        return JSON.stringify({
          ok: false,
          error: 'Only HTTPS URLs are allowed for download'
        });
      }

      var safeName = sanitizeFileName(fileName);
      var trimmedUrl = urlString.trim();

      // Check for existing download
      var existing = simulatedDownloads.find(function (d) { return d.url === trimmedUrl; });
      if (existing) {
        return JSON.stringify({
          ok: true,
          downloadId: String(existing.downloadId),
          fileName: existing.title || safeName,
          existing: true
        });
      }

      var newId = String(Date.now());
      var simulatedSize = 10 * 1024 * 1024; // 10 MB default

      var newDownload = {
        downloadId: newId,
        title: title && title.trim() ? title.trim() : safeName,
        status: 'RUNNING',
        statusCode: 2, // DownloadManager.STATUS_RUNNING
        bytesDownloaded: 0,
        bytesTotal: simulatedSize,
        progress: 0,
        localUri: 'file:///sdcard/Download/DramaPocket/' + safeName,
        reason: 0,
        url: trimmedUrl,
        createdAt: Date.now()
      };

      simulatedDownloads.unshift(newDownload);
      saveSimulatedDownloads(simulatedDownloads);
      ensureDownloadTicker();

      return JSON.stringify({
        ok: true,
        downloadId: newId,
        fileName: safeName
      });
    },

    /**
     * getDownloadsStatus: Returns JSON array of all simulated downloads.
     */
    getDownloadsStatus: function () {
      return JSON.stringify(simulatedDownloads);
    },

    /**
     * cancelDownload: Cancels and removes download record.
     */
    cancelDownload: function (downloadId) {
      console.log('[DevBridge] cancelDownload called for ID:', downloadId);
      if (!downloadId) return false;
      var strId = String(downloadId).trim();
      var initialLen = simulatedDownloads.length;
      simulatedDownloads = simulatedDownloads.filter(function (d) { return String(d.downloadId) !== strId; });
      saveSimulatedDownloads(simulatedDownloads);
      return simulatedDownloads.length < initialLen;
    },

    /**
     * openSiteWebView: Simulates in-app live site mode overlay with return bar.
     */
    openSiteWebView: function (urlString) {
      console.log('[DevBridge] openSiteWebView requested for:', urlString);
      if (typeof document !== 'undefined') {
        showSimulatedLiveSiteOverlay(urlString);
      }
    },

    /**
     * returnToApp: Closes the simulated live site overlay.
     */
    returnToApp: function () {
      console.log('[DevBridge] returnToApp requested');
      if (typeof document !== 'undefined') {
        hideSimulatedLiveSiteOverlay();
      }
    },

    /**
     * openExternalUrl: Opens target URL in standard browser tab.
     */
    openExternalUrl: function (urlString) {
      console.log('[DevBridge] openExternalUrl:', urlString);
      if (urlString && urlString.trim().startsWith('https://') && typeof window !== 'undefined') {
        window.open(urlString.trim(), '_blank', 'noopener,noreferrer');
      }
    },

    /**
     * pickLocalVideo: Triggers click on #local-video-file-input for seamless testing.
     */
    pickLocalVideo: function () {
      console.log('[DevBridge] pickLocalVideo called -> forwarding to #local-video-file-input');
      if (typeof document !== 'undefined') {
        var fileInput = document.getElementById('local-video-file-input');
        if (fileInput) {
          fileInput.click();
        } else {
          console.warn('[DevBridge] #local-video-file-input not found in DOM');
        }
      }
    },

    /**
     * getAppInfo: Returns application metadata string.
     */
    getAppInfo: function () {
      return JSON.stringify({
        versionName: '1.0.0-dev',
        versionCode: 1,
        sdkInt: 34,
        platform: 'android-dev-simulator'
      });
    }
  };

  // Expose as window.AndroidBridge
  window.AndroidBridge = devBridge;

  // =========================================================================
  // SIMULATED IN-APP LIVE SITE OVERLAY
  // =========================================================================
  var liveSiteOverlayEl = null;

  function showSimulatedLiveSiteOverlay(url) {
    if (typeof document === 'undefined') return;
    if (!liveSiteOverlayEl) {
      liveSiteOverlayEl = document.createElement('div');
      liveSiteOverlayEl.id = 'dev-live-site-overlay';
      liveSiteOverlayEl.setAttribute('role', 'dialog');
      liveSiteOverlayEl.setAttribute('aria-modal', 'true');
      liveSiteOverlayEl.style.cssText =
        'position: fixed; inset: 0; z-index: 99990; background: #0b0f19; display: flex; flex-direction: column; overflow: hidden;';

      var topBar = document.createElement('div');
      topBar.style.cssText =
        'background: #111827; border-bottom: 1px solid #1f2937; padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.5);';

      // Return button
      var btnReturn = document.createElement('button');
      btnReturn.type = 'button';
      btnReturn.style.cssText =
        'background: #2563eb; color: #ffffff; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;';
      btnReturn.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>' +
        '<span>DramaPocket\'a Dön (Dev Simülasyonu)</span>';
      btnReturn.onclick = function () {
        devBridge.returnToApp();
      };

      // Title & URL info
      var titleInfo = document.createElement('div');
      titleInfo.style.cssText = 'flex: 1; min-width: 0; color: #94a3b8; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
      titleInfo.id = 'dev-live-site-url-label';

      // External Tab Button
      var btnExternal = document.createElement('button');
      btnExternal.type = 'button';
      btnExternal.id = 'dev-live-site-external-btn';
      btnExternal.style.cssText =
        'background: #374151; color: #e5e7eb; border: 1px solid #4b5563; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px;';
      btnExternal.innerHTML =
        '<span>Yeni Sekmede Aç</span><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';

      topBar.appendChild(btnReturn);
      topBar.appendChild(titleInfo);
      topBar.appendChild(btnExternal);

      // Body container
      var bodyContainer = document.createElement('div');
      bodyContainer.style.cssText = 'flex: 1; display: flex; flex-direction: column; background: #030712; position: relative;';

      // Info banner inside body explaining X-Frame-Options
      var infoBanner = document.createElement('div');
      infoBanner.style.cssText =
        'background: rgba(30, 41, 59, 0.9); border-bottom: 1px solid #334155; padding: 10px 16px; font-size: 12px; color: #cbd5e1; display: flex; align-items: center; justify-content: space-between;';
      infoBanner.innerHTML =
        '<span>⚡ <b>Android Canlı Site Simülatörü:</b> Gerçek Android uygulamasında bu sayfa yerel WebView içerisinde çalışır. ' +
        'Eğer harici site tarayıcı içi iframe yerleşimini kısıtlarsa (X-Frame-Options), lütfen "Yeni Sekmede Aç" butonunu kullanın.</span>';

      var iframe = document.createElement('iframe');
      iframe.id = 'dev-live-site-iframe';
      iframe.style.cssText = 'flex: 1; border: none; width: 100%; height: 100%; background: #ffffff;';
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');

      bodyContainer.appendChild(infoBanner);
      bodyContainer.appendChild(iframe);

      liveSiteOverlayEl.appendChild(topBar);
      liveSiteOverlayEl.appendChild(bodyContainer);

      document.body.appendChild(liveSiteOverlayEl);
    }

    var label = document.getElementById('dev-live-site-url-label');
    if (label) label.textContent = 'Canlı Site: ' + (url || '');

    var btnExt = document.getElementById('dev-live-site-external-btn');
    if (btnExt) {
      btnExt.onclick = function () {
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      };
    }

    var iframeEl = document.getElementById('dev-live-site-iframe');
    if (iframeEl && url) {
      iframeEl.src = url;
    }

    liveSiteOverlayEl.style.display = 'flex';
  }

  function hideSimulatedLiveSiteOverlay() {
    if (liveSiteOverlayEl) {
      liveSiteOverlayEl.style.display = 'none';
      var iframeEl = document.getElementById('dev-live-site-iframe');
      if (iframeEl) {
        iframeEl.src = 'about:blank';
      }
    }
  }

  // =========================================================================
  // FLOATING DEV BAR UI ([Dev: Android Geri Tuşu | Mobil Boyut])
  // =========================================================================
  function initFloatingDevBar() {
    // Avoid double creation
    if (document.getElementById('dramapocket-dev-bar-container')) return;

    var container = document.createElement('div');
    container.id = 'dramapocket-dev-bar-container';
    container.style.cssText =
      'position: fixed; bottom: 64px; right: 14px; z-index: 99995; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; pointer-events: none;';

    // Collapsed Badge
    var toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.id = 'dramapocket-dev-toggle-badge';
    toggleBtn.style.cssText =
      'pointer-events: auto; background: #1e293b; color: #38bdf8; border: 1px solid #334155; border-radius: 20px; padding: 6px 12px; font-size: 11px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; gap: 6px; backdrop-filter: blur(8px);';
    toggleBtn.innerHTML = '<span>🛠 Dev Panel</span>';

    // Expanded Panel
    var panel = document.createElement('div');
    panel.id = 'dramapocket-dev-panel';
    panel.style.cssText =
      'pointer-events: auto; display: none; background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 8px 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); align-items: center; gap: 8px; backdrop-filter: blur(12px);';

    // Button: Android Back
    var btnBack = document.createElement('button');
    btnBack.type = 'button';
    btnBack.title = 'window.handleAndroidBack() metodunu çağırır';
    btnBack.style.cssText =
      'background: #3b82f6; color: #ffffff; border: none; border-radius: 4px; padding: 5px 9px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;';
    btnBack.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>' +
      '<span>Android Geri Tuşu</span>';

    btnBack.onclick = function () {
      if (typeof window.handleAndroidBack === 'function') {
        var handled = window.handleAndroidBack();
        console.log('[DevBridge] window.handleAndroidBack() called -> returned:', handled);
      } else {
        console.warn('[DevBridge] window.handleAndroidBack is not defined yet');
      }
    };

    // Button: Toggle 412px Mobile Viewport Simulation
    var isMobileConstrained = false;
    var btnMobileToggle = document.createElement('button');
    btnMobileToggle.type = 'button';
    btnMobileToggle.title = 'Masaüstü ekranında 412px telefon genişliğini simüle eder';
    btnMobileToggle.style.cssText =
      'background: #334155; color: #e2e8f0; border: 1px solid #475569; border-radius: 4px; padding: 5px 9px; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 4px;';
    btnMobileToggle.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>' +
      '<span>Mobil Boyut (412px)</span>';

    btnMobileToggle.onclick = function () {
      var appEl = document.getElementById('app') || document.body;
      if (!isMobileConstrained) {
        appEl.style.maxWidth = '412px';
        appEl.style.margin = '0 auto';
        appEl.style.boxShadow = '0 0 30px rgba(0,0,0,0.7)';
        appEl.style.minHeight = '100vh';
        btnMobileToggle.style.background = '#059669';
        btnMobileToggle.style.color = '#ffffff';
        btnMobileToggle.innerHTML = '<span>🖥 Tam Ekran</span>';
        isMobileConstrained = true;
      } else {
        appEl.style.maxWidth = '';
        appEl.style.margin = '';
        appEl.style.boxShadow = '';
        btnMobileToggle.style.background = '#334155';
        btnMobileToggle.style.color = '#e2e8f0';
        btnMobileToggle.innerHTML =
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>' +
          '<span>Mobil Boyut (412px)</span>';
        isMobileConstrained = false;
      }
    };

    // Close / Collapse Button
    var btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.title = 'Paneli Küçült';
    btnClose.style.cssText =
      'background: transparent; color: #94a3b8; border: none; font-size: 14px; cursor: pointer; padding: 2px 5px;';
    btnClose.innerHTML = '✕';
    btnClose.onclick = function () {
      panel.style.display = 'none';
      toggleBtn.style.display = 'flex';
    };

    toggleBtn.onclick = function () {
      panel.style.display = 'flex';
      toggleBtn.style.display = 'none';
    };

    panel.appendChild(btnBack);
    panel.appendChild(btnMobileToggle);
    panel.appendChild(btnClose);

    container.appendChild(panel);
    container.appendChild(toggleBtn);

    document.body.appendChild(container);
  }

  // Initialize floating dev bar when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initFloatingDevBar);
    } else {
      initFloatingDevBar();
    }
  }
})();
