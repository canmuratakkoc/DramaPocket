/**
 * DramaPocket - storage.js
 * Local storage manager for favorites, recently viewed, playback progress, and download history.
 * Supports fallback to in-memory store if localStorage is unavailable or quotas are exceeded.
 */
(function (global) {
  'use strict';

  var STORAGE_KEYS = {
    FAVORITES: 'dramapocket_favorites_v1',
    RECENTLY_VIEWED: 'dramapocket_recent_v1',
    CONTINUE_WATCHING: 'dramapocket_progress_v1',
    DOWNLOADS: 'dramapocket_downloads_v1',
    SEARCH_HISTORY: 'dramapocket_searches_v1'
  };

  var memoryFallback = {};

  function isLocalStorageAvailable() {
    try {
      var testKey = '__dp_test__';
      global.localStorage.setItem(testKey, '1');
      global.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  var hasLocalStorage = isLocalStorageAvailable();

  function getItem(key, defaultValue) {
    try {
      if (hasLocalStorage) {
        var raw = global.localStorage.getItem(key);
        if (raw !== null && raw !== undefined) {
          return JSON.parse(raw);
        }
      } else if (memoryFallback[key] !== undefined) {
        return JSON.parse(JSON.stringify(memoryFallback[key]));
      }
    } catch (err) {
      console.warn('[DramaStorage] getItem error for key ' + key, err);
    }
    return defaultValue;
  }

  function setItem(key, value) {
    try {
      if (hasLocalStorage) {
        global.localStorage.setItem(key, JSON.stringify(value));
      } else {
        memoryFallback[key] = JSON.parse(JSON.stringify(value));
      }
      return true;
    } catch (err) {
      console.warn('[DramaStorage] setItem error for key ' + key, err);
      // Fallback to memory on QuotaExceededError
      memoryFallback[key] = JSON.parse(JSON.stringify(value));
      return false;
    }
  }

  function removeItem(key) {
    try {
      if (hasLocalStorage) {
        global.localStorage.removeItem(key);
      }
      delete memoryFallback[key];
      return true;
    } catch (err) {
      console.warn('[DramaStorage] removeItem error for key ' + key, err);
      return false;
    }
  }

  var DramaStorage = {
    // ----------------------------------------------------
    // FAVORITES
    // ----------------------------------------------------
    getFavorites: function () {
      var list = getItem(STORAGE_KEYS.FAVORITES, []);
      return Array.isArray(list) ? list : [];
    },

    isFavorite: function (idOrUrl) {
      if (!idOrUrl) return false;
      var list = this.getFavorites();
      var target = String(idOrUrl).trim();
      return list.some(function (item) {
        return String(item.id).trim() === target || String(item.url).trim() === target;
      });
    },

    toggleFavorite: function (drama) {
      if (!drama || (!drama.id && !drama.url)) {
        return false;
      }
      var list = this.getFavorites();
      var id = String(drama.id || drama.url).trim();
      var existingIndex = -1;

      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (String(it.id).trim() === id || (it.url && String(it.url).trim() === id)) {
          existingIndex = i;
          break;
        }
      }

      var isNowFavorite = false;
      if (existingIndex >= 0) {
        list.splice(existingIndex, 1);
        isNowFavorite = false;
      } else {
        var cleanDrama = {
          id: drama.id || drama.url,
          title: drama.title || 'İsimsiz Dizi',
          originalTitle: drama.originalTitle || '',
          posterUrl: drama.posterUrl || '',
          url: drama.url || '',
          year: drama.year || '',
          status: drama.status || '',
          genres: Array.isArray(drama.genres) ? drama.genres : [],
          rating: drama.rating || '',
          addedAt: Date.now()
        };
        list.unshift(cleanDrama);
        isNowFavorite = true;
      }

      setItem(STORAGE_KEYS.FAVORITES, list);
      return isNowFavorite;
    },

    removeFavorite: function (idOrUrl) {
      if (!idOrUrl) return false;
      var list = this.getFavorites();
      var target = String(idOrUrl).trim();
      var initialLen = list.length;
      var filtered = list.filter(function (it) {
        return String(it.id).trim() !== target && String(it.url).trim() !== target;
      });
      if (filtered.length !== initialLen) {
        setItem(STORAGE_KEYS.FAVORITES, filtered);
        return true;
      }
      return false;
    },

    // ----------------------------------------------------
    // RECENTLY VIEWED (Last 20)
    // ----------------------------------------------------
    getRecentlyViewed: function () {
      var list = getItem(STORAGE_KEYS.RECENTLY_VIEWED, []);
      return Array.isArray(list) ? list : [];
    },

    addRecentlyViewed: function (drama) {
      if (!drama || (!drama.id && !drama.url)) return;
      var list = this.getRecentlyViewed();
      var id = String(drama.id || drama.url).trim();

      // Filter out existing
      var filtered = list.filter(function (it) {
        return String(it.id).trim() !== id && (!it.url || String(it.url).trim() !== id);
      });

      var entry = {
        id: drama.id || drama.url,
        title: drama.title || 'İsimsiz Dizi',
        originalTitle: drama.originalTitle || '',
        posterUrl: drama.posterUrl || '',
        url: drama.url || '',
        year: drama.year || '',
        status: drama.status || '',
        genres: Array.isArray(drama.genres) ? drama.genres : [],
        rating: drama.rating || '',
        viewedAt: Date.now()
      };

      filtered.unshift(entry);
      // Keep up to 20
      if (filtered.length > 20) {
        filtered = filtered.slice(0, 20);
      }

      setItem(STORAGE_KEYS.RECENTLY_VIEWED, filtered);
    },

    clearRecentlyViewed: function () {
      setItem(STORAGE_KEYS.RECENTLY_VIEWED, []);
    },

    // ----------------------------------------------------
    // CONTINUE WATCHING (Playback Progress)
    // ----------------------------------------------------
    getContinueWatching: function () {
      var list = getItem(STORAGE_KEYS.CONTINUE_WATCHING, []);
      if (!Array.isArray(list)) return [];
      // Return sorted by updatedAt descending
      return list.sort(function (a, b) {
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
    },

    getEpisodeProgress: function (episodeId) {
      if (!episodeId) return null;
      var list = this.getContinueWatching();
      var epId = String(episodeId).trim();
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].episodeId).trim() === epId) {
          return list[i];
        }
      }
      return null;
    },

    savePlaybackProgress: function (data) {
      if (!data || !data.episodeId) return;
      var list = this.getContinueWatching();
      var epId = String(data.episodeId).trim();

      var pos = parseFloat(data.positionSec) || 0;
      var dur = parseFloat(data.durationSec) || 0;
      var percent = dur > 0 ? Math.round((pos / dur) * 100) : 0;
      var isCompleted = dur > 0 && percent >= 95;

      var entry = {
        dramaId: data.dramaId || '',
        dramaTitle: data.dramaTitle || '',
        posterUrl: data.posterUrl || '',
        episodeId: epId,
        episodeNumber: data.episodeNumber !== undefined ? data.episodeNumber : '',
        episodeTitle: data.episodeTitle || '',
        positionSec: Math.floor(pos),
        durationSec: Math.floor(dur),
        progressPercent: percent,
        completed: isCompleted,
        url: data.url || '',
        streamUrl: data.streamUrl || '',
        updatedAt: Date.now()
      };

      // Filter out existing record with same episodeId
      var filtered = list.filter(function (it) {
        return String(it.episodeId).trim() !== epId;
      });

      filtered.unshift(entry);
      // Keep maximum 30 active progress records
      if (filtered.length > 30) {
        filtered = filtered.slice(0, 30);
      }

      setItem(STORAGE_KEYS.CONTINUE_WATCHING, filtered);
      return entry;
    },

    removeContinueWatching: function (episodeId) {
      if (!episodeId) return;
      var list = this.getContinueWatching();
      var epId = String(episodeId).trim();
      var filtered = list.filter(function (it) {
        return String(it.episodeId).trim() !== epId;
      });
      setItem(STORAGE_KEYS.CONTINUE_WATCHING, filtered);
    },

    // ----------------------------------------------------
    // DOWNLOADS (Local Records synced with Android DownloadManager)
    // ----------------------------------------------------
    getDownloads: function () {
      var list = getItem(STORAGE_KEYS.DOWNLOADS, []);
      return Array.isArray(list) ? list : [];
    },

    saveDownloadRecord: function (record) {
      if (!record || (!record.id && !record.downloadId)) return;
      var id = String(record.downloadId || record.id).trim();
      var list = this.getDownloads();

      var existingIndex = -1;
      for (var i = 0; i < list.length; i++) {
        var itId = String(list[i].downloadId || list[i].id).trim();
        if (itId === id) {
          existingIndex = i;
          break;
        }
      }

      var updated = {
        id: id,
        downloadId: id,
        title: record.title || 'İndirme Dosyası',
        fileName: record.fileName || '',
        url: record.url || '',
        status: record.status || 'PENDING', // PENDING, RUNNING, SUCCESSFUL, FAILED, PAUSED, CANCELED
        progress: typeof record.progress === 'number' ? record.progress : 0,
        bytesDownloaded: record.bytesDownloaded || 0,
        bytesTotal: record.bytesTotal || 0,
        localUri: record.localUri || '',
        reason: record.reason || '',
        isSample: !!record.isSample,
        timestamp: record.timestamp || Date.now(),
        updatedAt: Date.now()
      };

      if (existingIndex >= 0) {
        // Keep initial timestamp if available
        updated.timestamp = list[existingIndex].timestamp || updated.timestamp;
        list[existingIndex] = Object.assign({}, list[existingIndex], updated);
      } else {
        list.unshift(updated);
      }

      setItem(STORAGE_KEYS.DOWNLOADS, list);
      return updated;
    },

    removeDownloadRecord: function (id) {
      if (!id) return;
      var targetId = String(id).trim();
      var list = this.getDownloads();
      var filtered = list.filter(function (it) {
        var curId = String(it.downloadId || it.id).trim();
        return curId !== targetId;
      });
      setItem(STORAGE_KEYS.DOWNLOADS, filtered);
    },

    syncWithAndroid: function (androidDownloads) {
      var parsed = [];
      if (typeof androidDownloads === 'string') {
        try {
          parsed = JSON.parse(androidDownloads);
        } catch (e) {
          console.warn('[DramaStorage] syncWithAndroid parse error', e);
          return this.getDownloads();
        }
      } else if (Array.isArray(androidDownloads)) {
        parsed = androidDownloads;
      }

      if (!Array.isArray(parsed)) return this.getDownloads();

      var list = this.getDownloads();
      var map = {};
      list.forEach(function (rec) {
        var k = String(rec.downloadId || rec.id).trim();
        map[k] = rec;
      });

      parsed.forEach(function (item) {
        var k = String(item.downloadId || item.id).trim();
        if (map[k]) {
          map[k] = Object.assign({}, map[k], item, { updatedAt: Date.now() });
        } else {
          map[k] = Object.assign({
            id: k,
            downloadId: k,
            title: item.title || 'İndirme Dosyası',
            timestamp: Date.now(),
            updatedAt: Date.now()
          }, item);
        }
      });

      var merged = Object.keys(map).map(function (k) { return map[k]; });
      merged.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
      setItem(STORAGE_KEYS.DOWNLOADS, merged);
      return merged;
    },

    // ----------------------------------------------------
    // RECENT SEARCHES
    // ----------------------------------------------------
    getRecentSearches: function () {
      var list = getItem(STORAGE_KEYS.SEARCH_HISTORY, []);
      return Array.isArray(list) ? list : [];
    },

    addRecentSearch: function (query) {
      if (!query || typeof query !== 'string') return;
      var q = query.trim();
      if (q.length < 2) return;

      var list = this.getRecentSearches();
      var filtered = list.filter(function (item) {
        return item.toLowerCase() !== q.toLowerCase();
      });
      filtered.unshift(q);
      if (filtered.length > 10) {
        filtered = filtered.slice(0, 10);
      }
      setItem(STORAGE_KEYS.SEARCH_HISTORY, filtered);
    },

    clearRecentSearches: function () {
      setItem(STORAGE_KEYS.SEARCH_HISTORY, []);
    }
  };

  global.DramaStorage = DramaStorage;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DramaStorage;
  }
})(typeof window !== 'undefined' ? window : this);
