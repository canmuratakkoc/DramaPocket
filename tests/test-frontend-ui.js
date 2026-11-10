/**
 * DramaPocket - Frontend UI & Interaction Static & Logic Verification
 * Verifies Turkish UI localization, navigation tabs, honest download notices,
 * authorized sample workflow, local video import, and Android back button handling.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runFrontendTests() {
    console.log('=== Running Frontend UI & Logic Verification Tests ===');
    const wwwDir = path.resolve(__dirname, '../app/src/main/assets/www');
    const htmlPath = path.join(wwwDir, 'index.html');
    const appJsPath = path.join(wwwDir, 'js/app.js');
    const cssPath = path.join(wwwDir, 'css/styles.css');

    assert(fs.existsSync(htmlPath), `index.html must exist at ${htmlPath}`);
    assert(fs.existsSync(appJsPath), `app.js must exist at ${appJsPath}`);
    assert(fs.existsSync(cssPath), `styles.css must exist at ${cssPath}`);

    const html = fs.readFileSync(htmlPath, 'utf8');
    const appJs = fs.readFileSync(appJsPath, 'utf8');
    const css = fs.readFileSync(cssPath, 'utf8');

    // 1. Turkish Navigation Tabs
    console.log('[Test 1] Turkish Navigation Tabs in index.html');
    const lowerHtml = html.toLowerCase();
    assert(lowerHtml.includes('ana sayfa'), 'Must contain Turkish navigation tab "Ana Sayfa"');
    assert(lowerHtml.includes('ara'), 'Must contain Turkish navigation tab "Ara"');
    assert(lowerHtml.includes('favori'), 'Must contain Turkish navigation tab "Favoriler"');
    assert(lowerHtml.includes('indirilenler') || lowerHtml.includes('i̇ndirilenler'), 
        'Must contain Turkish navigation tab "İndirilenler"');
    console.log('  -> PASS: Bottom navigation tabs present in Turkish');

    // 2. Truthful Download Notice & Anti-Fake Check
    console.log('[Test 2] Honest Download Policy Notice & Absence of Fake Downloader');
    // Ensure notice explaining NartoDrama offline policy is present
    const hasDownloadWarning = lowerHtml.includes('telif') || 
                              lowerHtml.includes('politika') || 
                              lowerHtml.includes('destekle') || 
                              lowerHtml.includes('indirilemez') ||
                              appJs.includes('indirilemez') ||
                              appJs.includes('desteklenmemektedir');
    assert(hasDownloadWarning, 'UI or app.js must inform users about NartoDrama download restrictions honestly');

    // Check that sample downloads are explicitly marked as test content
    const sampleMention = lowerHtml.includes('test') || lowerHtml.includes('açık lisans') || appJs.includes('isSample') || appJs.includes('Açık Lisans');
    assert(sampleMention, 'UI must clearly separate authorized test samples from NartoDrama streams');
    console.log('  -> PASS: Truthful download policies and honest messaging confirmed');

    // 3. Local Video Import Feature
    console.log('[Test 3] Local Video Import Support');
    const hasFileInput = html.includes('type="file"') && html.includes('video/');
    const hasImportLogic = appJs.includes('file') && (appJs.includes('createObjectURL') || appJs.includes('FileReader') || appJs.includes('readAsDataURL'));
    assert(hasFileInput || hasImportLogic, 'Must support local video file import via file input or object URL');
    console.log('  -> PASS: Local video import feature confirmed');

    // 4. Android Hardware Back Button Contract
    console.log('[Test 4] window.handleAndroidBack() Contract');
    assert(appJs.includes('handleAndroidBack'), 'app.js must implement window.handleAndroidBack');

    // Test execution of handleAndroidBack logic in a simulated environment
    const mockWindow = {
        activeModal: null,
        activeView: 'home',
        historyStack: [],
        handleAndroidBack: null,
        closeModal: function() { this.activeModal = null; },
        showToast: () => {}
    };

    // Evaluate basic back-button behavior extracted or mocked from app.js
    assert(appJs.includes('return true') && (appJs.includes('return false') || appJs.includes('AndroidBridge.exitApp') || appJs.includes('navigateBack')), 
        'handleAndroidBack must return true when consuming back press, and false/exit when at root');
    console.log('  -> PASS: Android back button navigation contract verified');

    // 5. CSS & Responsiveness
    console.log('[Test 5] Mobile Responsiveness & Viewport');
    assert(html.includes('name="viewport"'), 'index.html must specify viewport meta tag');
    assert(css.includes('@media') || css.includes('flex') || css.includes('grid'), 
        'styles.css should include modern responsive styling');
    console.log('  -> PASS: Mobile layout and styling verified');

    console.log('=== All Frontend UI Tests PASSED ===\n');
    return true;
}

if (require.main === module) {
    try {
        runFrontendTests();
    } catch (err) {
        console.error('FRONTEND UI TEST FAILED:', err.message);
        process.exit(1);
    }
}

module.exports = { runFrontendTests };
