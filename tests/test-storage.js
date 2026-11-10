/**
 * DramaPocket - DramaStorage Unit & Integration Tests
 * Verifies favorites, history, continue-watching progress, and download tracking.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock localStorage for Node.js test environment
class MockLocalStorage {
    constructor() {
        this.store = {};
    }
    getItem(key) {
        return this.store.hasOwnProperty(key) ? this.store[key] : null;
    }
    setItem(key, value) {
        this.store[key] = String(value);
    }
    removeItem(key) {
        delete this.store[key];
    }
    clear() {
        this.store = {};
    }
}

global.localStorage = new MockLocalStorage();
global.window = global;

function runStorageTests() {
    console.log('=== Running DramaStorage Verification Tests ===');
    const storagePath = path.resolve(__dirname, '../app/src/main/assets/www/js/storage.js');

    if (!fs.existsSync(storagePath)) {
        throw new Error(`storage.js not found at ${storagePath}`);
    }

    // Require or evaluate storage.js
    const storageCode = fs.readFileSync(storagePath, 'utf8');
    eval(storageCode);

    const storage = window.DramaStorage || (typeof DramaStorage !== 'undefined' ? DramaStorage : null);
    assert(storage, 'DramaStorage must be exposed on window or global scope');

    localStorage.clear();

    // 1. Favorites Tests
    console.log('[Test 1] Favorites: Toggle, Check, Remove, List');
    assert.strictEqual(storage.isFavorite('drama-101'), false, 'Should not be favorite initially');
    
    const dramaA = { id: 'drama-101', title: 'Test Drama A', posterUrl: 'https://example.com/a.jpg', url: 'https://nartodrama.com/drama/a' };
    const added = storage.toggleFavorite(dramaA);
    assert.strictEqual(added, true, 'toggleFavorite on new item should return true');
    assert.strictEqual(storage.isFavorite('drama-101'), true, 'Should be favorite after adding');
    
    let favs = storage.getFavorites();
    assert.strictEqual(favs.length, 1, 'Favorites count should be 1');
    assert.strictEqual(favs[0].id, 'drama-101');

    // Toggle again removes it
    const removed = storage.toggleFavorite(dramaA);
    assert.strictEqual(removed, false, 'toggleFavorite on existing item should remove and return false');
    assert.strictEqual(storage.isFavorite('drama-101'), false, 'Should not be favorite after second toggle');
    favs = storage.getFavorites();
    assert.strictEqual(favs.length, 0, 'Favorites count should be 0 after toggle remove');

    // Add back and test removeFavorite explicitly
    storage.toggleFavorite(dramaA);
    assert.strictEqual(storage.isFavorite('drama-101'), true);
    const removeSuccess = storage.removeFavorite('drama-101');
    assert.strictEqual(removeSuccess, true, 'removeFavorite should return true');
    assert.strictEqual(storage.isFavorite('drama-101'), false);
    console.log('  -> PASS: Favorites operations verified');

    // 2. Recently Viewed (History) Tests
    console.log('[Test 2] Recently Viewed: Order and Deduplication');
    localStorage.clear();
    const item1 = { id: 'drama-1', title: 'Drama 1' };
    const item2 = { id: 'drama-2', title: 'Drama 2' };
    const item3 = { id: 'drama-3', title: 'Drama 3' };

    storage.addRecentlyViewed(item1);
    storage.addRecentlyViewed(item2);
    storage.addRecentlyViewed(item3);

    let history = storage.getRecentlyViewed();
    assert.strictEqual(history.length, 3);
    assert.strictEqual(history[0].id, 'drama-3', 'Most recently viewed should be first');
    assert.strictEqual(history[1].id, 'drama-2');
    assert.strictEqual(history[2].id, 'drama-1');

    // Re-viewing item1 moves it to front
    storage.addRecentlyViewed(item1);
    history = storage.getRecentlyViewed();
    assert.strictEqual(history.length, 3, 'Deduplication should keep list size 3');
    assert.strictEqual(history[0].id, 'drama-1', 'Re-viewed item should move to index 0');
    console.log('  -> PASS: Recently viewed ordering and deduplication verified');

    // 3. Continue Watching (Playback Progress)
    console.log('[Test 3] Continue Watching: Save and Restore Progress');
    storage.savePlaybackProgress({
        dramaId: 'drama-1',
        dramaTitle: 'Drama 1',
        episodeId: 'ep-2',
        episodeTitle: 'Bolum 2',
        positionSec: 450,
        durationSec: 1200
    });

    const progress = storage.getEpisodeProgress('ep-2');
    assert(progress, 'Progress object should exist for ep-2');
    assert.strictEqual(progress.positionSec, 450);
    assert.strictEqual(progress.durationSec, 1200);
    assert.strictEqual(progress.progressPercent, 38);
    assert.strictEqual(progress.completed, false);

    const continueList = storage.getContinueWatching();
    assert(Array.isArray(continueList));
    assert.strictEqual(continueList.length, 1);
    assert.strictEqual(continueList[0].episodeId, 'ep-2');

    // Removal of continue watching
    storage.removeContinueWatching('ep-2');
    assert.strictEqual(storage.getEpisodeProgress('ep-2'), null);
    assert.strictEqual(storage.getContinueWatching().length, 0);
    console.log('  -> PASS: Continue watching progress save/restore/remove verified');

    // 4. Download Records Tests
    console.log('[Test 4] Download Records');
    const dlRecord = {
        id: 'dl-1',
        downloadId: 'dl-1',
        title: 'Authorized Sample: Tears of Steel',
        fileName: 'tears-of-steel.mp4',
        url: 'https://example.com/tears-of-steel.mp4',
        status: 'SUCCESSFUL',
        progress: 100,
        isSample: true
    };
    storage.saveDownloadRecord(dlRecord);
    let downloads = storage.getDownloads();
    assert.strictEqual(downloads.length, 1, 'Downloads should contain recorded item');
    assert.strictEqual(downloads[0].id, 'dl-1');
    assert.strictEqual(downloads[0].status, 'SUCCESSFUL');

    // Update download record status
    dlRecord.status = 'COMPLETED';
    storage.saveDownloadRecord(dlRecord);
    downloads = storage.getDownloads();
    assert.strictEqual(downloads.length, 1, 'Record should be updated in place');

    // Remove download record
    storage.removeDownloadRecord('dl-1');
    assert.strictEqual(storage.getDownloads().length, 0, 'Downloads should be empty after removal');
    console.log('  -> PASS: Download records verified');

    // 5. Corrupted Storage Graceful Recovery
    console.log('[Test 5] Resilience against Corrupted JSON in localStorage');
    localStorage.setItem('dramapocket_favorites_v1', '{invalid-json');
    const safeFavs = storage.getFavorites();
    assert(Array.isArray(safeFavs), 'Must return empty array on corrupted JSON without crashing');
    assert.strictEqual(safeFavs.length, 0);
    console.log('  -> PASS: Corrupted JSON resilience verified');

    console.log('=== All DramaStorage Tests PASSED ===\n');
    return true;
}

if (require.main === module) {
    try {
        runStorageTests();
    } catch (err) {
        console.error('STORAGE TEST FAILED:', err.message);
        process.exit(1);
    }
}

module.exports = { runStorageTests };
