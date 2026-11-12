/**
 * DramaPocket - SiteAdapter
 * Real Reconnaissance & Integration for NartoDrama (https://nartodrama.com)
 *
 * Implements 3-tier transport:
 * 1. Native AndroidBridge.fetchHtml (HttpURLConnection allowlisted to nartodrama.com, bypasses WebView CORS)
 * 2. Standard browser/Node fetch with AbortController timeout
 * 3. Graceful fallback with honest metadata & external WebView navigation
 *
 * Exposes window.SiteAdapter (and module.exports for Node testing)
 */

(function (global) {
  'use strict';

  var BASE_URL = 'https://nartodrama.com';
  var API_IMG_URL = 'https://img.nartodrama-api.online';
  var DEFAULT_TIMEOUT_MS = 10000;

  var RESTRICTION_NOTE =
    'NartoDrama platformu telif hakları, dinamik HLS akışları ve oturum koruması nedeniyle ' +
    'doğrudan bölüm indirme bağlantısı sağlamamaktadır (site SSS politikası gereği çevrimdışı indirme ' +
    'desteklenmemektedir). Tüm bölümler canlı akış veya güvenli web görünümü üzerinden izlenebilir.';

  var AUTHORIZED_SAMPLES = [
    {
      id: 'sample-bbb',
      title: 'Big Buck Bunny (Açık Lisans Test Videosu)',
      originalTitle: 'Big Buck Bunny',
      poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
      posterUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
      streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      totalEpisodes: 1,
      badge: 'Test İçeriği (Açık Lisans)',
      country: 'Açık Kaynak',
      year: '2008',
      rating: '5.0',
      description:
        'Blender Foundation tarafından açık lisansla (Creative Commons CC-BY 3.0) yayınlanmış ' +
        'resmi test içeriğidir. Android DownloadManager ve çevrimdışı yerel video oynatıcı ' +
        'işlevlerini güvenle test etmek için sunulmuştur.',
      tags: ['Açık Lisans', 'Animasyon', 'Test'],
      isSample: true,
      isAuthorizedSample: true,
      downloadable: true,
      fileSize: '9.8 MB'
    },
    {
      id: 'sample-sintel',
      title: 'Sintel Fragmanı (Açık Lisans)',
      originalTitle: 'Sintel Trailer',
      poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg',
      posterUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg',
      streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
      totalEpisodes: 1,
      badge: 'Test İçeriği (Açık Lisans)',
      country: 'Açık Kaynak',
      year: '2010',
      rating: '4.9',
      description:
        'Durian Açık Film Projesi kapsamında Blender Vakfı tarafından üretilmiş açık kaynak fantezi animasyon. ' +
        'Çevrimdışı depolama ve oynatma mekanizmalarını doğrulamak için ayrılmıştır.',
      tags: ['Açık Lisans', 'Fantezi', 'Blender'],
      isSample: true,
      isAuthorizedSample: true,
      downloadable: true,
      fileSize: '5.4 MB'
    },
    {
      id: 'sample-tears',
      title: 'Tears of Steel (Açık Lisans Bilim Kurgu)',
      originalTitle: 'Tears of Steel',
      poster: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg',
      posterUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg',
      streamUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      downloadUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
      totalEpisodes: 1,
      badge: 'Test İçeriği (Açık Lisans)',
      country: 'Açık Kaynak',
      year: '2012',
      rating: '4.8',
      description:
        'Mango Açık Film Projesi kapsamında üretilmiş açık kaynaklı VFX/bilim kurgu kısa filmi. ' +
        'Android yerel dosya doğrulama ve indirme akışlarını test etmek için kullanılabilir.',
      tags: ['Açık Lisans', 'Bilim Kurgu', 'VFX'],
      isSample: true,
      isAuthorizedSample: true,
      downloadable: true,
      fileSize: '6.2 MB'
    }
  ];

  // In-memory cookie jar for Node.js environment
  var nodeCookieJar = {};

  function getNodeCookieHeader() {
    if (!nodeCookieJar['nd_ck']) {
      nodeCookieJar['nd_ck'] = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
    return Object.keys(nodeCookieJar)
      .map(function (k) { return k + '=' + nodeCookieJar[k]; })
      .join('; ');
  }

  function saveResponseCookies(resp) {
    if (!resp || !resp.headers) return;
    try {
      var setCookieHeaders = [];
      if (typeof resp.headers.getSetCookie === 'function') {
        setCookieHeaders = resp.headers.getSetCookie();
      } else if (typeof resp.headers.get === 'function') {
        var rawH = resp.headers.get('set-cookie');
        if (rawH) setCookieHeaders = [rawH];
      }
      setCookieHeaders.forEach(function (headerStr) {
        var parts = String(headerStr).split(';');
        if (parts.length > 0) {
          var eqIdx = parts[0].indexOf('=');
          if (eqIdx > 0) {
            var key = parts[0].substring(0, eqIdx).trim();
            var val = parts[0].substring(eqIdx + 1).trim();
            nodeCookieJar[key] = val;
          }
        }
      });
    } catch (e) {}
  }

  /**
   * Transport layer: 3-tier fetching strategy
   */
  async function fetchHtmlText(url) {
    var bridge = null;
    if (typeof window !== 'undefined' && window.AndroidBridge) {
      bridge = window.AndroidBridge;
    } else if (typeof global !== 'undefined' && global.AndroidBridge) {
      bridge = global.AndroidBridge;
    }

    // 1. AndroidBridge Tier
    if (bridge && typeof bridge.fetchHtml === 'function') {
      try {
        var rawResult = bridge.fetchHtml(url);
        var resObj = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
        var isSuccess = resObj && (resObj.ok === true || (typeof resObj.status === 'number' && resObj.status >= 200 && resObj.status < 400));
        if (isSuccess) {
          return {
            ok: true,
            status: resObj.status || 200,
            html: resObj.body || resObj.html || '',
            finalUrl: resObj.finalUrl || url,
            tier: 'android_bridge'
          };
        }
        return {
          ok: false,
          status: resObj ? resObj.status : 0,
          html: '',
          error: (resObj && resObj.error) ? resObj.error : 'AndroidBridge fetch başarısız',
          tier: 'android_bridge'
        };
      } catch (bridgeErr) {
        console.warn('[SiteAdapter] AndroidBridge.fetchHtml exception:', bridgeErr);
      }
    }

    // 2. Browser / Node fetch Tier
    try {
      var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timerId = controller ? setTimeout(function () { controller.abort(); }, DEFAULT_TIMEOUT_MS) : null;

      var headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      };

      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        headers['User-Agent'] =
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 DramaPocket/1.0';
        headers['Cookie'] = getNodeCookieHeader();
      }

      var fetchOptions = {
        method: 'GET',
        headers: headers,
        credentials: 'omit'
      };
      if (controller) {
        fetchOptions.signal = controller.signal;
      }

      var resp = await fetch(url, fetchOptions);
      if (timerId) clearTimeout(timerId);

      saveResponseCookies(resp);
      var text = await resp.text();
      return {
        ok: resp.ok,
        status: resp.status,
        html: text,
        finalUrl: resp.url || url,
        tier: 'fetch'
      };
    } catch (fetchErr) {
      return {
        ok: false,
        status: 0,
        html: '',
        error: fetchErr.message || 'Ağ bağlantısı veya CORS engeli oluştu',
        tier: 'fetch'
      };
    }
  }

  /**
   * Helper: Parses HTML either with DOMParser (Browser/WebView) or RegEx (pure Node.js)
   */
  function parseHtmlDocument(htmlString) {
    if (typeof DOMParser !== 'undefined') {
      try {
        var parser = new DOMParser();
        return { isDom: true, doc: parser.parseFromString(htmlString, 'text/html') };
      } catch (e) {
        // fallback to regex
      }
    }
    return { isDom: false, raw: htmlString };
  }

  /**
   * Normalize URLs to fully-qualified HTTPS URLs
   */
  function normalizeUrl(url, base) {
    if (!url) return '';
    var trimmed = String(url).trim();
    if (trimmed.startsWith('//')) return 'https:' + trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('/')) return (base || BASE_URL) + trimmed;
    return (base || BASE_URL) + '/' + trimmed;
  }

  /**
   * Extract drama cards from HTML document
   */
  function extractDramaCards(parsed) {
    var items = [];
    var seenUrls = new Set();

    if (parsed.isDom) {
      var doc = parsed.doc;

      // 1. Hero Cards: article.nd-hero-card
      var heroCards = doc.querySelectorAll('article.nd-hero-card');
      heroCards.forEach(function (card) {
        var linkEl = card.querySelector('a.nd-hero-art-link, a.nd-hero-btn-play');
        var titleEl = card.querySelector('h2.nd-hero-title');
        var imgEl = card.querySelector('img.nd-hero-art');
        var factsEl = card.querySelector('p.nd-hero-facts');
        var descEl = card.querySelector('p.nd-hero-desc');

        var rawUrl = linkEl ? linkEl.getAttribute('href') : '';
        var watchUrl = normalizeUrl(rawUrl);
        if (!watchUrl || seenUrls.has(watchUrl)) return;
        seenUrls.add(watchUrl);

        var title = (titleEl && titleEl.textContent) ? titleEl.textContent.trim() : '';
        var poster = imgEl ? normalizeUrl(imgEl.getAttribute('src')) : '';
        var desc = (descEl && descEl.textContent) ? descEl.textContent.trim() : '';

        var epMatch = (factsEl && factsEl.textContent) ? factsEl.textContent.match(/Ep:\s*(\d+)/i) : null;
        var totalEpisodes = epMatch ? parseInt(epMatch[1], 10) : 0;

        var tags = [];
        if (factsEl && typeof factsEl.querySelectorAll === 'function') {
          factsEl.querySelectorAll('span').forEach(function (span) {
            var tagText = (span && span.textContent) ? span.textContent.trim() : '';
            if (tagText && !tagText.startsWith('Ep:')) tags.push(tagText);
          });
        }

        var slugMatch = watchUrl.match(/\/detail\/watch\/([^/?#]+)/);
        var id = slugMatch ? slugMatch[1] : ('hero-' + items.length);

        items.push({
          id: id,
          title: title || 'NartoDrama Dizisi',
          originalTitle: title,
          poster: poster,
          posterUrl: poster,
          url: watchUrl,
          totalEpisodes: totalEpisodes,
          tags: tags,
          description: desc,
          badge: totalEpisodes ? (totalEpisodes + ' Bölüm') : 'Öne Çıkan',
          country: 'Asya',
          year: '2024',
          rating: '4.9',
          isSample: false
        });
      });

      // 2. Standard Cards: article.card (including provider-search-card and .drama-card)
      var cards = doc.querySelectorAll('article.card, article.provider-search-card, .drama-card');
      cards.forEach(function (card) {
        var rawWatchUrl = card.getAttribute('data-watch-url');
        var linkEl = card.querySelector('a.card-link-overlay, a[href]');
        var href = linkEl ? linkEl.getAttribute('href') : '';
        var watchUrl = normalizeUrl(rawWatchUrl || href);

        if (!watchUrl || seenUrls.has(watchUrl)) return;
        seenUrls.add(watchUrl);

        var dataTitle = card.getAttribute('data-movie-title') || card.getAttribute('data-search-title');
        var titleEl = card.querySelector('h1, h2, h3.title, .drama-card-title, .title');
        var titleText = (titleEl && titleEl.textContent) ? titleEl.textContent : '';
        var linkText = (linkEl && linkEl.textContent) ? linkEl.textContent : '';
        var title = (dataTitle || titleText || linkText).trim();

        var imgEl = card.querySelector('img.poster, .poster-wrap img, img');
        var poster = imgEl ? normalizeUrl(imgEl.getAttribute('src')) : '';

        var epBadge = card.querySelector('.episode-badge');
        var epMatch = (epBadge && epBadge.textContent) ? epBadge.textContent.match(/(\d+)/) : null;
        var totalEpisodes = epMatch ? parseInt(epMatch[1], 10) : 0;

        var tags = [];
        if (typeof card.querySelectorAll === 'function') {
          card.querySelectorAll('.movie-tag, .poster-tags a').forEach(function (tagEl) {
            var tag = (tagEl && tagEl.textContent) ? tagEl.textContent.trim().replace(/^#/, '') : '';
            if (tag) tags.push(tag);
          });
        }

        var movieId = card.getAttribute('data-movie-id');
        var slugMatch = watchUrl.match(/\/detail\/watch\/([^/?#]+)/) || watchUrl.match(/\/drama\/([^/?#]+)/);
        var id = movieId || (slugMatch ? slugMatch[1] : ('drama-' + items.length));

        items.push({
          id: id,
          title: title || 'NartoDrama Dizisi',
          originalTitle: title,
          poster: poster,
          posterUrl: poster,
          url: watchUrl,
          totalEpisodes: totalEpisodes,
          tags: tags,
          description: '',
          badge: totalEpisodes ? ('Ep: ' + totalEpisodes) : 'Narto Drama',
          country: 'Asya',
          year: '2024',
          rating: '4.8',
          isSample: false
        });
      });
    } else {
      // RegEx fallback for Node.js test environments without DOMParser
      var raw = parsed.raw || '';

      // Match <article ...>...</article> tags cleanly without stopping at inner </div>
      var articleRegex = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi;
      var match;

      while ((match = articleRegex.exec(raw)) !== null) {
        var openAttrs = match[1];
        var innerContent = match[2];

        // 1. Extract watch URL from attributes or inner content
        var watchUrlMatch = openAttrs.match(/data-watch-url=["']([^"']+)["']/i) ||
          innerContent.match(/href=["'](https?:\/\/[^"']*\/detail\/watch\/[^"']*)["']/i) ||
          innerContent.match(/href=["']([^"']*(?:\/detail\/watch\/|\/drama\/)[^"']*)["']/i);
        if (!watchUrlMatch) continue;

        var watchUrl = normalizeUrl(watchUrlMatch[1]);
        if (seenUrls.has(watchUrl)) continue;
        seenUrls.add(watchUrl);

        // 2. Extract title from attributes or inner content
        var titleMatch = openAttrs.match(/data-(?:movie-title|search-title)=["']([^"']+)["']/i) ||
          innerContent.match(/<(?:h1|h2|h3)[^>]*>([^<]+)<\/(?:h1|h2|h3)>/i) ||
          innerContent.match(/class=["']card-link-overlay["'][^>]*>([^<]+)<\/a>/i) ||
          innerContent.match(/<a[^>]*>([^<]+)<\/a>/i);
        var title = titleMatch ? titleMatch[1].trim() : 'NartoDrama Dizisi';

        // 3. Extract poster
        var posterMatch = innerContent.match(/<img[^>]*src=["'](https?:\/\/[^"']+)["']/i);
        var poster = posterMatch ? posterMatch[1].trim() : '';

        // 4. Extract total episodes
        var epMatch = innerContent.match(/Ep:\s*(\d+)/i) || innerContent.match(/class=["']episode-badge["'][^>]*>.*?(\d+)/i);
        var totalEpisodes = epMatch ? parseInt(epMatch[1], 10) : 0;

        // 5. Extract tags
        var tags = [];
        var tagRegex = /class=["']movie-tag[^"']*["'][^>]*>#?([^<]+)<\/a>/gi;
        var tagMatch;
        while ((tagMatch = tagRegex.exec(innerContent)) !== null) {
          tags.push(tagMatch[1].trim());
        }

        var movieIdMatch = openAttrs.match(/data-movie-id=["']([^"']+)["']/i);
        var slugMatch = watchUrl.match(/\/detail\/watch\/([^/?#]+)/) || watchUrl.match(/\/drama\/([^/?#]+)/);
        var id = movieIdMatch ? movieIdMatch[1] : (slugMatch ? slugMatch[1] : ('drama-' + items.length));

        items.push({
          id: id,
          title: title,
          originalTitle: title,
          poster: poster,
          posterUrl: poster,
          url: watchUrl,
          totalEpisodes: totalEpisodes,
          tags: tags,
          description: '',
          badge: totalEpisodes ? ('Ep: ' + totalEpisodes) : 'Narto Drama',
          country: 'Asya',
          year: '2024',
          rating: '4.8',
          isSample: false
        });
      }

      // Also support <div class="...drama-card..."> for QA mocks
      var divRegex = /<div\b([^>]*class=["'][^"']*drama-card[^"']*["'][^>]*)>([\s\S]*?)<\/div>/gi;
      while ((match = divRegex.exec(raw)) !== null) {
        var dAttrs = match[1];
        var dContent = match[2];
        var dUrlMatch = dContent.match(/href=["']([^"']+)["']/i);
        if (!dUrlMatch) continue;
        var dUrl = normalizeUrl(dUrlMatch[1]);
        if (seenUrls.has(dUrl)) continue;
        seenUrls.add(dUrl);

        var dTitleMatch = dContent.match(/<(?:h1|h2|h3)[^>]*>([^<]+)<\/(?:h1|h2|h3)>/i);
        var dTitle = dTitleMatch ? dTitleMatch[1].trim() : 'Test Drama';

        items.push({
          id: 'test-' + items.length,
          title: dTitle,
          originalTitle: dTitle,
          poster: '',
          posterUrl: '',
          url: dUrl,
          totalEpisodes: 1,
          tags: [],
          description: '',
          badge: 'Test Drama',
          country: 'Asya',
          year: '2024',
          rating: '4.8',
          isSample: false
        });
      }
    }

    return items;
  }

  /**
   * Linear O(N) bracket-balanced JSON array extractor
   * Ensures large arrays like episodeItemsRaw (350KB+) parse cleanly without regex truncation
   */
  function extractBalancedJsonArray(text, marker) {
    if (!text || typeof text !== 'string') return null;
    var markerIdx = text.indexOf(marker);
    if (markerIdx === -1) return null;

    var bracketStart = text.indexOf('[', markerIdx);
    if (bracketStart === -1) return null;

    var depth = 0;
    var inString = false;
    var stringChar = '';
    var isEscaped = false;
    var endIdx = -1;
    var len = text.length;

    for (var i = bracketStart; i < len; i++) {
      var char = text[i];
      if (inString) {
        if (isEscaped) {
          isEscaped = false;
        } else if (char === '\\') {
          isEscaped = true;
        } else if (char === stringChar) {
          inString = false;
        }
      } else {
        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
        } else if (char === '[') {
          depth++;
        } else if (char === ']') {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }

    if (endIdx === -1) return null;

    var jsonString = text.substring(bracketStart, endIdx + 1);
    try {
      var parsed = JSON.parse(jsonString);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      console.warn('[SiteAdapter] extractBalancedJsonArray parse error:', e);
      return null;
    }
  }

  /**
   * Extract primary and secondary stream URLs from a raw NartoDrama episode object
   * (supports play_url, direct_play_url, stream_url, and multi_resolutions array)
   */
  function resolveRawEpisodeStreams(rawEp) {
    if (!rawEp || typeof rawEp !== 'object') {
      return { playUrl: '', directPlayUrl: '' };
    }
    var playUrl = rawEp.play_url || rawEp.playUrl || rawEp.stream_url || '';
    var directPlayUrl = rawEp.direct_play_url || rawEp.directPlayUrl || '';

    if (Array.isArray(rawEp.multi_resolutions) && rawEp.multi_resolutions.length > 0) {
      var validRes = rawEp.multi_resolutions.filter(function (r) {
        return r && (r.stream_url || r.play_url || r.url);
      });
      if (validRes.length > 0) {
        var defaultRes = validRes.find(function (r) { return r.is_default; }) || validRes[0];
        var primaryMulti = defaultRes.stream_url || defaultRes.play_url || defaultRes.url || '';
        var secondaryRes = validRes.find(function (r) { return r !== defaultRes; });
        var secondaryMulti = secondaryRes ? (secondaryRes.stream_url || secondaryRes.play_url || secondaryRes.url || '') : '';
        if (!playUrl) playUrl = primaryMulti;
        if (!directPlayUrl) directPlayUrl = secondaryMulti || primaryMulti;
      }
    }

    return {
      playUrl: playUrl,
      directPlayUrl: directPlayUrl
    };
  }

  /**
   * Extract refreshSourceContextToken from episode player HTML if present
   */
  function extractRefreshSourceToken(html) {
    if (!html || typeof html !== 'string') return '';
    var match = html.match(/refreshSourceContextToken\s*=\s*["']([^"']+)["']/i);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract drama details & episodes from detail page HTML
   */
  function extractDetailsFromHtml(html, pageUrl) {
    var title = '';
    var description = '';
    var poster = '';
    var genres = [];
    var episodes = [];
    var sourceAppName = 'dramabox';
    var movieId = '';

    // 1. Parse JSON-LD Schema.org VideoObject / TVSeries
    var jsonLdMatches = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      jsonLdMatches.forEach(function (tag) {
        var jsonText = tag.replace(/<\/?script[^>]*>/gi, '').trim();
        try {
          var data = JSON.parse(jsonText);
          if (data['@type'] === 'VideoObject' || data['@type'] === 'TVSeries') {
            if (data.name && !title) title = data.name.replace(/\s*Episode\s*\d+.*$/i, '').trim();
            if (data.description && !description) description = data.description.trim();
            if (data.thumbnailUrl && data.thumbnailUrl.length > 0 && !poster) {
              poster = data.thumbnailUrl[0];
            }
            if (data.genre && genres.length === 0) {
              genres = Array.isArray(data.genre) ? data.genre : [data.genre];
            }
          }
        } catch (e) {
          // ignore json-ld parse error
        }
      });
    }

    // 2. Parse Open Graph & meta tags
    if (!title) {
      var ogTitleMatch = html.match(/<meta\s+(?:property|name)=["']og:title["']\s+content=["']([^"']+)["']/i);
      if (ogTitleMatch) title = ogTitleMatch[1].replace(/\s*Episode\s*\d+.*$/i, '').trim();
    }
    if (!description) {
      var ogDescMatch = html.match(/<meta\s+(?:property|name)=["']og:description["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
      if (ogDescMatch) description = ogDescMatch[1].trim();
    }
    if (!poster) {
      var ogImgMatch = html.match(/<meta\s+(?:property|name)=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (ogImgMatch) poster = ogImgMatch[1].trim();
    }

    // 3. Extract movieId and sourceAppName
    var idMatch = html.match(/const\s+movieId\s*=\s*(\d+);/i);
    if (idMatch) movieId = idMatch[1];

    var appMatch = html.match(/const\s+movieSourceAppName\s*=\s*["']([^"']+)["'];/i);
    if (appMatch) sourceAppName = appMatch[1];

    // 4. Extract embedded episodeItemsRaw array (using balanced bracket extractor for reliability)
    var rawEpisodes = extractBalancedJsonArray(html, 'episodeItemsRaw');
    if (!rawEpisodes) {
      var epRawMatch = html.match(/const\s+episodeItemsRaw\s*=\s*(\[[\s\S]*?\]);\s*(?:const|var|let)/i) ||
        html.match(/episodeItemsRaw\s*=\s*(\[[\s\S]*?\]);/i);
      if (epRawMatch) {
        try {
          rawEpisodes = JSON.parse(epRawMatch[1]);
        } catch (jsonErr) {
          console.warn('[SiteAdapter] episodeItemsRaw regex parse failed:', jsonErr);
        }
      }
    }

    var refreshToken = extractRefreshSourceToken(html);

    if (Array.isArray(rawEpisodes) && rawEpisodes.length > 0) {
      episodes = rawEpisodes.map(function (ep, idx) {
        var epNum = (ep.number !== undefined) ? ep.number : ((ep.episode_number !== undefined) ? ep.episode_number : ((ep.route_episode_number !== undefined) ? ep.route_episode_number : (idx + 1)));
        var epTitle = (ep.title && !/^Episode\s+\d+$/i.test(ep.title)) ? ep.title : ('Bölüm ' + epNum);
        var watchUrl = ep.watch_url ? normalizeUrl(ep.watch_url) : (pageUrl + '/' + epNum);
        var resolvedStreams = resolveRawEpisodeStreams(ep);

        return {
          id: ep.id || epNum,
          number: epNum,
          title: epTitle,
          rawTitle: ep.title || '',
          url: watchUrl,
          playUrl: resolvedStreams.playUrl,
          directPlayUrl: resolvedStreams.directPlayUrl,
          refreshSourceToken: refreshToken,
          poster: ep.thumb_url ? normalizeUrl(ep.thumb_url) : poster,
          posterUrl: ep.thumb_url ? normalizeUrl(ep.thumb_url) : poster,
          duration: '2 dk',
          playable: true,
          isUnlocked: true,
          downloadable: false,
          downloadRestrictionReason: RESTRICTION_NOTE
        };
      });
    }

    // Fallback: If no episodeItemsRaw found, extract episode links
    if (episodes.length === 0) {
      var epLinkRegex = /href=["'](https?:\/\/[^"']*\/detail\/watch\/[^"']+\/(\d+)[^"']*)["']/gi;
      var linkMatch;
      var seenEpNums = new Set();

      while ((linkMatch = epLinkRegex.exec(html)) !== null) {
        var epNum = parseInt(linkMatch[2], 10);
        if (!seenEpNums.has(epNum)) {
          seenEpNums.add(epNum);
          episodes.push({
            id: epNum,
            number: epNum,
            title: 'Bölüm ' + epNum,
            url: normalizeUrl(linkMatch[1]),
            playUrl: '',
            directPlayUrl: '',
            poster: poster,
            posterUrl: poster,
            duration: '2 dk',
            playable: true,
            isUnlocked: true,
            downloadable: false,
            downloadRestrictionReason: RESTRICTION_NOTE
          });
        }
      }
      episodes.sort(function (a, b) { return a.number - b.number; });
    }

    var dramaId = movieId || (pageUrl.match(/\/detail\/watch\/([^/?#]+)/) ? pageUrl.match(/\/detail\/watch\/([^/?#]+)/)[1] : 'drama-detail');

    var drama = {
      id: dramaId,
      title: title || 'NartoDrama Dizisi',
      originalTitle: title,
      poster: poster,
      posterUrl: poster,
      description: description || 'NartoDrama üzerinde yayınlanan dikey kısa dizi.',
      synopsis: description,
      tags: genres.length > 0 ? genres : ['Kısa Dizi', 'Dikey Format'],
      totalEpisodes: episodes.length,
      url: pageUrl,
      externalUrl: pageUrl,
      sourceAppName: sourceAppName,
      isSample: false
    };

    return { drama: drama, episodes: episodes };
  }

  // ========================================================================
  // SiteAdapter Public API
  // ========================================================================

  var SiteAdapter = {
    /**
     * Platform capabilities & honest policy metadata
     */
    getInfo: function () {
      return {
        name: 'NartoDrama',
        baseUrl: BASE_URL,
        mediaCdn: API_IMG_URL,
        capabilities: {
          liveSearch: true,
          liveCatalog: true,
          inlinePlayback: true,
          externalFallback: true,
          episodeDownloadAllowed: false,
          authorizedSampleDownload: true
        },
        restrictionsNote: RESTRICTION_NOTE
      };
    },

    /**
     * Fetch home catalog with optional pagination & category filter
     */
    getHomeCatalog: async function (options) {
      var page = (options && options.page) ? options.page : 1;
      var category = (options && options.category) ? options.category : 'all';

      var targetUrl = BASE_URL + '/featured?page=' + page + '&lang=tr-TR';
      if (category && category !== 'all') {
        targetUrl = BASE_URL + '/tag/' + encodeURIComponent(category) + '?page=' + page + '&lang=tr-TR';
      }

      var fetchRes = await fetchHtmlText(targetUrl);
      if (!fetchRes.ok || !fetchRes.html) {
        return {
          items: [],
          source: 'error',
          liveStatus: 'connection_restricted',
          error: fetchRes.error || ('NartoDrama sunucusuna bağlanılamadı (HTTP ' + fetchRes.status + ')'),
          fallbackUrl: targetUrl
        };
      }

      var parsed = parseHtmlDocument(fetchRes.html);
      var items = extractDramaCards(parsed);

      var isChallenge = /<title>Loading<\/title>/i.test(fetchRes.html) || /Checking your browser\.\.\./i.test(fetchRes.html);
      if (items.length === 0 && isChallenge) {
        return {
          items: [],
          source: 'error',
          liveStatus: 'challenge_required',
          error: 'Cloudflare tarayıcı doğrulama koruması aktif. Canlı site görünümünde açabilirsiniz.',
          fallbackUrl: targetUrl
        };
      }

      return {
        items: items,
        source: 'live',
        liveStatus: 'connected',
        tier: fetchRes.tier,
        page: page,
        category: category,
        fallbackUrl: targetUrl
      };
    },

    /**
     * Search dramas by query
     */
    search: async function (query) {
      var trimmed = String(query || '').trim();
      var searchUrl = BASE_URL + '/search?q=' + encodeURIComponent(trimmed) + '&lang=tr-TR';

      if (!trimmed) {
        return {
          items: [],
          source: 'live',
          liveStatus: 'empty_query',
          externalSearchUrl: searchUrl
        };
      }

      var fetchRes = await fetchHtmlText(searchUrl);
      if (!fetchRes.ok || !fetchRes.html) {
        return {
          items: [],
          source: 'error',
          liveStatus: 'search_restricted',
          error: fetchRes.error || ('Arama sunucusuna ulaşılamadı (HTTP ' + fetchRes.status + ')'),
          externalSearchUrl: searchUrl
        };
      }

      var parsed = parseHtmlDocument(fetchRes.html);
      var items = extractDramaCards(parsed);

      var isChallenge = /<title>Loading<\/title>/i.test(fetchRes.html) || /Checking your browser\.\.\./i.test(fetchRes.html);
      if (items.length === 0 && isChallenge) {
        return {
          items: [],
          source: 'error',
          liveStatus: 'challenge_required',
          error: 'Cloudflare tarayıcı doğrulama koruması aktif. Canlı site görünümünde arama yapabilirsiniz.',
          externalSearchUrl: searchUrl
        };
      }

      return {
        items: items,
        source: 'live',
        liveStatus: 'connected',
        tier: fetchRes.tier,
        query: trimmed,
        externalSearchUrl: searchUrl
      };
    },

    /**
     * Fetch drama details and full episode list
     */
    getDramaDetails: async function (idOrUrl) {
      var targetUrl = '';
      if (typeof idOrUrl === 'string' && (idOrUrl.startsWith('http://') || idOrUrl.startsWith('https://'))) {
        targetUrl = idOrUrl;
      } else if (typeof idOrUrl === 'object' && idOrUrl !== null && idOrUrl.url) {
        targetUrl = idOrUrl.url;
      } else {
        targetUrl = BASE_URL + '/detail/watch/' + encodeURIComponent(String(idOrUrl)) + '?lang=tr-TR';
      }

      var fetchRes = await fetchHtmlText(targetUrl);
      if (!fetchRes.ok || !fetchRes.html) {
        return {
          drama: null,
          episodes: [],
          source: 'error',
          liveStatus: 'details_restricted',
          error: fetchRes.error || ('Dizi detayları yüklenemedi (HTTP ' + fetchRes.status + ')'),
          externalUrl: targetUrl
        };
      }

      var isChallenge = /<title>Loading<\/title>/i.test(fetchRes.html) || /Checking your browser\.\.\./i.test(fetchRes.html);
      if (isChallenge) {
        return {
          drama: null,
          episodes: [],
          source: 'error',
          liveStatus: 'challenge_required',
          error: 'Cloudflare tarayıcı doğrulama koruması aktif. Dizi detaylarını canlı sitede açabilirsiniz.',
          externalUrl: targetUrl
        };
      }

      var details = extractDetailsFromHtml(fetchRes.html, targetUrl);

      // If overview page had no embedded episodeItemsRaw, pre-fetch episode 1
      // to enrich all episodes with real play_url, direct_play_url & multi_resolutions from NartoDrama's player playlist
      if (details.episodes && details.episodes.length > 0 && !details.episodes[0].playUrl && !details.episodes[0].directPlayUrl) {
        try {
          var ep1Url = details.episodes[0].url;
          if (ep1Url && ep1Url !== targetUrl) {
            var ep1Res = await fetchHtmlText(ep1Url);
            if (ep1Res.ok && ep1Res.html) {
              var ep1RefreshToken = extractRefreshSourceToken(ep1Res.html);
              var fullRaw = extractBalancedJsonArray(ep1Res.html, 'episodeItemsRaw');
              if (Array.isArray(fullRaw) && fullRaw.length > 0) {
                var rawMap = {};
                fullRaw.forEach(function (r, idx) {
                  var num = r.number || r.route_episode_number || (idx + 1);
                  rawMap[num] = r;
                });
                details.episodes.forEach(function (ep) {
                  if (ep1RefreshToken) ep.refreshSourceToken = ep1RefreshToken;
                  var match = rawMap[ep.number];
                  if (match) {
                    var streams = resolveRawEpisodeStreams(match);
                    if (streams.playUrl) ep.playUrl = streams.playUrl;
                    if (streams.directPlayUrl) ep.directPlayUrl = streams.directPlayUrl;
                    if (match.id) ep.id = match.id;
                    if (match.thumb_url && (!ep.poster || (details.drama && ep.poster === details.drama.poster))) {
                      var normThumb = normalizeUrl(match.thumb_url);
                      ep.poster = normThumb;
                      ep.posterUrl = normThumb;
                    }
                  }
                });
              }
            }
          }
        } catch (enrichErr) {
          console.warn('[SiteAdapter] Episode playlist enrichment notice:', enrichErr);
        }
      }

      return {
        drama: details.drama,
        episodes: details.episodes,
        source: 'live',
        liveStatus: 'connected',
        tier: fetchRes.tier,
        externalUrl: targetUrl
      };
    },

    /**
     * Resolve playback information for an episode or sample
     */
    getPlaybackInfo: async function (episodeOrUrl) {
      // 1. Check if this is an authorized sample video
      if (typeof episodeOrUrl === 'object' && episodeOrUrl !== null && episodeOrUrl.isSample) {
        var sampleUrl = episodeOrUrl.streamUrl || episodeOrUrl.url || '';
        return {
          type: 'direct',
          streamUrl: sampleUrl,
          directPlayUrl: sampleUrl,
          hlsPlayUrl: undefined,
          embedUrl: '',
          pageUrl: episodeOrUrl.url || '',
          allowIframe: false,
          adGateDetected: false,
          downloadable: true,
          downloadUrl: episodeOrUrl.downloadUrl || sampleUrl,
          downloadRestrictionReason: '',
          isAuthorizedSample: true
        };
      }

      var pageUrl = '';
      var streamUrl = '';
      var directPlayUrl = '';
      var refreshToken = '';
      var requestedEpNum = 1;
      var adGateDetected = false;
      var unavailable = false;

      if (typeof episodeOrUrl === 'string') {
        pageUrl = normalizeUrl(episodeOrUrl);
      } else if (typeof episodeOrUrl === 'object' && episodeOrUrl !== null) {
        pageUrl = normalizeUrl(episodeOrUrl.url || episodeOrUrl.watch_url || '');
        var initialStreams = resolveRawEpisodeStreams(episodeOrUrl);
        streamUrl = initialStreams.playUrl || episodeOrUrl.streamUrl || '';
        directPlayUrl = initialStreams.directPlayUrl || '';
        refreshToken = episodeOrUrl.refreshSourceToken || '';
        if (episodeOrUrl.number !== undefined && episodeOrUrl.number !== '') {
          requestedEpNum = parseInt(episodeOrUrl.number, 10) || 1;
        }
      }

      if (pageUrl) {
        var urlEpMatch = pageUrl.match(/\/detail\/watch\/[^/?#]+\/(\d+)/);
        if (urlEpMatch) {
          requestedEpNum = parseInt(urlEpMatch[1], 10) || requestedEpNum;
        }
      }

      // If streamUrl not readily available in episode object, attempt extraction
      if (!streamUrl && !directPlayUrl && pageUrl) {
        try {
          var fetchTargetUrl = pageUrl;
          var slugMatch = pageUrl.match(/\/detail\/watch\/([^/?#]+)/);
          var slug = slugMatch ? slugMatch[1] : '';
          if (slug && !/\/detail\/watch\/[^/?#]+\/\d+/.test(pageUrl)) {
            fetchTargetUrl = BASE_URL + '/detail/watch/' + slug + '/' + requestedEpNum + '?lang=tr-TR';
          }

          var res = await fetchHtmlText(fetchTargetUrl);
          if (res.ok && res.html) {
            if (/adsGate|İzlemeden önce reklam|\\u0130zlemeden \\u00f6nce reklam|adsGateUnlockToken|showTimeGateAd/i.test(res.html)) {
              adGateDetected = true;
            }
            if (!refreshToken) {
              refreshToken = extractRefreshSourceToken(res.html);
            }
            var rawList = extractBalancedJsonArray(res.html, 'episodeItemsRaw');
            if (rawList && rawList.length > 0) {
              var matchingEp = rawList.find(function (e) { return (e.number || e.route_episode_number) === requestedEpNum; }) || rawList[0];
              if (matchingEp) {
                var resolved = resolveRawEpisodeStreams(matchingEp);
                streamUrl = resolved.playUrl;
                directPlayUrl = resolved.directPlayUrl;
              }
            } else {
              var extracted = extractDetailsFromHtml(res.html, fetchTargetUrl);
              if (extracted.episodes && extracted.episodes.length > 0) {
                var matchingEp2 = extracted.episodes.find(function (e) { return e.number === requestedEpNum; }) || extracted.episodes[0];
                if (matchingEp2) {
                  streamUrl = matchingEp2.playUrl || '';
                  directPlayUrl = matchingEp2.directPlayUrl || '';
                }
              }
            }
          }

          // If episodeItemsRaw had an empty play_url for this episode, query NartoDrama's public refresh-source endpoint
          if (!streamUrl && !directPlayUrl && slug && refreshToken) {
            var rsUrl = BASE_URL + '/e/rs/detail/watch/' + slug + '/' + requestedEpNum +
              '/refresh-source?lang=tr-TR&rs_ctx=' + encodeURIComponent(refreshToken) + '&force=1';
            var rsRes = await fetchHtmlText(rsUrl);
            if (rsRes && rsRes.html) {
              try {
                var rsData = JSON.parse(rsRes.html);
                if (rsData) {
                  if (rsData.unavailable) {
                    unavailable = true;
                  } else {
                    var rsStreams = resolveRawEpisodeStreams(rsData);
                    streamUrl = rsStreams.playUrl;
                    directPlayUrl = rsStreams.directPlayUrl;
                  }
                }
              } catch (rsParseErr) {
                // ignore non-json refresh response
              }
            }
          }
        } catch (e) {
          console.warn('[SiteAdapter] getPlaybackInfo fetch error:', e);
        }
      } else if (pageUrl) {
        // NartoDrama episode pages include the ad verification mechanism
        adGateDetected = true;
      }

      var finalStream = directPlayUrl || streamUrl;
      var playbackType = finalStream ? 'direct' : 'in_app_webview';

      return {
        type: playbackType,
        streamUrl: finalStream || undefined,
        directPlayUrl: directPlayUrl || undefined,
        hlsPlayUrl: streamUrl || undefined,
        pageUrl: pageUrl || BASE_URL,
        allowIframe: false,
        adGateDetected: adGateDetected,
        unavailable: unavailable,
        adGateNote: unavailable
          ? 'Bu dizi veya bölüm kaynak sunucuda şu anda kullanılamıyor (yayından kaldırılmış).'
          : 'NartoDrama bazı bölümlerde izlemeden önce reklam doğrulaması (İzlemeden önce reklam) gerektirebilir. Doğrulama ve oynatma uygulama içi güvenli görünümde gerçekleştirilir.',
        downloadable: false,
        downloadRestrictionReason: RESTRICTION_NOTE,
        isAuthorizedSample: false
      };
    },

    /**
     * Get authorized open-license sample videos for testing native DownloadManager
     * and local video player without infringing or faking NartoDrama content.
     */
    getAuthorizedSamples: function () {
      return JSON.parse(JSON.stringify(AUTHORIZED_SAMPLES));
    },

    /**
     * Helper for robust episodeItemsRaw extraction (used for regression tests)
     */
    _extractEpisodeItemsFromHtml: function (html, pageUrl) {
      var details = extractDetailsFromHtml(html, pageUrl);
      return details.episodes.map(function (ep) {
        return {
          id: ep.id,
          number: String(ep.number),
          title: ep.title,
          rawTitle: ep.rawTitle,
          url: ep.url,
          playUrl: ep.playUrl,
          directPlayUrl: ep.directPlayUrl,
          poster: ep.poster,
          posterUrl: ep.posterUrl,
          duration: ep.duration,
          playable: ep.playable,
          isUnlocked: ep.isUnlocked,
          downloadable: ep.downloadable,
          downloadRestrictionReason: ep.downloadRestrictionReason
        };
      });
    }
  };

  // Expose to window/global scope
  if (typeof window !== 'undefined') {
    window.SiteAdapter = SiteAdapter;
  }
  if (typeof global !== 'undefined') {
    global.SiteAdapter = SiteAdapter;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SiteAdapter;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
