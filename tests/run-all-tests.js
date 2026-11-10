/**
 * DramaPocket - Main Automated QA Test Runner
 * Runs all unit, integration, frontend, and security test suites,
 * tracks failures, and outputs summary statistics.
 */

const { runStorageTests } = require('./test-storage');
const { runSiteAdapterTests } = require('./test-site-adapter');
const { runLiveDOMParsingTests } = require('./test-live-dom-parsing');
const { runLiveE2ETests } = require('./test-live-e2e');
const { runFrontendTests } = require('./test-frontend-ui');
const { runSecurityAudit } = require('./test-security-android');

async function main() {
    console.log('====================================================');
    console.log('  DramaPocket Comprehensive Automated Test Suite');
    console.log('====================================================\n');

    const results = [];

    // Helper to run a test suite
    async function executeSuite(name, fn) {
        process.stdout.write(`>>> Running Suite: ${name} ... `);
        try {
            await fn();
            console.log(`[PASSED]`);
            results.push({ name, status: 'PASSED', error: null });
        } catch (err) {
            console.log(`[FAILED]`);
            console.error(`    Error: ${err.message}`);
            results.push({ name, status: 'FAILED', error: err.message });
        }
    }

    // 1. Storage Suite
    await executeSuite('DramaStorage Persistence & Deduplication', async () => {
        runStorageTests();
    });

    // 2. SiteAdapter Contract & Isolation Suite
    await executeSuite('SiteAdapter Contract, Fallback & Sample Isolation', async () => {
        await runSiteAdapterTests();
    });

    // 3. Empirical DOM Parsing Suite
    await executeSuite('NartoDrama Synthetic DOM Parsing & Extraction', async () => {
        await runLiveDOMParsingTests();
    });

    // 4. Live E2E Suite against https://nartodrama.com
    await executeSuite('NartoDrama Live End-to-End Network Extraction', async () => {
        await runLiveE2ETests();
    });

    // 5. Frontend UI Suite
    await executeSuite('Frontend Turkish UI, Modals & Back Button', async () => {
        runFrontendTests();
    });

    // 6. Android & Security Suite
    await executeSuite('Android Manifest, Bridge, WebView & Security Audit', async () => {
        runSecurityAudit();
    });

    console.log('\n====================================================');
    console.log('               TEST EXECUTION SUMMARY');
    console.log('====================================================');
    let passedCount = 0;
    let failedCount = 0;
    for (const r of results) {
        console.log(`- ${r.name.padEnd(55)} : [${r.status}]`);
        if (r.status === 'PASSED') passedCount++;
        else failedCount++;
    }
    console.log(`\nTotal Suites: ${results.length} | Passed: ${passedCount} | Failed: ${failedCount}`);

    if (failedCount > 0) {
        process.exitCode = 1;
    } else {
        console.log('\nALL TEST SUITES PASSED CLEANLY!');
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('Fatal test runner error:', err);
        process.exit(1);
    });
}
