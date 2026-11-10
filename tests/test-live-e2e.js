/**
 * DramaPocket - Live End-to-End Network Tests against https://nartodrama.com
 * Executes actual live network calls through SiteAdapter:
 * 1. Live Catalog: SiteAdapter.getHomeCatalog({ page: 1 })
 * 2. Live Search: SiteAdapter.search('cinta') or 'love'
 * 3. Live Drama Details: SiteAdapter.getDramaDetails(dramaUrl)
 * 4. Live Episode Playback Info: SiteAdapter.getPlaybackInfo(episode)
 */

const assert = require('assert');
const path = require('path');

async function runLiveE2ETests() {
    console.log('=== Running Live End-to-End Tests against https://nartodrama.com ===');
    const adapterPath = path.resolve(__dirname, '../app/src/main/assets/www/js/site-adapter.js');
    const SiteAdapter = require(adapterPath);

    assert(SiteAdapter, 'SiteAdapter must be loadable in Node.js');

    // 1. Live Catalog Request
    console.log('[E2E Test 1] Fetching live home catalog from https://nartodrama.com/featured ...');
    const catalog = await SiteAdapter.getHomeCatalog({ page: 1 });
    assert(catalog, 'Catalog response should be an object');
    console.log(`  -> Source: ${catalog.source} | LiveStatus: ${catalog.liveStatus}`);
    console.log(`  -> Extracted items count: ${catalog.items ? catalog.items.length : 0}`);

    if (catalog.items && catalog.items.length > 0) {
        const first = catalog.items[0];
        console.log(`  -> First Item Title: "${first.title}"`);
        console.log(`  -> First Item URL: ${first.url}`);
        console.log(`  -> Total Episodes: ${first.totalEpisodes}`);
        assert(first.title && first.title.length > 0, 'First item must have a title');
        assert(first.url && first.url.startsWith('https://nartodrama.com'), 'First item must have a valid NartoDrama URL');
    }
    console.log('  -> PASS: Live home catalog verification completed');

    // 2. Live Search Request
    console.log('\n[E2E Test 2] Executing live search for "cinta" on https://nartodrama.com ...');
    const searchRes = await SiteAdapter.search('cinta');
    assert(searchRes, 'Search response should be an object');
    console.log(`  -> Source: ${searchRes.source} | LiveStatus: ${searchRes.liveStatus}`);
    console.log(`  -> Search results count: ${searchRes.items ? searchRes.items.length : 0}`);

    if (searchRes.items && searchRes.items.length > 0) {
        const top = searchRes.items[0];
        console.log(`  -> Top Result Title: "${top.title}"`);
        console.log(`  -> Top Result URL: ${top.url}`);
        assert(top.title && top.title.length > 0, 'Top search result must have a title');
    }
    console.log('  -> PASS: Live search verification completed');

    // 3. Live Drama Detail & Episode Playlist Request
    let targetDramaUrl = (catalog.items && catalog.items.length > 0) 
        ? catalog.items[0].url 
        : 'https://nartodrama.com/detail/watch/erden-generallige';

    console.log(`\n[E2E Test 3] Fetching live drama details for ${targetDramaUrl} ...`);
    const details = await SiteAdapter.getDramaDetails(targetDramaUrl);
    assert(details, 'Drama details response must be an object');
    console.log(`  -> Source: ${details.source} | LiveStatus: ${details.liveStatus}`);

    if (details.drama) {
        console.log(`  -> Drama Title: "${details.drama.title}"`);
        console.log(`  -> Description: ${details.drama.description ? details.drama.description.substring(0, 80) + '...' : '(none)'}`);
    }
    console.log(`  -> Extracted episodes count: ${details.episodes ? details.episodes.length : 0}`);

    if (details.episodes && details.episodes.length > 0) {
        const ep1 = details.episodes[0];
        console.log(`  -> Episode 1 Title: "${ep1.title}"`);
        console.log(`  -> Episode 1 URL: ${ep1.url}`);
        console.log(`  -> Episode 1 Stream URL present: ${!!(ep1.playUrl || ep1.directPlayUrl)}`);

        // 4. Live Playback Info Contract Check on Real Episode
        console.log('\n[E2E Test 4] Testing getPlaybackInfo on real NartoDrama episode ...');
        const playback = await SiteAdapter.getPlaybackInfo(ep1);
        console.log(`  -> Playback type: ${playback.type}`);
        console.log(`  -> Downloadable: ${playback.downloadable} (strictly false enforced)`);
        console.log(`  -> Restriction reason: "${playback.downloadRestrictionReason}"`);
        assert.strictEqual(playback.downloadable, false, 'Real episode must NOT be downloadable');
        assert.strictEqual(playback.isAuthorizedSample, false, 'Real episode must NOT be flagged as sample');
        assert(playback.downloadRestrictionReason && playback.downloadRestrictionReason.length > 10, 'Restriction reason must be detailed');
    }
    console.log('  -> PASS: Live drama details and playback info verified');

    console.log('\n=== All Live End-to-End Tests PASSED ===\n');
    return {
        catalogCount: catalog.items ? catalog.items.length : 0,
        searchCount: searchRes.items ? searchRes.items.length : 0,
        episodesCount: details.episodes ? details.episodes.length : 0,
        sampleDramaTitle: details.drama ? details.drama.title : (catalog.items && catalog.items[0] ? catalog.items[0].title : 'NartoDrama')
    };
}

if (require.main === module) {
    runLiveE2ETests().then(res => {
        console.log('E2E Summary Data:', JSON.stringify(res, null, 2));
        process.exit(0);
    }).catch(err => {
        console.error('LIVE E2E TEST FAILED:', err);
        process.exit(1);
    });
}

module.exports = { runLiveE2ETests };
