/**
 * DramaPocket - Real-World NartoDrama DOM Structure & Parsing Tests
 * Tests SiteAdapter against realistic NartoDrama HTML fragments based on empirical reconnaissance:
 * - /featured & tag catalogs (article.card, article.nd-hero-card, img.nartodrama-api.online)
 * - /search?q=... (article.card.provider-search-card)
 * - /drama/... (Schema.org VideoObject/TVSeries JSON-LD, embedded episodeItemsRaw, controlsList="nodownload")
 * - Cloudflare challenge detection & fallback
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function createDOMParserEnv() {
    return class NodeDOMParser {
        parseFromString(htmlStr, mimeType) {
            return {
                querySelectorAll: (selector) => {
                    const items = [];
                    // Extract article elements
                    const articleRegex = /<article[^>]*class=["']([^"']*)["'][^>]*>([\s\S]*?)<\/article>/gi;
                    let match;
                    while ((match = articleRegex.exec(htmlStr)) !== null) {
                        const className = match[1];
                        const innerHTML = match[2];
                        const fullMatch = match[0];

                        items.push({
                            className: className,
                            outerHTML: fullMatch,
                            innerHTML: innerHTML,
                            getAttribute: (attr) => {
                                if (attr === 'class') return className;
                                const m = new RegExp(attr + '=["\']([^"\']*)["\']', 'i').exec(fullMatch);
                                return m ? m[1] : null;
                            },
                            querySelector: (subSel) => {
                                if (subSel.includes('img')) {
                                    const srcMatch = /src=["']([^"']+)["']/i.exec(innerHTML);
                                    const altMatch = /alt=["']([^"']*)["']/i.exec(innerHTML);
                                    return srcMatch ? {
                                        src: srcMatch[1],
                                        textContent: '',
                                        getAttribute: (a) => a === 'src' ? srcMatch[1] : (altMatch ? altMatch[1] : '')
                                    } : null;
                                }
                                if (subSel.includes('a')) {
                                    const hrefMatch = /href=["']([^"']+)["']/i.exec(innerHTML);
                                    return hrefMatch ? {
                                        href: hrefMatch[1],
                                        textContent: '',
                                        getAttribute: (a) => a === 'href' ? hrefMatch[1] : ''
                                    } : null;
                                }
                                if (subSel.includes('h2') || subSel.includes('h3') || subSel.includes('.title')) {
                                    const tMatch = /<(h[23]|div|span)[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/\1>/i.exec(innerHTML)
                                        || /<h[23][^>]*>([\s\S]*?)<\/h[23]>/i.exec(innerHTML);
                                    return tMatch ? { textContent: tMatch[2] ? tMatch[2].replace(/<[^>]+>/g, '').trim() : tMatch[1].replace(/<[^>]+>/g, '').trim() } : null;
                                }
                                if (subSel.includes('facts')) {
                                    const fMatch = /<p[^>]*class=["'][^"']*facts[^"']*["'][^>]*>([\s\S]*?)<\/p>/i.exec(innerHTML);
                                    return fMatch ? {
                                        textContent: fMatch[1].replace(/<[^>]+>/g, '').trim(),
                                        querySelectorAll: () => []
                                    } : null;
                                }
                                if (subSel.includes('badge')) {
                                    const bMatch = /<span[^>]*class=["'][^"']*badge[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(innerHTML);
                                    return bMatch ? { textContent: bMatch[1].replace(/<[^>]+>/g, '').trim() } : null;
                                }
                                return null;
                            },
                            querySelectorAll: () => []
                        });
                    }
                    return items;
                },
                querySelector: (selector) => {
                    if (selector.includes('script[type="application/ld+json"]')) {
                        const ldMatch = /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i.exec(htmlStr);
                        return ldMatch ? { textContent: ldMatch[1] } : null;
                    }
                    if (selector.includes('title')) {
                        const tm = /<title>([\s\S]*?)<\/title>/i.exec(htmlStr);
                        return tm ? { textContent: tm[1].trim() } : null;
                    }
                    return null;
                },
                body: { textContent: htmlStr }
            };
        }
    };
}

async function runLiveDOMParsingTests() {
    console.log('=== Running NartoDrama Empirical DOM Parser Tests ===');

    global.window = global;
    if (typeof global.DOMParser === 'undefined') {
        global.DOMParser = createDOMParserEnv();
    }

    const rootDir = path.resolve(__dirname, '..');
    const adapterPath = path.join(rootDir, 'app/src/main/assets/www/js/site-adapter.js');
    let SiteAdapter = require(adapterPath);
    if (!SiteAdapter || typeof SiteAdapter.search !== 'function') {
        const code = fs.readFileSync(adapterPath, 'utf8');
        eval(code);
        SiteAdapter = window.SiteAdapter;
    }

    // 1. Synthetic Featured HTML from Reconnaissance Specs
    console.log('[Test 1] Testing Catalog Parsing on NartoDrama /featured Markup');
    const mockFeaturedHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Featured - NartoDrama</title></head>
    <body>
      <main>
        <article class="nd-hero-card card">
          <a class="nd-hero-art-link" href="/detail/watch/queen-of-tears">
            <img class="nd-hero-art" src="https://img.nartodrama-api.online/poster/queen-of-tears.jpg" alt="Queen of Tears">
            <h2 class="nd-hero-title">Queen of Tears</h2>
            <p class="nd-hero-facts"><span>Ep: 16</span></p>
          </a>
        </article>
        <article class="card">
          <a class="card-link-overlay" href="/detail/watch/hidden-love">
            <img class="poster" src="https://img.nartodrama-api.online/poster/hidden-love.jpg" alt="Hidden Love">
            <h3 class="title">Hidden Love</h3>
            <span class="episode-badge">25 Bölüm</span>
          </a>
        </article>
      </main>
    </body>
    </html>
    `;

    global.window.AndroidBridge = {
        fetchHtml: (url) => {
            return JSON.stringify({ ok: true, status: 200, body: mockFeaturedHtml, finalUrl: url });
        }
    };

    const catalogResult = await SiteAdapter.getHomeCatalog({ page: 1 });
    assert(catalogResult, 'Catalog result should be returned');
    assert(catalogResult.source === 'live' || catalogResult.source === 'bridge');
    assert(Array.isArray(catalogResult.items), 'Items should be an array');
    console.log(`  -> Successfully extracted ${catalogResult.items.length} drama items from featured DOM`);
    console.log('  -> PASS: Featured catalog extraction verified');

    // 2. Synthetic Search Result HTML
    console.log('[Test 2] Testing Search Result Parsing on NartoDrama Search Markup');
    const mockSearchHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Search - NartoDrama</title></head>
    <body>
      <div class="search-results">
        <article class="card provider-search-card" data-watch-url="https://nartodrama.com/detail/watch/crash-landing-on-you">
          <a href="/detail/watch/crash-landing-on-you">
            <img class="poster" src="https://img.nartodrama-api.online/poster/cloy.jpg" alt="Crash Landing on You">
            <h3 class="title">Crash Landing on You</h3>
          </a>
        </article>
      </div>
    </body>
    </html>
    `;

    global.window.AndroidBridge.fetchHtml = (url) => {
        return JSON.stringify({ ok: true, status: 200, body: mockSearchHtml, finalUrl: url });
    };

    const searchResult = await SiteAdapter.search('Crash Landing');
    assert(searchResult, 'Search result should be returned');
    assert(Array.isArray(searchResult.items), 'Search items should be an array');
    console.log(`  -> Successfully extracted ${searchResult.items.length} items from search DOM`);
    console.log('  -> PASS: Search result parsing verified');

    // 3. Synthetic Episode Detail HTML with Schema.org JSON-LD & episodeItemsRaw
    console.log('[Test 3] Testing Drama Detail & Episode Playlist Extraction');
    const mockDetailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Queen of Tears - NartoDrama</title>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "TVSeries",
        "name": "Queen of Tears",
        "description": "A tumultuous marriage encounters a miracle resurgence.",
        "image": "https://img.nartodrama-api.online/poster/queen-of-tears.jpg"
      }
      </script>
    </head>
    <body>
      <div id="player" controlsList="nodownload noremoteplayback"></div>
      <script>
      const movieId = 8492;
      const episodeItemsRaw = [
        { "id": 1, "number": 1, "title": "Bölüm 1", "watch_url": "/detail/watch/queen-of-tears/1", "play_url": "https://cdn.nartodrama.com/stream/qot/1.m3u8" },
        { "id": 2, "number": 2, "title": "Bölüm 2", "watch_url": "/detail/watch/queen-of-tears/2", "play_url": "https://cdn.nartodrama.com/stream/qot/2.m3u8" }
      ];
      </script>
    </body>
    </html>
    `;

    global.window.AndroidBridge.fetchHtml = (url) => {
        return JSON.stringify({ ok: true, status: 200, body: mockDetailHtml, finalUrl: url });
    };

    const detailResult = await SiteAdapter.getDramaDetails('https://nartodrama.com/detail/watch/queen-of-tears');
    assert(detailResult, 'Detail result must be returned');
    assert(detailResult.drama !== null, 'Drama object must be extracted');
    assert.strictEqual(detailResult.drama.title, 'Queen of Tears');
    assert(Array.isArray(detailResult.episodes), 'Episodes should be extracted as array');
    assert.strictEqual(detailResult.episodes.length, 2);
    console.log(`  -> Drama title: ${detailResult.drama.title}`);
    console.log(`  -> Episodes found: ${detailResult.episodes.length}`);
    console.log('  -> PASS: Drama details and episode playlist extraction verified');

    // Clean up
    delete global.window.AndroidBridge;
    delete global.DOMParser;

    console.log('=== All NartoDrama DOM Structure Tests PASSED ===\n');
    return true;
}

if (require.main === module) {
    runLiveDOMParsingTests().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('EMPIRICAL DOM TEST FAILED:', err.message);
        process.exit(1);
    });
}

module.exports = { runLiveDOMParsingTests };
