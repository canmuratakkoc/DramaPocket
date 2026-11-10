/**
 * DramaPocket - Dev Server Verification Test
 * Verifies the zero-dependency local development server:
 * 1. Programmatically starts dev/server.js on test port (5599).
 * 2. Verifies GET / injects /__dev/dev-bridge.js dynamically without modifying index.html on disk.
 * 3. Verifies GET /__dev/dev-bridge.js serves the desktop bridge shim.
 * 4. Verifies GET /__dev/fetch?url=https://example.com is blocked (HTTP 403 Forbidden).
 * 5. Verifies GET /__dev/fetch?url=https%3A%2F%2Fnartodrama.com%2Ffeatured%3Fpage%3D1%26lang%3Dtr-TR returns live NartoDrama HTML.
 * 6. Shuts down the dev server cleanly.
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function httpGet(urlStr) {
    return new Promise((resolve, reject) => {
        http.get(urlStr, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
            });
        }).on('error', reject);
    });
}

async function waitForServer(urlStr, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await httpGet(urlStr);
            if (res.statusCode >= 200 && res.statusCode < 500) {
                return true;
            }
        } catch (e) {
            // Wait and retry
            await new Promise(r => setTimeout(r, 250));
        }
    }
    throw new Error(`Timed out waiting for dev server at ${urlStr} after ${timeoutMs}ms`);
}

async function runDevServerTests() {
    console.log('=== Running Zero-Dependency Dev Server Verification Tests ===');
    const rootDir = path.resolve(__dirname, '..');
    const serverScript = path.join(rootDir, 'dev/server.js');
    const indexHtmlPath = path.join(rootDir, 'app/src/main/assets/www/index.html');

    assert(fs.existsSync(serverScript), `dev/server.js must exist at ${serverScript}`);
    assert(fs.existsSync(indexHtmlPath), `index.html must exist at ${indexHtmlPath}`);

    // Check disk content before running: must NOT contain dev-bridge script tag
    const diskHtmlBefore = fs.readFileSync(indexHtmlPath, 'utf8');
    assert(!diskHtmlBefore.includes('dev-bridge.js'), 
        'Precondition violation: app/src/main/assets/www/index.html on disk must NOT have dev-bridge.js hardcoded!');

    const TEST_PORT = 5599;
    const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

    console.log(`[Test 1] Spawning dev/server.js on port ${TEST_PORT} ...`);
    const serverProcess = spawn(process.execPath, [serverScript, '--port', String(TEST_PORT)], {
        cwd: rootDir,
        env: Object.assign({}, process.env, { PORT: String(TEST_PORT) }),
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverLogs = '';
    serverProcess.stdout.on('data', d => { serverLogs += d.toString(); });
    serverProcess.stderr.on('data', d => { serverLogs += d.toString(); });

    try {
        await waitForServer(`${BASE_URL}/`, 10000);
        console.log('  -> PASS: Dev server started and listening');

        // Test 2: GET / dynamic bridge injection & disk immutability
        console.log('[Test 2] GET / HTML response & Dynamic Bridge Injection Check ...');
        const rootRes = await httpGet(`${BASE_URL}/`);
        assert.strictEqual(rootRes.statusCode, 200, 'GET / must return HTTP 200');
        assert(rootRes.body.includes('/__dev/dev-bridge.js'), 
            'Dynamic injection failed: GET / response must contain script tag for /__dev/dev-bridge.js');

        // Check index.html on disk: must remain untouched!
        const diskHtmlAfter = fs.readFileSync(indexHtmlPath, 'utf8');
        assert.strictEqual(diskHtmlBefore, diskHtmlAfter, 
            'Violation: dev/server.js must NOT modify index.html on disk!');
        assert(!diskHtmlAfter.includes('dev-bridge.js'), 
            'Violation: index.html on disk was modified to contain dev-bridge.js');
        console.log('  -> PASS: Dynamic injection verified with zero disk modifications');

        // Test 3: GET /__dev/dev-bridge.js
        console.log('[Test 3] GET /__dev/dev-bridge.js bridge script serving ...');
        const bridgeRes = await httpGet(`${BASE_URL}/__dev/dev-bridge.js`);
        assert.strictEqual(bridgeRes.statusCode, 200, 'GET /__dev/dev-bridge.js must return HTTP 200');
        assert(bridgeRes.body.includes('AndroidBridge'), 
            'dev-bridge.js must define or reference AndroidBridge');
        console.log('  -> PASS: dev-bridge.js served correctly');

        // Test 4: Blocked Host Security (GET /__dev/fetch?url=https://example.com)
        console.log('[Test 4] Domain allowlist enforcement (GET /__dev/fetch?url=https://example.com) ...');
        const blockedRes = await httpGet(`${BASE_URL}/__dev/fetch?url=https://example.com`);
        assert(blockedRes.statusCode === 403 || (blockedRes.statusCode === 200 && blockedRes.body.includes('"ok":false')), 
            `Forbidden host must be rejected with 403 or ok:false, got status: ${blockedRes.statusCode}`);
        console.log('  -> PASS: Non-allowlisted host strictly rejected');

        // Test 5: Live NartoDrama Fetch (GET /__dev/fetch?url=...)
        console.log('[Test 5] Live NartoDrama Proxy (GET /__dev/fetch?url=https://nartodrama.com/featured?page=1&lang=tr-TR) ...');
        const targetUrl = encodeURIComponent('https://nartodrama.com/featured?page=1&lang=tr-TR');
        const liveRes = await httpGet(`${BASE_URL}/__dev/fetch?url=${targetUrl}`);
        assert.strictEqual(liveRes.statusCode, 200, 'Live proxy request must return HTTP 200');
        
        let liveData;
        try {
            liveData = JSON.parse(liveRes.body);
        } catch (e) {
            throw new Error(`Proxy response must be valid JSON: ${liveRes.body.slice(0, 200)}`);
        }

        assert.strictEqual(liveData.ok, true, `Expected ok:true from proxy fetch, got: ${JSON.stringify(liveData)}`);
        assert(liveData.body && liveData.body.length > 100, 'Proxy fetch body must contain live HTML');
        console.log(`  -> Fetched body length: ${liveData.body.length} bytes`);
        console.log('  -> PASS: Live NartoDrama proxy request succeeded');

    } finally {
        console.log('[Cleanup] Terminating dev server process ...');
        serverProcess.kill('SIGTERM');
        // Give it 1 second then force kill if still running
        await new Promise(r => setTimeout(r, 1000));
        try {
            process.kill(serverProcess.pid, 0);
            serverProcess.kill('SIGKILL');
        } catch (e) {
            // Already dead
        }
        console.log('  -> Server terminated cleanly');
    }

    console.log('=== All Dev Server Verification Tests PASSED ===\n');
    return true;
}

if (require.main === module) {
    runDevServerTests().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('DEV SERVER TEST FAILED:', err);
        process.exit(1);
    });
}

module.exports = { runDevServerTests };
