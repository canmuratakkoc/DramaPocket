/**
 * DramaPocket - app.js
 * Main UI Controller & View Layer for NartoDrama Mobile Viewer.
 * Pure Vanilla JavaScript (ES6+), Zero Frameworks, 100% Turkish UI.
 */
(function (global) {
  'use strict';

  // Application State
  var state = {
    currentTab: 'home',
    currentCategory: 'all',
    currentDrama: null,
    currentEpisode: null,
    currentEpisodes: [],
    currentEpisodesDramaKey: '',
    currentStreamUrl: '',
    playbackTimer: null,
    downloadsPollTimer: null,
    searchDebounceTimer: null,
    siteInfo: null
  };

  function getDramaLookupKey(drama) {
    if (!drama) return '';
    var urls = [drama.dramaUrl, drama.url, drama.id];
    for (var i = 0; i < urls.length; i++) {
      var val = String(urls[i] || '').trim();
      var m = val.match(/\/detail\/watch\/([^/?#]+)/i);
      if (m && m[1]) return 'slug:' + m[1].toLowerCase();
    }
    return String(drama.id || drama.title || '').trim().toLowerCase();
  }

  // Safe Bridge Accessor
  function getBridge() {
    return (typeof global.AndroidBridge !== 'undefined' && global.AndroidBridge !== null)
      ? global.AndroidBridge
      : null;
  }

  // Safe SiteAdapter Accessor
  function getAdapter() {
    return (typeof global.SiteAdapter !== 'undefined' && global.SiteAdapter !== null)
      ? global.SiteAdapter
      : null;
  }

  // Helper: Open URL via Android In-App WebView or External Fallback
  function openSiteUrl(url) {
    if (!url) return;
    var bridge = getBridge();
    try {
      if (bridge && typeof bridge.openSiteWebView === 'function') {
        bridge.openSiteWebView(url);
        return;
      }
      if (bridge && typeof bridge.openExternalUrl === 'function') {
        bridge.openExternalUrl(url);
        return;
      }
    } catch (e) {
      console.warn('[DramaApp] Bridge openUrl error', e);
    }
    // Browser fallback
    global.open(url, '_blank', 'noopener,noreferrer');
  }

  // Helper: Dismissible Toast Notifications
  function showToast(message, duration) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var dur = duration || 3000;

    var toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' +
      '<span>' + escapeHtml(message) + '</span>' +
      '<button type="button" class="toast-dismiss-btn" aria-label="Bildirimi Kapat">✕</button>';

    var removed = false;
    function dismissToast() {
      if (removed) return;
      removed = true;
      toast.classList.add('toast-out');
      setTimeout(function () {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 200);
    }

    toast.addEventListener('click', dismissToast);
    container.appendChild(toast);

    setTimeout(dismissToast, dur);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ========================================================================
  // TAB NAVIGATION
  // ========================================================================
  function switchTab(tabName) {
    if (!tabName) return;
    state.currentTab = tabName;

    // Update bottom nav active classes
    var navButtons = document.querySelectorAll('.bottom-nav .nav-item');
    navButtons.forEach(function (btn) {
      var target = btn.getAttribute('data-tab');
      var isActive = target === tabName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Update tab panes
    var panes = document.querySelectorAll('.tab-viewport .tab-pane');
    panes.forEach(function (pane) {
      var paneId = 'tab-' + tabName;
      var isActive = pane.id === paneId;
      pane.classList.toggle('active', isActive);
    });

    // Lifecycle triggers per tab
    if (tabName === 'home') {
      renderContinueWatchingRail();
      renderRecentlyViewedRail();
      stopDownloadsPolling();
    } else if (tabName === 'search') {
      renderRecentSearches();
      stopDownloadsPolling();
    } else if (tabName === 'favorites') {
      renderFavoritesTab();
      stopDownloadsPolling();
    } else if (tabName === 'downloads') {
      renderDownloadsTab();
      startDownloadsPolling();
    }
  }

  // ========================================================================
  // TAB 1: ANA SAYFA (HOME)
  // ========================================================================
  async function initHomeTab() {
    updateStatusBanner();
    renderContinueWatchingRail();
    renderRecentlyViewedRail();
    await loadCatalog('all');
  }

  function updateStatusBanner() {
    var banner = document.getElementById('home-status-banner');
    var statusDot = document.getElementById('status-dot');
    var statusTitle = document.getElementById('status-title');
    var statusDesc = document.getElementById('status-desc');
    var statusBadge = document.getElementById('status-badge');
    var btnBannerLiveSite = document.getElementById('btn-banner-live-site');
    var btnHeaderLiveSite = document.getElementById('btn-header-live-site');

    var adapter = getAdapter();
    var bridge = getBridge();

    var baseUrl = 'https://nartodrama.com';
    var isLiveAvailable = !!adapter;

    if (adapter && typeof adapter.getInfo === 'function') {
      try {
        state.siteInfo = adapter.getInfo();
        if (state.siteInfo && state.siteInfo.baseUrl) {
          baseUrl = state.siteInfo.baseUrl;
        }
      } catch (e) {
        console.warn('[DramaApp] getInfo error', e);
      }
    }

    if (bridge) {
      banner.className = 'status-banner mode-live';
      statusDot.className = 'status-dot online';
      statusTitle.textContent = 'NartoDrama Bağlantısı: Aktif (Android Köprüsü)';
      statusBadge.textContent = 'Canlı Mod';
      statusDesc.textContent = 'Android yerel ağ köprüsü üzerinden NartoDrama sitesine doğrudan ve güvenli bağlantı sağlandı.';
    } else if (isLiveAvailable) {
      banner.className = 'status-banner mode-live';
      statusDot.className = 'status-dot online';
      statusTitle.textContent = 'NartoDrama Bağlantısı: Hazır';
      statusBadge.textContent = 'Web / API';
      statusDesc.textContent = 'Site adaptörü aktif. Güncel Kore, Çin ve Asya dizileri canlı katalogdan taranmaktadır.';
    } else {
      banner.className = 'status-banner mode-fallback';
      statusDot.className = 'status-dot';
      statusTitle.textContent = 'NartoDrama Bağlantısı: Doğrudan Site Modu';
      statusBadge.textContent = 'Canlı Görünüm';
      statusDesc.textContent = 'Dizilere ve bölümlere NartoDrama canlı mobil görünümü üzerinden anında erişebilirsiniz.';
    }

    if (banner && global.DramaStorage && global.DramaStorage.isNoticeDismissed('home-status-banner')) {
      banner.style.display = 'none';
    }

    var openAction = function () {
      openSiteUrl(baseUrl);
    };

    if (btnBannerLiveSite) {
      btnBannerLiveSite.onclick = openAction;
    }
    if (btnHeaderLiveSite) {
      btnHeaderLiveSite.onclick = openAction;
    }
  }

  function renderContinueWatchingRail() {
    var section = document.getElementById('section-continue-watching');
    var rail = document.getElementById('rail-continue-watching');
    var btnClearContinue = document.getElementById('btn-clear-continue');
    if (!section || !rail || !global.DramaStorage) return;

    var list = global.DramaStorage.getContinueWatching();
    if (!list || list.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    rail.innerHTML = '';

    if (btnClearContinue) {
      btnClearContinue.onclick = function () {
        if (typeof global.DramaStorage.clearContinueWatching === 'function') {
          global.DramaStorage.clearContinueWatching();
        }
        renderContinueWatchingRail();
        showToast('İzleme geçmişi temizlendi');
      };
    }

    list.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'rail-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      var percent = Math.min(100, Math.max(0, item.progressPercent || 0));
      var epText = item.episodeTitle || (item.episodeNumber ? (item.episodeNumber + '. Bölüm') : 'Kaldığınız Bölüm');

      card.innerHTML =
        '<div class="rail-card-media">' +
          '<img src="' + escapeHtml(item.posterUrl || 'css/poster-placeholder.png') + '" alt="' + escapeHtml(item.dramaTitle || '') + '" onerror="this.src=\'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%2290%22 viewBox=%220 0 160 90%22><rect width=%22160%22 height=%2290%22 fill=%22%231e293b%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%2394a3b8%22 font-size=%2212%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>Video</text></svg>\'">' +
          '<div class="rail-progress-bar"><div class="rail-progress-fill" style="width:' + percent + '%;"></div></div>' +
        '</div>' +
        '<div class="rail-card-body">' +
          '<div class="rail-card-title">' + escapeHtml(item.dramaTitle || 'Dizi') + '</div>' +
          '<div class="rail-card-sub">%' + percent + ' • ' + escapeHtml(epText) + '</div>' +
        '</div>';

      card.addEventListener('click', function () {
        playEpisode(
          { id: item.dramaId, title: item.dramaTitle, posterUrl: item.posterUrl, url: item.dramaUrl || item.url, dramaUrl: item.dramaUrl || item.url },
          {
            id: item.episodeId,
            number: item.episodeNumber,
            title: item.episodeTitle,
            url: item.url,
            playUrl: item.streamUrl || '',
            directPlayUrl: item.directPlayUrl || item.streamUrl || ''
          }
        );
      });

      rail.appendChild(card);
    });
  }

  function renderRecentlyViewedRail() {
    var section = document.getElementById('section-recent-viewed');
    var rail = document.getElementById('rail-recent-viewed');
    var btnClear = document.getElementById('btn-clear-recent');
    if (!section || !rail || !global.DramaStorage) return;

    var list = global.DramaStorage.getRecentlyViewed();
    if (!list || list.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    rail.innerHTML = '';

    list.forEach(function (drama) {
      var card = document.createElement('div');
      card.className = 'rail-card';
      card.style.flex = '0 0 120px';
      card.style.width = '120px';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      card.innerHTML =
        '<div class="rail-card-media portrait">' +
          '<img src="' + escapeHtml(drama.posterUrl || '') + '" alt="' + escapeHtml(drama.title || '') + '" onerror="this.src=\'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22180%22 viewBox=%220 0 120 180%22><rect width=%22120%22 height=%22180%22 fill=%22%231e293b%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%2394a3b8%22 font-size=%2212%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>Dizi Posteri</text></svg>\'">' +
        '</div>' +
        '<div class="rail-card-body">' +
          '<div class="rail-card-title">' + escapeHtml(drama.title || 'İsimsiz') + '</div>' +
          '<div class="rail-card-sub">' + escapeHtml(drama.year || 'NartoDrama') + '</div>' +
        '</div>';

      card.addEventListener('click', function () {
        openDramaDetail(drama.id || drama.url, drama);
      });

      rail.appendChild(card);
    });

    if (btnClear) {
      btnClear.onclick = function () {
        global.DramaStorage.clearRecentlyViewed();
        renderRecentlyViewedRail();
        showToast('Son görüntülenenler temizlendi');
      };
    }
  }

  async function loadCatalog(category) {
    state.currentCategory = category || 'all';
    var grid = document.getElementById('catalog-grid');
    var errorBox = document.getElementById('catalog-error-box');
    var countBadge = document.getElementById('catalog-count-badge');
    var btnRetry = document.getElementById('btn-retry-catalog');
    var btnErrorLive = document.getElementById('btn-error-live-site');

    if (!grid) return;
    if (errorBox) errorBox.style.display = 'none';

    // Show skeletons
    grid.innerHTML =
      '<div class="drama-card skeleton" style="height: 240px;"></div>' +
      '<div class="drama-card skeleton" style="height: 240px;"></div>' +
      '<div class="drama-card skeleton" style="height: 240px;"></div>' +
      '<div class="drama-card skeleton" style="height: 240px;"></div>';

    var adapter = getAdapter();
    if (!adapter) {
      showCatalogFallback('Site Adaptörü Yüklenemedi', 'NartoDrama adaptör kütüphanesi hazır değil. Canlı site üzerinden izlemeye devam edebilirsiniz.');
      return;
    }

    try {
      var res = await adapter.getHomeCatalog({ page: 1, category: state.currentCategory });
      if (res && res.items && res.items.length > 0) {
        if (countBadge) countBadge.textContent = res.items.length + ' Dizi';
        renderDramaCards(grid, res.items);
      } else if (res && res.source === 'error') {
        showCatalogFallback('Katalog Yüklenemedi', res.error || 'NartoDrama sunucusuna ulaşılamadı. Canlı siteyi açabilirsiniz.');
      } else {
        showCatalogFallback('Dizi Bulunamadı', 'Bu kategoride henüz listelenmiş dizi bulunamadı.');
      }
    } catch (err) {
      console.warn('[DramaApp] loadCatalog error', err);
      showCatalogFallback('Ağ Hatası Oluştu', 'NartoDrama sitesine erişilirken bir kısıtlama oluştu. Canlı site modunda kesintisiz izleyebilirsiniz.');
    }

    if (btnRetry) {
      btnRetry.onclick = function () {
        loadCatalog(state.currentCategory);
      };
    }
    if (btnErrorLive) {
      btnErrorLive.onclick = function () {
        openSiteUrl('https://nartodrama.com');
      };
    }
  }

  function showCatalogFallback(title, desc) {
    var grid = document.getElementById('catalog-grid');
    var errorBox = document.getElementById('catalog-error-box');
    var errTitle = document.getElementById('catalog-error-title');
    var errDesc = document.getElementById('catalog-error-desc');

    if (grid) grid.innerHTML = '';
    if (errorBox) {
      if (errTitle) errTitle.textContent = title;
      if (errDesc) errDesc.textContent = desc;
      errorBox.style.display = 'flex';
    }
  }

  function renderDramaCards(container, items) {
    if (!container) return;
    container.innerHTML = '';

    items.forEach(function (item) {
      var card = createDramaCard(item);
      container.appendChild(card);
    });
  }

  function createDramaCard(drama) {
    var card = document.createElement('div');
    card.className = 'drama-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    var isFav = global.DramaStorage ? global.DramaStorage.isFavorite(drama.id || drama.url) : false;
    var badgeHtml = '';
    if (drama.status) {
      badgeHtml += '<span class="drama-badge badge-status">' + escapeHtml(drama.status) + '</span>';
    } else if (drama.country) {
      badgeHtml += '<span class="drama-badge">' + escapeHtml(drama.country) + '</span>';
    }

    var yearText = drama.year ? escapeHtml(drama.year) : 'Asya Draması';
    var ratingText = drama.rating ? ('★ ' + escapeHtml(drama.rating)) : '';

    card.innerHTML =
      '<div class="drama-poster-wrap">' +
        '<img src="' + escapeHtml(drama.posterUrl || '') + '" alt="' + escapeHtml(drama.title || '') + '" loading="lazy" onerror="this.src=\'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22300%22 viewBox=%220 0 200 300%22><rect width=%22200%22 height=%22300%22 fill=%22%231e293b%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%2394a3b8%22 font-size=%2214%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>Dizi Posteri</text></svg>\'">' +
        badgeHtml +
        '<button class="card-fav-btn' + (isFav ? ' active' : '') + '" type="button" aria-label="Favorilere ekle veya çıkar">' +
          '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="drama-card-info">' +
        '<h3 class="drama-card-title">' + escapeHtml(drama.title || 'İsimsiz Dizi') + '</h3>' +
        '<div class="drama-card-meta">' +
          '<span>' + yearText + '</span>' +
          (ratingText ? '<span>•</span><span>' + ratingText + '</span>' : '') +
        '</div>' +
      '</div>';

    // Favorite button click
    var favBtn = card.querySelector('.card-fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (global.DramaStorage) {
          var nowFav = global.DramaStorage.toggleFavorite(drama);
          favBtn.classList.toggle('active', nowFav);
          showToast(nowFav ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
          if (state.currentTab === 'favorites') {
            renderFavoritesTab();
          }
        }
      });
    }

    // Card body click opens detail
    card.addEventListener('click', function () {
      openDramaDetail(drama.id || drama.url, drama);
    });

    return card;
  }

  // ========================================================================
  // TAB 2: KEŞFET / ARA (SEARCH)
  // ========================================================================
  function initSearchTab() {
    var searchInput = document.getElementById('search-input');
    var searchClearBtn = document.getElementById('search-clear-btn');
    var searchSubmitBtn = document.getElementById('search-submit-btn');
    var clearSearchesBtn = document.getElementById('clear-searches-btn');
    var externalFallbackBtn = document.getElementById('search-external-fallback');

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var val = searchInput.value;
        if (searchClearBtn) {
          searchClearBtn.style.display = val.length > 0 ? 'flex' : 'none';
        }
        clearTimeout(state.searchDebounceTimer);
        state.searchDebounceTimer = setTimeout(function () {
          if (val.trim().length >= 2) {
            executeSearch(val.trim());
          }
        }, 450);
      });

      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(state.searchDebounceTimer);
          if (searchInput.value.trim().length >= 2) {
            executeSearch(searchInput.value.trim());
          }
        }
      });
    }

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', function () {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        searchClearBtn.style.display = 'none';
        resetSearchView();
      });
    }

    if (searchSubmitBtn) {
      searchSubmitBtn.addEventListener('click', function () {
        if (searchInput && searchInput.value.trim().length >= 2) {
          clearTimeout(state.searchDebounceTimer);
          executeSearch(searchInput.value.trim());
        } else {
          showToast('Lütfen en az 2 karakter girin');
        }
      });
    }

    if (clearSearchesBtn) {
      clearSearchesBtn.addEventListener('click', function () {
        if (global.DramaStorage) {
          global.DramaStorage.clearRecentSearches();
          renderRecentSearches();
          showToast('Arama geçmişi temizlendi');
        }
      });
    }

    if (externalFallbackBtn) {
      externalFallbackBtn.addEventListener('click', function () {
        var query = searchInput ? searchInput.value.trim() : '';
        var targetUrl = 'https://nartodrama.com/search?q=' + encodeURIComponent(query) + '&lang=tr-TR';
        openSiteUrl(targetUrl);
      });
    }

    renderRecentSearches();
  }

  function resetSearchView() {
    var grid = document.getElementById('search-results-grid');
    var emptyBox = document.getElementById('search-empty-box');
    if (emptyBox) emptyBox.style.display = 'none';

    if (grid) {
      grid.innerHTML =
        '<div class="empty-state-box" style="grid-column: 1 / -1;">' +
          '<div class="empty-state-icon">' +
            '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>' +
          '</div>' +
          '<h3 class="empty-state-title">NartoDrama\'da Arayın</h3>' +
          '<p class="empty-state-desc">İzlemek istediğiniz Asya dramasını veya dizi adını yukarıdaki arama kutusuna yazıp arayabilirsiniz.</p>' +
        '</div>';
    }
  }

  function renderRecentSearches() {
    var box = document.getElementById('recent-searches-box');
    var container = document.getElementById('search-chips');
    if (!box || !container || !global.DramaStorage) return;

    var searches = global.DramaStorage.getRecentSearches();
    if (!searches || searches.length === 0) {
      box.style.display = 'none';
      return;
    }

    box.style.display = 'block';
    container.innerHTML = '';

    searches.forEach(function (query) {
      var chip = document.createElement('button');
      chip.className = 'search-chip';
      chip.type = 'button';
      chip.innerHTML =
        '<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>' +
        '<span>' + escapeHtml(query) + '</span>';

      chip.addEventListener('click', function () {
        var input = document.getElementById('search-input');
        var clearBtn = document.getElementById('search-clear-btn');
        if (input) {
          input.value = query;
          if (clearBtn) clearBtn.style.display = 'flex';
          executeSearch(query);
        }
      });

      container.appendChild(chip);
    });
  }

  async function executeSearch(query) {
    if (!query || query.length < 2) return;
    var grid = document.getElementById('search-results-grid');
    var emptyBox = document.getElementById('search-empty-box');
    var emptyTitle = document.getElementById('search-empty-title');
    var emptyDesc = document.getElementById('search-empty-desc');
    var fallbackBtn = document.getElementById('search-external-fallback');

    if (emptyBox) emptyBox.style.display = 'none';

    // Save search history
    if (global.DramaStorage) {
      global.DramaStorage.addRecentSearch(query);
      renderRecentSearches();
    }

    // Show skeletons
    if (grid) {
      grid.innerHTML =
        '<div class="drama-card skeleton" style="height: 240px;"></div>' +
        '<div class="drama-card skeleton" style="height: 240px;"></div>';
    }

    var adapter = getAdapter();
    if (!adapter) {
      if (grid) grid.innerHTML = '';
      if (emptyBox) {
        if (emptyTitle) emptyTitle.textContent = 'Arama Yapılamadı';
        if (emptyDesc) emptyDesc.textContent = 'Site adaptörü hazır değil. Canlı sitede arayabilirsiniz.';
        emptyBox.style.display = 'flex';
      }
      return;
    }

    try {
      var res = await adapter.search(query);
      if (res && res.items && res.items.length > 0) {
        if (grid) renderDramaCards(grid, res.items);
      } else {
        if (grid) grid.innerHTML = '';
        if (emptyBox) {
          if (emptyTitle) emptyTitle.textContent = '"' + escapeHtml(query) + '" İçin Sonuç Bulunamadı';
          if (emptyDesc) emptyDesc.textContent = 'Dizi başlığını farklı yazmayı deneyebilir veya NartoDrama canlı sitesinde doğrudan arayabilirsiniz.';
          if (fallbackBtn && res && res.externalSearchUrl) {
            fallbackBtn.onclick = function () {
              openSiteUrl(res.externalSearchUrl);
            };
          }
          emptyBox.style.display = 'flex';
        }
      }
    } catch (e) {
      console.warn('[DramaApp] search error', e);
      if (grid) grid.innerHTML = '';
      if (emptyBox) {
        if (emptyTitle) emptyTitle.textContent = 'Arama Hatası';
        if (emptyDesc) emptyDesc.textContent = 'Arama yapılırken bir ağ kısıtlaması oluştu. Canlı site üzerinden arayabilirsiniz.';
        emptyBox.style.display = 'flex';
      }
    }
  }

  // ========================================================================
  // TAB 3: FAVORİLER (FAVORITES)
  // ========================================================================
  function renderFavoritesTab() {
    var grid = document.getElementById('favorites-grid');
    var emptyBox = document.getElementById('favorites-empty-box');
    var badge = document.getElementById('fav-count-badge');
    if (!grid || !global.DramaStorage) return;

    var favorites = global.DramaStorage.getFavorites();
    if (badge) {
      badge.textContent = favorites.length + ' Dizi';
    }

    if (!favorites || favorites.length === 0) {
      grid.innerHTML = '';
      if (emptyBox) emptyBox.style.display = 'flex';
      return;
    }

    if (emptyBox) emptyBox.style.display = 'none';
    renderDramaCards(grid, favorites);
  }

  // ========================================================================
  // TAB 4: İNDİRİLENLER & YEREL KÜTÜPHANE (DOWNLOADS)
  // ========================================================================
  function initDownloadsTab() {
    var btnPickLocal = document.getElementById('btn-pick-local-video');
    var fileInput = document.getElementById('local-video-file-input');

    if (btnPickLocal) {
      btnPickLocal.addEventListener('click', function () {
        var bridge = getBridge();
        // If Android bridge supports SAF file picker
        if (bridge && typeof bridge.pickLocalVideo === 'function') {
          try {
            bridge.pickLocalVideo();
            return;
          } catch (e) {
            console.warn('[DramaApp] pickLocalVideo bridge call failed, falling back to input', e);
          }
        }
        // HTML5 File Input fallback
        if (fileInput) {
          fileInput.click();
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var blobUrl = URL.createObjectURL(file);
        playEpisode(
          { id: 'local_' + Date.now(), title: file.name, posterUrl: '', url: blobUrl },
          { id: 'ep_local', number: 'Yerel', title: file.name, url: blobUrl, directUrl: blobUrl },
          { isLocal: true, streamUrl: blobUrl }
        );
        showToast('Yerel video oynatılıyor');
      });
    }

    // Android Bridge Hook for picked video URI
    global.onLocalVideoSelected = function (videoUri, title) {
      if (!videoUri) return;
      var cleanTitle = title || 'Yerel Video';
      playEpisode(
        { id: 'android_local_' + Date.now(), title: cleanTitle, posterUrl: '', url: videoUri },
        { id: 'ep_android_local', number: 'Yerel', title: cleanTitle, url: videoUri, directUrl: videoUri },
        { isLocal: true, streamUrl: videoUri }
      );
      showToast('Cihaz videosu oynatılıyor');
    };
    global.playLocalVideo = global.onLocalVideoSelected;

    renderDownloadsTab();
  }

  function renderDownloadsTab() {
    renderAuthorizedSamples();
    renderDownloadsList();
  }

  function renderAuthorizedSamples() {
    var container = document.getElementById('sample-media-list');
    if (!container) return;

    var adapter = getAdapter();
    var samples = [];
    if (adapter && typeof adapter.getAuthorizedSamples === 'function') {
      samples = adapter.getAuthorizedSamples();
    } else {
      // Fallback authorized open-license media
      samples = [
        {
          id: 'sample_big_buck_bunny',
          title: 'Big Buck Bunny (Açık Lisans)',
          description: 'Açık lisanslı test videosu (Blender Foundation / Creative Commons 3.0)',
          fileName: 'BigBuckBunny_720p.mp4',
          streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          posterUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
          duration: '9:56',
          isSample: true
        },
        {
          id: 'sample_sintel',
          title: 'Sintel Açık Animasyon Testi',
          description: 'Blender Vakfı açık kaynaklı animasyon filmi',
          fileName: 'Sintel_720p.mp4',
          streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
          posterUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg',
          duration: '14:48',
          isSample: true
        },
        {
          id: 'sample_tears_of_steel',
          title: 'Tears of Steel Açık Bilim Kurgu',
          description: 'CC-BY açık lisanslı VFX ve ses test medyası',
          fileName: 'TearsOfSteel_720p.mp4',
          streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
          posterUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg',
          duration: '12:14',
          isSample: true
        }
      ];
    }

    container.innerHTML = '';

    var activeDownloads = global.DramaStorage ? global.DramaStorage.getDownloads() : [];
    var downloadMap = {};
    activeDownloads.forEach(function (d) {
      downloadMap[d.id || d.downloadId] = d;
      if (d.url) downloadMap[d.url] = d;
    });

    samples.forEach(function (sample) {
      var itemCard = document.createElement('div');
      itemCard.className = 'download-item-card';

      var record = downloadMap[sample.id] || downloadMap[sample.streamUrl];
      var status = record ? record.status : null; // RUNNING, SUCCESSFUL, FAILED, PAUSED
      var progress = record ? (record.progress || 0) : 0;

      var actionsHtml = '';
      var progressHtml = '';

      if (status === 'RUNNING' || status === 'PENDING') {
        progressHtml =
          '<div class="download-progress-wrap">' +
            '<div class="download-progress-fill" style="width:' + progress + '%;"></div>' +
          '</div>';
        actionsHtml =
          '<span class="download-status-label">İndiriliyor: %' + progress + '</span>' +
          '<div class="download-btn-group">' +
            '<button class="btn-sm btn-sm-danger btn-cancel-dl" data-id="' + escapeHtml(record.downloadId || record.id) + '" type="button">İptal</button>' +
          '</div>';
      } else if (status === 'SUCCESSFUL') {
        actionsHtml =
          '<span class="download-status-label" style="color:var(--status-success);">Tamamlandı</span>' +
          '<div class="download-btn-group">' +
            '<button class="btn-sm btn-sm-primary btn-play-dl" data-url="' + escapeHtml(record.localUri || sample.streamUrl) + '" data-title="' + escapeHtml(sample.title) + '" type="button">Çevrimdışı İzle</button>' +
          '</div>';
      } else {
        actionsHtml =
          '<span class="download-status-label">' + escapeHtml(sample.duration || 'Açık Medya') + '</span>' +
          '<div class="download-btn-group">' +
            '<button class="btn-sm btn-sm-secondary btn-stream-sample" type="button">Önizle</button>' +
            '<button class="btn-sm btn-sm-primary btn-start-dl" type="button">İndir</button>' +
          '</div>';
      }

      itemCard.innerHTML =
        '<div class="download-item-header">' +
          '<div class="download-item-thumb">' +
            '<img src="' + escapeHtml(sample.posterUrl || '') + '" alt="' + escapeHtml(sample.title) + '" onerror="this.src=\'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22><rect width=%2260%22 height=%2260%22 fill=%22%231e293b%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%2394a3b8%22 font-size=%2210%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>Video</text></svg>\'">' +
          '</div>' +
          '<div class="download-item-info">' +
            '<span class="download-item-badge">Test İçeriği • Açık Lisans</span>' +
            '<h4 class="download-item-title">' + escapeHtml(sample.title) + '</h4>' +
            '<p class="download-item-sub">' + escapeHtml(sample.description || '') + '</p>' +
          '</div>' +
        '</div>' +
        progressHtml +
        '<div class="download-actions-row">' +
          actionsHtml +
        '</div>';

      // Event handlers
      var btnStart = itemCard.querySelector('.btn-start-dl');
      if (btnStart) {
        btnStart.addEventListener('click', function () {
          startDownload(sample);
        });
      }

      var btnStream = itemCard.querySelector('.btn-stream-sample');
      if (btnStream) {
        btnStream.addEventListener('click', function () {
          playEpisode(
            { id: sample.id, title: sample.title, posterUrl: sample.posterUrl, url: sample.streamUrl },
            { id: sample.id, number: 'Test', title: sample.title, url: sample.streamUrl, directUrl: sample.streamUrl },
            { isSample: true, streamUrl: sample.streamUrl }
          );
        });
      }

      var btnCancel = itemCard.querySelector('.btn-cancel-dl');
      if (btnCancel) {
        btnCancel.addEventListener('click', function () {
          var id = btnCancel.getAttribute('data-id');
          cancelDownload(id);
        });
      }

      var btnPlay = itemCard.querySelector('.btn-play-dl');
      if (btnPlay) {
        btnPlay.addEventListener('click', function () {
          var playUrl = btnPlay.getAttribute('data-url');
          var title = btnPlay.getAttribute('data-title');
          playEpisode(
            { id: sample.id, title: title, posterUrl: sample.posterUrl, url: playUrl },
            { id: sample.id, number: 'Çevrimdışı', title: title, url: playUrl, directUrl: playUrl },
            { isLocal: true, streamUrl: playUrl }
          );
        });
      }

      container.appendChild(itemCard);
    });
  }

  function startDownload(sample) {
    if (!sample || !sample.streamUrl) return;
    var bridge = getBridge();
    var fileName = sample.fileName || (sample.id + '.mp4');

    if (bridge && typeof bridge.enqueueDownload === 'function') {
      try {
        var resRaw = bridge.enqueueDownload(sample.streamUrl, sample.title, fileName);
        var res = typeof resRaw === 'string' ? JSON.parse(resRaw) : resRaw;
        if (res && res.ok) {
          global.DramaStorage.saveDownloadRecord({
            id: res.downloadId,
            downloadId: res.downloadId,
            title: sample.title,
            fileName: res.fileName || fileName,
            url: sample.streamUrl,
            status: 'RUNNING',
            progress: 0,
            isSample: true
          });
          showToast('İndirme başlatıldı');
          renderDownloadsTab();
          return;
        } else {
          showToast(res && res.error ? ('Hata: ' + res.error) : 'İndirme başlatılamadı');
        }
      } catch (err) {
        console.warn('[DramaApp] enqueueDownload error', err);
      }
    }

    // Browser simulation fallback for testing outside Android WebView
    var simId = 'sim_' + Date.now();
    global.DramaStorage.saveDownloadRecord({
      id: simId,
      downloadId: simId,
      title: sample.title,
      fileName: fileName,
      url: sample.streamUrl,
      status: 'RUNNING',
      progress: 5,
      isSample: true
    });
    showToast('[Simülasyon] Test indirmesi başlatıldı');
    renderDownloadsTab();

    // Simulate progress increments
    var currentProg = 5;
    var simInterval = setInterval(function () {
      currentProg += 25;
      if (currentProg >= 100) {
        clearInterval(simInterval);
        global.DramaStorage.saveDownloadRecord({
          id: simId,
          downloadId: simId,
          title: sample.title,
          fileName: fileName,
          url: sample.streamUrl,
          status: 'SUCCESSFUL',
          progress: 100,
          localUri: sample.streamUrl,
          isSample: true
        });
        showToast(sample.title + ' indirildi!');
        renderDownloadsTab();
      } else {
        global.DramaStorage.saveDownloadRecord({
          id: simId,
          downloadId: simId,
          title: sample.title,
          fileName: fileName,
          url: sample.streamUrl,
          status: 'RUNNING',
          progress: currentProg,
          isSample: true
        });
        renderDownloadsTab();
      }
    }, 800);
  }

  function cancelDownload(downloadId) {
    if (!downloadId) return;
    var bridge = getBridge();
    if (bridge && typeof bridge.cancelDownload === 'function') {
      try {
        bridge.cancelDownload(downloadId);
      } catch (e) {
        console.warn('[DramaApp] cancelDownload error', e);
      }
    }
    if (global.DramaStorage) {
      global.DramaStorage.removeDownloadRecord(downloadId);
      showToast('İndirme iptal edildi');
      renderDownloadsTab();
    }
  }

  function renderDownloadsList() {
    var container = document.getElementById('downloads-list');
    var emptyBox = document.getElementById('downloads-empty-box');
    var badge = document.getElementById('downloads-mode-badge');
    if (!container || !global.DramaStorage) return;

    var bridge = getBridge();
    if (badge) {
      badge.textContent = bridge ? 'Android Köprüsü' : 'Web Tarayıcı Modu';
    }

    var list = global.DramaStorage.getDownloads();
    if (!list || list.length === 0) {
      container.innerHTML = '';
      if (emptyBox) emptyBox.style.display = 'block';
      return;
    }

    if (emptyBox) emptyBox.style.display = 'none';
    container.innerHTML = '';

    list.forEach(function (rec) {
      var itemCard = document.createElement('div');
      itemCard.className = 'download-item-card';

      var statusText = 'Bekliyor';
      var statusColor = 'var(--text-secondary)';
      if (rec.status === 'RUNNING') {
        statusText = 'İndiriliyor: %' + (rec.progress || 0);
        statusColor = 'var(--accent-light)';
      } else if (rec.status === 'SUCCESSFUL') {
        statusText = 'Tamamlandı';
        statusColor = 'var(--status-success)';
      } else if (rec.status === 'FAILED') {
        statusText = 'Hata: ' + (rec.reason || 'İndirilemedi');
        statusColor = 'var(--status-danger)';
      }

      var progressHtml = '';
      if (rec.status === 'RUNNING') {
        progressHtml =
          '<div class="download-progress-wrap">' +
            '<div class="download-progress-fill" style="width:' + (rec.progress || 0) + '%;"></div>' +
          '</div>';
      }

      var actionButtons = '';
      if (rec.status === 'SUCCESSFUL') {
        actionButtons += '<button class="btn-sm btn-sm-primary btn-play-dl" type="button">İzle</button>';
      }
      actionButtons += '<button class="btn-sm btn-sm-danger btn-del-dl" type="button">Kaldır</button>';

      itemCard.innerHTML =
        '<div class="download-item-header">' +
          '<div class="download-item-info">' +
            '<h4 class="download-item-title">' + escapeHtml(rec.title || rec.fileName || 'Video Dosyası') + '</h4>' +
            '<p class="download-item-sub">' + escapeHtml(rec.fileName || '') + '</p>' +
          '</div>' +
        '</div>' +
        progressHtml +
        '<div class="download-actions-row">' +
          '<span class="download-status-label" style="color:' + statusColor + ';">' + statusText + '</span>' +
          '<div class="download-btn-group">' + actionButtons + '</div>' +
        '</div>';

      var btnPlay = itemCard.querySelector('.btn-play-dl');
      if (btnPlay) {
        btnPlay.addEventListener('click', function () {
          var targetUri = rec.localUri || rec.url;
          playEpisode(
            { id: rec.id, title: rec.title, posterUrl: '', url: targetUri },
            { id: rec.id, number: 'İndirilen', title: rec.title, url: targetUri, directUrl: targetUri },
            { isLocal: true, streamUrl: targetUri }
          );
        });
      }

      var btnDel = itemCard.querySelector('.btn-del-dl');
      if (btnDel) {
        btnDel.addEventListener('click', function () {
          cancelDownload(rec.downloadId || rec.id);
        });
      }

      container.appendChild(itemCard);
    });
  }

  function startDownloadsPolling() {
    stopDownloadsPolling();
    state.downloadsPollTimer = setInterval(function () {
      var bridge = getBridge();
      if (bridge && typeof bridge.getDownloadsStatus === 'function') {
        try {
          var raw = bridge.getDownloadsStatus();
          if (raw && global.DramaStorage) {
            global.DramaStorage.syncWithAndroid(raw);
            renderDownloadsList();
          }
        } catch (e) {
          console.warn('[DramaApp] downloads polling error', e);
        }
      }
    }, 2500);
  }

  function stopDownloadsPolling() {
    if (state.downloadsPollTimer) {
      clearInterval(state.downloadsPollTimer);
      state.downloadsPollTimer = null;
    }
  }

  // ========================================================================
  // DRAMA DETAIL MODAL / SHEET
  // ========================================================================
  async function openDramaDetail(idOrUrl, preloadedDrama) {
    var modal = document.getElementById('detail-modal');
    var posterImg = document.getElementById('detail-poster');
    var titleEl = document.getElementById('detail-drama-title');
    var origTitleEl = document.getElementById('detail-drama-original');
    var tagsEl = document.getElementById('detail-tags');
    var synopsisEl = document.getElementById('detail-synopsis');
    var episodesGrid = document.getElementById('detail-episodes-grid');
    var episodesCountEl = document.getElementById('detail-episodes-count');
    var favBtn = document.getElementById('detail-fav-btn');
    var favText = document.getElementById('detail-fav-text');
    var siteBtn = document.getElementById('detail-open-site-btn');
    var closeBtn = document.getElementById('detail-close-btn');

    if (!modal) return;

    state.currentDrama = preloadedDrama || { id: idOrUrl, title: 'Dizi Detayı', url: idOrUrl };

    // Track recently viewed
    if (global.DramaStorage) {
      global.DramaStorage.addRecentlyViewed(state.currentDrama);
    }

    // Preload available data
    if (posterImg) posterImg.src = state.currentDrama.posterUrl || '';
    if (titleEl) titleEl.textContent = state.currentDrama.title || 'Dizi Detayı';
    if (origTitleEl) origTitleEl.textContent = state.currentDrama.originalTitle || '';
    if (synopsisEl) synopsisEl.textContent = state.currentDrama.description || 'Dizi ayrıntıları NartoDrama üzerinden yükleniyor...';

    // Tags
    if (tagsEl) {
      tagsEl.innerHTML = '';
      if (state.currentDrama.year) tagsEl.innerHTML += '<span class="meta-tag">' + escapeHtml(state.currentDrama.year) + '</span>';
      if (state.currentDrama.status) tagsEl.innerHTML += '<span class="meta-tag">' + escapeHtml(state.currentDrama.status) + '</span>';
      if (state.currentDrama.rating) tagsEl.innerHTML += '<span class="meta-tag">★ ' + escapeHtml(state.currentDrama.rating) + '</span>';
      if (Array.isArray(state.currentDrama.genres)) {
        state.currentDrama.genres.forEach(function (g) {
          tagsEl.innerHTML += '<span class="meta-tag">' + escapeHtml(g) + '</span>';
        });
      }
    }

    // Favorite state
    updateDetailFavButton();

    if (favBtn) {
      favBtn.onclick = function () {
        if (global.DramaStorage && state.currentDrama) {
          var nowFav = global.DramaStorage.toggleFavorite(state.currentDrama);
          updateDetailFavButton();
          showToast(nowFav ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı');
          if (state.currentTab === 'favorites') {
            renderFavoritesTab();
          }
        }
      };
    }

    if (siteBtn) {
      siteBtn.onclick = function () {
        var targetUrl = state.currentDrama.url || 'https://nartodrama.com';
        openSiteUrl(targetUrl);
      };
    }

    if (closeBtn) {
      closeBtn.onclick = closeDetailModal;
    }

    // Close on backdrop tap
    modal.onclick = function (e) {
      if (e.target === modal) {
        closeDetailModal();
      }
    };

    // Episodes skeleton
    if (episodesGrid) {
      episodesGrid.innerHTML =
        '<div class="episode-btn skeleton" style="height:48px;"></div>' +
        '<div class="episode-btn skeleton" style="height:48px;"></div>' +
        '<div class="episode-btn skeleton" style="height:48px;"></div>';
    }

    var detailNotice = document.getElementById('detail-policy-notice');
    if (detailNotice && global.DramaStorage && global.DramaStorage.isNoticeDismissed('detail-policy-notice')) {
      detailNotice.style.display = 'none';
    }

    modal.classList.add('open');

    // Fetch full details via SiteAdapter
    var adapter = getAdapter();
    if (adapter && typeof adapter.getDramaDetails === 'function') {
      try {
        var detailRes = await adapter.getDramaDetails(idOrUrl);
        if (detailRes && detailRes.drama) {
          state.currentDrama = Object.assign({}, state.currentDrama, detailRes.drama);
          if (posterImg && state.currentDrama.posterUrl) posterImg.src = state.currentDrama.posterUrl;
          if (titleEl) titleEl.textContent = state.currentDrama.title;
          if (origTitleEl) origTitleEl.textContent = state.currentDrama.originalTitle || '';
          if (synopsisEl) synopsisEl.textContent = state.currentDrama.description || 'Özet bulunamadı.';
        }

        var episodes = (detailRes && Array.isArray(detailRes.episodes)) ? detailRes.episodes : [];
        state.currentEpisodes = episodes;
        state.currentEpisodesDramaKey = getDramaLookupKey(state.currentDrama);
        if (episodesCountEl) episodesCountEl.textContent = episodes.length + ' Bölüm';
        renderEpisodesGrid(episodesGrid, episodes);
      } catch (err) {
        console.warn('[DramaApp] getDramaDetails error', err);
        if (synopsisEl) synopsisEl.textContent = 'Detaylar yüklenirken kısıtlama oluştu. Bölümleri izlemek için Canlı Site butonunu kullanabilirsiniz.';
        renderEpisodesFallback(episodesGrid);
      }
    } else {
      renderEpisodesFallback(episodesGrid);
    }
  }

  function updateDetailFavButton() {
    var favBtn = document.getElementById('detail-fav-btn');
    var favText = document.getElementById('detail-fav-text');
    if (!favBtn || !global.DramaStorage || !state.currentDrama) return;

    var isFav = global.DramaStorage.isFavorite(state.currentDrama.id || state.currentDrama.url);
    favBtn.classList.toggle('active', isFav);
    if (favText) {
      favText.textContent = isFav ? 'Favorilerden Çıkar' : 'Favoriye Ekle';
    }
  }

  function renderEpisodesGrid(container, episodes) {
    if (!container) return;
    container.innerHTML = '';

    if (!episodes || episodes.length === 0) {
      renderEpisodesFallback(container);
      return;
    }

    episodes.forEach(function (ep, idx) {
      var btn = document.createElement('button');
      btn.className = 'episode-btn';
      btn.type = 'button';

      var epNum = ep.number || (idx + 1);
      var progress = global.DramaStorage ? global.DramaStorage.getEpisodeProgress(ep.id || ep.url) : null;
      var subText = progress ? ('Kaldığınız yer: %' + progress.progressPercent) : (ep.title || 'Bölümü İzle');

      btn.innerHTML =
        '<div class="episode-btn-num">' +
          '<span>Bölüm ' + escapeHtml(epNum) + '</span>' +
          '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' +
        '</div>' +
        '<div class="episode-btn-sub">' + escapeHtml(subText) + '</div>';

      btn.addEventListener('click', function () {
        playEpisode(state.currentDrama, ep);
      });

      container.appendChild(btn);
    });
  }

  function renderEpisodesFallback(container) {
    if (!container) return;
    container.innerHTML =
      '<div style="grid-column: 1 / -1; padding: 14px; background: var(--bg-card); border-radius: var(--radius-md); text-align: center;">' +
        '<p style="font-size: 0.82rem; color: var(--text-secondary); margin-bottom: 10px;">Bölümler NartoDrama korumalı video oynatıcısında yer almaktadır.</p>' +
        '<button class="banner-action-btn" type="button" id="btn-fallback-open-drama">' +
          '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>' +
          '<span>Bölümleri Canlı Sitede İzle</span>' +
        '</button>' +
      '</div>';

    var btn = container.querySelector('#btn-fallback-open-drama');
    if (btn) {
      btn.onclick = function () {
        var url = (state.currentDrama && state.currentDrama.url) ? state.currentDrama.url : 'https://nartodrama.com';
        openSiteUrl(url);
      };
    }
  }

  function closeDetailModal() {
    var modal = document.getElementById('detail-modal');
    if (modal) {
      modal.classList.remove('open');
    }
    state.currentDrama = null;
  }

  // ========================================================================
  // IN-APP VIDEO PLAYER MODAL & AUTO-ADVANCE
  // ========================================================================
  function getAdjacentEpisode(offset) {
    var list = state.currentEpisodes;
    var cur = state.currentEpisode;
    if (!Array.isArray(list) || list.length === 0 || !cur) return null;

    var curIdx = -1;
    for (var i = 0; i < list.length; i++) {
      var ep = list[i];
      if (cur.id && ep.id && String(ep.id) === String(cur.id)) {
        curIdx = i;
        break;
      }
      if (cur.number !== undefined && cur.number !== '' && ep.number !== undefined && Number(ep.number) === Number(cur.number)) {
        curIdx = i;
        break;
      }
      if (cur.url && ep.url && ep.url === cur.url) {
        curIdx = i;
        break;
      }
    }

    if (curIdx !== -1) {
      var targetIdx = curIdx + offset;
      if (targetIdx >= 0 && targetIdx < list.length) {
        return list[targetIdx];
      }
    } else if (cur.number !== undefined && cur.number !== '') {
      var targetNum = Number(cur.number) + offset;
      for (var j = 0; j < list.length; j++) {
        if (Number(list[j].number) === targetNum) {
          return list[j];
        }
      }
    }
    return null;
  }

  function updatePlayerEpisodeNavButtons() {
    var prevBtn = document.getElementById('player-prev-btn');
    var nextBtn = document.getElementById('player-next-btn');
    var prevEp = getAdjacentEpisode(-1);
    var nextEp = getAdjacentEpisode(1);

    if (prevBtn) {
      if (prevEp) {
        prevBtn.style.display = 'inline-flex';
        prevBtn.onclick = function () {
          showToast('Önceki bölüme geçiliyor: Bölüm ' + (prevEp.number || ''));
          playEpisode(state.currentDrama, prevEp);
        };
      } else {
        prevBtn.style.display = 'none';
        prevBtn.onclick = null;
      }
    }

    if (nextBtn) {
      if (nextEp) {
        nextBtn.style.display = 'inline-flex';
        nextBtn.onclick = function () {
          showToast('Sonraki bölüme geçiliyor: Bölüm ' + (nextEp.number || ''));
          playEpisode(state.currentDrama, nextEp);
        };
      } else {
        nextBtn.style.display = 'none';
        nextBtn.onclick = null;
      }
    }
  }

  async function ensureEpisodesLoadedForCurrentDrama(drama, episodePageUrl) {
    if (!drama && !episodePageUrl) return state.currentEpisodes;
    var key = getDramaLookupKey(drama || { url: episodePageUrl });
    if (Array.isArray(state.currentEpisodes) && state.currentEpisodes.length > 0 && state.currentEpisodesDramaKey === key) {
      return state.currentEpisodes;
    }

    var adapter = getAdapter();
    if (!adapter || typeof adapter.getDramaDetails !== 'function') return [];

    var lookupTarget = (drama && (drama.dramaUrl || drama.url || drama.id)) || episodePageUrl || '';
    if (!lookupTarget) return [];

    // Strip episode number suffix if lookupTarget is an episode URL so getDramaDetails fetches overview + ep 1 playlist
    var slugMatch = String(lookupTarget).match(/^(https?:\/\/[^/]+\/detail\/watch\/[^/?#]+)\/\d+/i);
    if (slugMatch && slugMatch[1]) {
      lookupTarget = slugMatch[1] + '?lang=tr-TR';
    }

    try {
      var detailRes = await adapter.getDramaDetails(lookupTarget);
      if (detailRes && Array.isArray(detailRes.episodes) && detailRes.episodes.length > 0) {
        state.currentEpisodes = detailRes.episodes;
        state.currentEpisodesDramaKey = key;
        if (detailRes.drama && state.currentDrama) {
          state.currentDrama = Object.assign({}, detailRes.drama, state.currentDrama);
        }
        updatePlayerEpisodeNavButtons();
        return state.currentEpisodes;
      }
    } catch (e) {
      console.warn('[DramaApp] ensureEpisodesLoadedForCurrentDrama error', e);
    }
    return state.currentEpisodes || [];
  }

  function saveCurrentEpisodeProgress(drama, episode, posSec, durSec, streamUrl) {
    if (!global.DramaStorage || !episode) return;
    if (episode.isSample) return;
    var dramaUrl = (drama && (drama.dramaUrl || drama.url)) || '';
    var epUrl = episode.url || episode.watch_url || dramaUrl || '';
    global.DramaStorage.savePlaybackProgress({
      dramaId: (drama && drama.id) || '',
      dramaTitle: (drama && drama.title) || 'Dizi',
      dramaUrl: dramaUrl,
      posterUrl: (drama && (drama.posterUrl || drama.poster)) || episode.posterUrl || '',
      episodeId: episode.id || ('ep_' + (episode.number || '1')),
      episodeNumber: episode.number !== undefined ? episode.number : '',
      episodeTitle: episode.title || '',
      positionSec: posSec || 0,
      durationSec: durSec || 0,
      url: epUrl,
      streamUrl: streamUrl || episode.playUrl || '',
      directPlayUrl: episode.directPlayUrl || streamUrl || ''
    });
  }

  async function playEpisode(drama, episode, directPlaybackInfo) {
    var modal = document.getElementById('player-modal');
    var dramaTitleEl = document.getElementById('player-drama-title');
    var epTitleEl = document.getElementById('player-episode-title');
    var videoEl = document.getElementById('player-video-element');
    var iframeEl = document.getElementById('player-iframe-element');
    var fallbackCard = document.getElementById('player-fallback-card');
    var fallbackBtn = document.getElementById('player-open-site-btn');
    var closeBtn = document.getElementById('player-close-btn');

    if (!modal) return;

    state.currentDrama = drama || state.currentDrama;
    state.currentEpisode = episode;

    if (dramaTitleEl) dramaTitleEl.textContent = (state.currentDrama && state.currentDrama.title) ? state.currentDrama.title : 'DramaPocket Oynatıcı';
    var epNumber = episode ? (episode.number || '') : '';
    var epName = episode ? (episode.title || (epNumber ? (epNumber + '. Bölüm') : 'Bölüm')) : '';
    if (epTitleEl) epTitleEl.textContent = epName;

    // Reset player components to clean state
    if (videoEl) {
      videoEl.onerror = null;
      videoEl.onended = null;
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
      videoEl.style.display = 'none';
    }
    if (iframeEl) {
      iframeEl.src = 'about:blank';
      iframeEl.style.display = 'none';
    }
    if (fallbackCard) fallbackCard.style.display = 'none';

    // Close button handler
    if (closeBtn) {
      closeBtn.onclick = closePlayer;
    }

    updatePlayerEpisodeNavButtons();

    // Resolve playback information (using SiteAdapter or provided directPlaybackInfo)
    var playbackInfo = directPlaybackInfo || null;
    if (!playbackInfo) {
      var adapter = getAdapter();
      if (adapter && typeof adapter.getPlaybackInfo === 'function') {
        try {
          playbackInfo = await adapter.getPlaybackInfo(episode);
        } catch (e) {
          console.warn('[DramaApp] getPlaybackInfo error', e);
        }
      }
    }

    var episodePageUrl = (playbackInfo && playbackInfo.pageUrl) ||
      (episode && (episode.url || episode.watch_url)) ||
      (state.currentDrama && state.currentDrama.url) ||
      'https://nartodrama.com';

    // Preload episode list in background if not yet populated (e.g. launched from Continue Watching)
    if (!episode || !episode.isSample) {
      ensureEpisodesLoadedForCurrentDrama(state.currentDrama, episodePageUrl);
    }

    // 1. Direct video stream (Authorized samples, local videos, or direct HLS/MP4 stream URLs)
    if (playbackInfo && (playbackInfo.type === 'direct' || playbackInfo.streamUrl) && videoEl) {
      modal.classList.add('open');
      videoEl.style.display = 'block';

      var primaryStream = playbackInfo.streamUrl || (episode && episode.directUrl) || '';
      var fallbackStream = (playbackInfo.directPlayUrl && playbackInfo.directPlayUrl !== primaryStream) ? playbackInfo.directPlayUrl :
        (playbackInfo.hlsPlayUrl && playbackInfo.hlsPlayUrl !== primaryStream ? playbackInfo.hlsPlayUrl : null);

      state.currentStreamUrl = primaryStream;
      var triedFallback = false;

      // Auto-advance to the next episode when the current video finishes
      videoEl.onended = async function () {
        stopPlaybackTracking();
        if (videoEl.duration > 0) {
          saveCurrentEpisodeProgress(state.currentDrama, state.currentEpisode, videoEl.duration, videoEl.duration, state.currentStreamUrl);
        }
        await ensureEpisodesLoadedForCurrentDrama(state.currentDrama, episodePageUrl);
        var nextEp = getAdjacentEpisode(1);
        if (nextEp) {
          var nextLabel = nextEp.number ? (nextEp.number + '. Bölüme') : 'Sonraki bölüme';
          showToast(nextLabel + ' otomatik geçiliyor...');
          playEpisode(state.currentDrama, nextEp);
        } else {
          showToast('Dizinin son bölümü tamamlandı.');
          if (state.currentTab === 'home') {
            renderContinueWatchingRail();
          }
        }
      };

      // Handle stream errors (e.g. desktop browsers without native HLS support or tokens requiring ad-gate)
      videoEl.onerror = function () {
        console.warn('[DramaApp] Video element failed to play stream:', videoEl.src);

        // Attempt secondary stream if available
        if (!triedFallback && fallbackStream && fallbackStream !== videoEl.src) {
          triedFallback = true;
          state.currentStreamUrl = fallbackStream;
          console.log('[DramaApp] Switching to fallback stream:', fallbackStream);
          videoEl.src = fallbackStream;
          videoEl.play().catch(function (e) {
            console.log('[DramaApp] Fallback autoplay error:', e);
          });
          return;
        }

        // Both primary and fallback failed; transition to safe in-app WebView episode view
        videoEl.style.display = 'none';
        videoEl.removeAttribute('src');

        if (fallbackCard) {
          fallbackCard.style.display = 'flex';
          var fallbackTitle = document.getElementById('player-fallback-title');
          var errDesc = document.getElementById('player-fallback-desc');
          var openSiteText = document.getElementById('player-open-site-text');

          if (fallbackTitle) fallbackTitle.textContent = 'Uygulama İçi Oynatıcı';
          if (errDesc) {
            errDesc.textContent = (playbackInfo && playbackInfo.adGateDetected)
              ? 'Bu bölüm NartoDrama reklam doğrulaması ("İzlemeden önce reklam") veya oturum gerektirmektedir. Kesintisiz izlemek için bölümü güvenli uygulama içi oynatıcıda açabilirsiniz.'
              : 'Doğrudan video akışı bu ortamda oynatılamadı. Bölümü kesintisiz izlemek için güvenli uygulama içi oynatıcıda açabilirsiniz.';
          }
          if (openSiteText) openSiteText.textContent = 'Uygulama İçi Oynatıcıda Aç';
        }

        if (fallbackBtn) {
          fallbackBtn.onclick = function () {
            openSiteUrl(episodePageUrl);
          };
        }
        showToast('Video akışı açılamadı, uygulama içi oynatıcı hazırlandı');
      };

      videoEl.src = primaryStream;

      // Restore playback progress (unless previously completed >= 95%, in which case start fresh from 0)
      var initialPos = 0;
      if (global.DramaStorage && episode && (episode.id || episode.url)) {
        var existingProgress = global.DramaStorage.getEpisodeProgress(episode.id || episode.url);
        if (existingProgress && existingProgress.positionSec > 0 && !existingProgress.completed) {
          initialPos = existingProgress.positionSec;
          videoEl.currentTime = initialPos;
        }
      }

      // Immediately record this episode as the latest watched episode for this drama
      if (!playbackInfo.isAuthorizedSample) {
        saveCurrentEpisodeProgress(state.currentDrama, episode, initialPos, 0, primaryStream);
      }

      videoEl.play().catch(function (e) {
        console.log('[DramaApp] Autoplay blocked, user interaction needed', e);
      });

      // Track playback progress every 5 seconds
      startPlaybackTracking(state.currentDrama, episode, videoEl, primaryStream);

    // 2. In-App WebView Playback (Ad-gate verification required or no direct stream without interactive session)
    // NEVER load NartoDrama in an iframe (X-Frame-Options: DENY and ND-WG-PROBE block framing / redirect to /open-in-browser)
    } else {
      // If upstream explicitly marked the drama/episode unavailable (delisted), show a clean message instead of opening live site
      var bridge = getBridge();
      if (!(playbackInfo && playbackInfo.unavailable) && bridge && typeof bridge.openSiteWebView === 'function') {
        showToast('Bölüm uygulama içi oynatıcıda açılıyor...');
        bridge.openSiteWebView(episodePageUrl);
        return;
      }

      // Browser / dev fallback or unavailable content: show the clean player launch card
      modal.classList.add('open');
      if (videoEl) videoEl.style.display = 'none';
      if (iframeEl) {
        iframeEl.style.display = 'none';
        iframeEl.src = 'about:blank';
      }

      if (fallbackCard) {
        fallbackCard.style.display = 'flex';
        var fallbackTitle = document.getElementById('player-fallback-title');
        var errDesc = document.getElementById('player-fallback-desc');
        var openSiteText = document.getElementById('player-open-site-text');

        if (fallbackTitle) {
          fallbackTitle.textContent = (playbackInfo && playbackInfo.unavailable) ? 'İçerik Kullanılamıyor' : 'Uygulama İçi Oynatıcı Modu';
        }
        if (errDesc) {
          errDesc.textContent = (playbackInfo && playbackInfo.adGateNote) ||
            'Bu bölüm NartoDrama reklam doğrulaması ("İzlemeden önce reklam") veya etkileşimli oynatıcı gerektirmektedir. Kesintisiz izlemek için uygulama içi görünümde açabilirsiniz.';
        }
        if (openSiteText) openSiteText.textContent = 'Uygulama İçi Oynatıcıda İzle';
      }

      if (fallbackBtn) {
        fallbackBtn.onclick = function () {
          openSiteUrl(episodePageUrl);
        };
      }
    }
  }

  function startPlaybackTracking(drama, episode, videoEl, streamUrl) {
    stopPlaybackTracking();
    state.playbackTimer = setInterval(function () {
      if (videoEl && !videoEl.paused && videoEl.duration > 0 && global.DramaStorage) {
        saveCurrentEpisodeProgress(drama, episode, videoEl.currentTime, videoEl.duration, streamUrl);
      }
    }, 5000);
  }

  function stopPlaybackTracking() {
    if (state.playbackTimer) {
      clearInterval(state.playbackTimer);
      state.playbackTimer = null;
    }
  }

  function closePlayer() {
    stopPlaybackTracking();
    var modal = document.getElementById('player-modal');
    var videoEl = document.getElementById('player-video-element');
    var iframeEl = document.getElementById('player-iframe-element');

    if (videoEl) {
      videoEl.onerror = null;
      videoEl.onended = null;
      // Save final playback position before pausing
      if (videoEl.duration > 0 && global.DramaStorage && state.currentEpisode && !state.currentEpisode.isSample) {
        saveCurrentEpisodeProgress(state.currentDrama, state.currentEpisode, videoEl.currentTime, videoEl.duration, state.currentStreamUrl);
      }
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    }

    if (iframeEl) {
      iframeEl.src = 'about:blank';
    }

    if (modal) {
      modal.classList.remove('open');
    }

    state.currentEpisode = null;
    state.currentStreamUrl = '';
    if (state.currentTab === 'home') {
      renderContinueWatchingRail();
    }
    if (state.currentDrama && Array.isArray(state.currentEpisodes) && state.currentEpisodes.length > 0) {
      var episodesGrid = document.getElementById('detail-episodes-grid');
      var detailModal = document.getElementById('detail-modal');
      if (episodesGrid && detailModal && detailModal.classList.contains('open')) {
        renderEpisodesGrid(episodesGrid, state.currentEpisodes);
      }
    }
  }

  // ========================================================================
  // DISMISSIBLE NOTICES INITIALIZATION
  // ========================================================================
  function initDismissibleNotices() {
    var dismissBtns = document.querySelectorAll('.notice-dismiss-btn');
    dismissBtns.forEach(function (btn) {
      var targetId = btn.getAttribute('data-dismiss-target');
      if (targetId && global.DramaStorage && typeof global.DramaStorage.isNoticeDismissed === 'function') {
        if (global.DramaStorage.isNoticeDismissed(targetId)) {
          var existingEl = document.getElementById(targetId);
          if (existingEl) existingEl.style.display = 'none';
        }
      }
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.getAttribute('data-dismiss-target');
        var targetEl = id ? document.getElementById(id) : btn.closest('.policy-notice-box, .status-banner');
        if (targetEl) {
          targetEl.style.display = 'none';
        }
        if (id && global.DramaStorage && typeof global.DramaStorage.dismissNotice === 'function') {
          global.DramaStorage.dismissNotice(id);
        }
      });
    });
  }

  // ========================================================================
  // ANDROID BACK BUTTON HOOK
  // ========================================================================
  global.handleAndroidBack = function () {
    // 1. If player modal is open, close it
    var playerModal = document.getElementById('player-modal');
    if (playerModal && playerModal.classList.contains('open')) {
      closePlayer();
      return true;
    }

    // 2. If drama detail modal is open, close it
    var detailModal = document.getElementById('detail-modal');
    if (detailModal && detailModal.classList.contains('open')) {
      closeDetailModal();
      return true;
    }

    // 3. If currently on a secondary tab, navigate back to Home tab
    if (state.currentTab !== 'home') {
      switchTab('home');
      return true;
    }

    // 4. Already at root (Home tab with no modals open) -> let Android handle back/exit
    return false;
  };

  // ========================================================================
  // DOM READY INITIALIZATION
  // ========================================================================
  function initApp() {
    // Bottom Nav listeners
    var navButtons = document.querySelectorAll('.bottom-nav .nav-item');
    navButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-tab');
        switchTab(tab);
      });
    });

    // Category filter pills in Home
    var catButtons = document.querySelectorAll('#catalog-category-bar .filter-pill');
    catButtons.forEach(function (pill) {
      pill.addEventListener('click', function () {
        catButtons.forEach(function (b) { b.classList.remove('active'); });
        pill.classList.add('active');
        var cat = pill.getAttribute('data-category');
        loadCatalog(cat);
      });
    });

    initDismissibleNotices();
    initHomeTab();
    initSearchTab();
    initDownloadsTab();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})(typeof window !== 'undefined' ? window : this);
