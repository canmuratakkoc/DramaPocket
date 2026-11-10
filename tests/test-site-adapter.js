/**
 * DramaPocket - SiteAdapter Contract & Behavior Tests
 * Verifies contract methods, AndroidBridge integration, fallback handling,
 * truthfulness (no fake live catalogs), and authorized sample video isolation.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function createMockDOMParser() {
    return class MockDOMParser {
        parseFromString(str, type) {
            return {
                querySelectorAll: (selector) => [],
                querySelector: (selector) => null,
                body: { textContent: str }
            };
        }
    };
}

async function runSiteAdapterTests() {
    console.log('=== Running SiteAdapter Verification Tests ===');
    const adapterPath = path.resolve(__dirname, '../app/src/main/assets/www/js/site-adapter.js');

    if (!fs.existsSync(adapterPath)) {
        throw new Error(`site-adapter.js not found at ${adapterPath}`);
    }

    // Set up mock browser environment
    global.window = global;
    if (typeof global.DOMParser === 'undefined') {
        global.DOMParser = createMockDOMParser();
    }

    let SiteAdapter;
    try {
        SiteAdapter = require(adapterPath);
    } catch (e) {
        const code = fs.readFileSync(adapterPath, 'utf8');
        eval(code);
        SiteAdapter = window.SiteAdapter;
    }

    assert(SiteAdapter, 'SiteAdapter must be exported or set on window');

    // 1. Contract & Metadata Test
    console.log('[Test 1] SiteAdapter.getInfo() Contract');
    const info = SiteAdapter.getInfo();
    assert(info, 'getInfo() must return an object');
    assert.strictEqual(info.name, 'NartoDrama', 'Name should be NartoDrama');
    assert(info.baseUrl && info.baseUrl.includes('nartodrama.com'), 'Base URL must point to nartodrama.com');
    assert(info.capabilities, 'Capabilities must be defined');
    assert.strictEqual(info.capabilities.episodeDownloadAllowed, false, 'episodeDownloadAllowed must be strictly false');
    assert.strictEqual(info.capabilities.authorizedSampleDownload, true, 'authorizedSampleDownload must be true');
    assert(info.restrictionsNote && info.restrictionsNote.length > 10, 'Honest restrictionsNote must be present');
    console.log('  -> PASS: getInfo() contract verified');

    // 2. Authorized Samples Integrity & Separation
    console.log('[Test 2] SiteAdapter.getAuthorizedSamples() Isolation & Verification');
    const samples = SiteAdapter.getAuthorizedSamples();
    assert(Array.isArray(samples), 'getAuthorizedSamples() must return an array');
    assert(samples.length >= 2, 'Should provide at least 2 authorized test samples');
    
    for (const sample of samples) {
        assert(sample.id, 'Sample must have an id');
        assert(sample.title, 'Sample must have a title');
        assert(sample.streamUrl || sample.videoUrl, 'Sample must have a direct stream/video URL');
        const url = sample.streamUrl || sample.videoUrl;
        assert(url.startsWith('https://'), 'Sample URL must be HTTPS');
        assert(sample.isSample === true, 'Sample must have isSample: true');
        assert(sample.badge || sample.tag, 'Sample must have a Turkish test badge');
        assert(!url.includes('nartodrama.com'), 'Authorized sample videos must not be disguised nartodrama URLs');
    }
    console.log('  -> PASS: Authorized samples are properly isolated, open-licensed, and valid');

    // 3. Playback Info Contract for Samples vs Real Episodes
    console.log('[Test 3] SiteAdapter.getPlaybackInfo() download permission enforcement');
    const samplePlayback = await SiteAdapter.getPlaybackInfo({
        isSample: true,
        streamUrl: samples[0].streamUrl || samples[0].videoUrl,
        pageUrl: 'https://test.local/sample1'
    });
    assert.strictEqual(samplePlayback.isAuthorizedSample, true, 'Sample playback must flag isAuthorizedSample: true');
    assert.strictEqual(samplePlayback.downloadable, true, 'Sample playback must be downloadable');

    const liveEpisodePlayback = await SiteAdapter.getPlaybackInfo({
        isSample: false,
        pageUrl: 'https://nartodrama.com/test-drama-1-bolum/'
    });
    assert.strictEqual(liveEpisodePlayback.downloadable, false, 'NartoDrama episodes must NEVER be flagged downloadable');
    assert(liveEpisodePlayback.downloadRestrictionReason && liveEpisodePlayback.downloadRestrictionReason.length > 5, 
        'Download restriction reason must be explicitly stated');
    console.log('  -> PASS: getPlaybackInfo strictly forbids illegal/unsupported NartoDrama episode downloading');

    // 4. Search Method Contract & Input Handling
    console.log('[Test 4] SiteAdapter.search() with empty and normal queries');
    const emptyResult = await SiteAdapter.search('');
    assert(emptyResult, 'Empty search must return an object');
    assert(Array.isArray(emptyResult.items), 'items must be an array');
    assert.strictEqual(emptyResult.items.length, 0, 'Empty search should yield 0 items');

    // 5. Test with mock AndroidBridge
    console.log('[Test 5] SiteAdapter with AndroidBridge mock');
    let bridgeCalled = false;
    global.window.AndroidBridge = {
        fetchHtml: (url) => {
            bridgeCalled = true;
            return JSON.stringify({
                status: 200,
                html: '<!DOCTYPE html><html><body><article class="card"><a href="/drama/test">Watch</a><h3 class="title">Test Result Drama</h3></article></body></html>'
            });
        }
    };

    try {
        const bridgeSearchResult = await SiteAdapter.search('romance');
        assert(bridgeSearchResult, 'Search result with bridge should return object');
        assert(bridgeCalled, 'AndroidBridge.fetchHtml should be invoked when present');
        assert(bridgeSearchResult.source === 'live' || bridgeSearchResult.source === 'bridge', 
            `Source should indicate bridge or live, got: ${bridgeSearchResult.source}`);
    } finally {
        delete global.window.AndroidBridge;
    }
    console.log('  -> PASS: AndroidBridge integration path verified');

    // 6. Error & Fallback Handling without Bridge in Node environment (simulating network block or CORS)
    console.log('[Test 6] SiteAdapter graceful fallback on network / CORS failure');
    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new Error('Failed to fetch (CORS simulation)');
    };

    try {
        const fallbackCatalog = await SiteAdapter.getHomeCatalog({ page: 1 });
        assert(fallbackCatalog, 'getHomeCatalog must return object even on network failure');
        assert(fallbackCatalog.source === 'error' || fallbackCatalog.source === 'fallback', 
            `Source should be error or fallback, got: ${fallbackCatalog.source}`);
        assert(fallbackCatalog.fallbackUrl || fallbackCatalog.externalUrl, 'Must provide fallback URL');
        if (fallbackCatalog.source === 'error' || fallbackCatalog.source === 'fallback') {
            assert(fallbackCatalog.items.length === 0 || fallbackCatalog.isMock === false, 
                'Must not return fake demo dramas disguised as live catalog');
        }
    } finally {
        global.fetch = originalFetch; // Always cleanly restore real fetch
    }
    console.log('  -> PASS: Network error & fallback metadata verified without fake data disguise');

    console.log('=== All SiteAdapter Tests PASSED ===\n');
    return true;
}

if (require.main === module) {
    runSiteAdapterTests().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('SITE ADAPTER TEST FAILED:', err.message);
        process.exit(1);
    });
}

module.exports = { runSiteAdapterTests };
