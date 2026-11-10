/**
 * DramaPocket - Android Security, Permissions & WebView Configuration Audit
 * Audits AndroidManifest.xml, MainActivity.java, AndroidBridge.java, build.gradle,
 * and .github/workflows/build-apk.yml against strict security guidelines.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runSecurityAudit() {
    console.log('=== Running Android Security & Architecture Audit ===');
    const rootDir = path.resolve(__dirname, '..');
    const manifestPath = path.join(rootDir, 'app/src/main/AndroidManifest.xml');
    const mainActivityPath = path.join(rootDir, 'app/src/main/java/com/dramapocket/app/MainActivity.java');
    const bridgePath = path.join(rootDir, 'app/src/main/java/com/dramapocket/app/AndroidBridge.java');
    const buildGradlePath = path.join(rootDir, 'app/build.gradle');
    const workflowPath = path.join(rootDir, '.github/workflows/build-apk.yml');

    assert(fs.existsSync(manifestPath), `AndroidManifest.xml must exist at ${manifestPath}`);
    assert(fs.existsSync(mainActivityPath), `MainActivity.java must exist at ${mainActivityPath}`);
    assert(fs.existsSync(bridgePath), `AndroidBridge.java must exist at ${bridgePath}`);
    assert(fs.existsSync(buildGradlePath), `app/build.gradle must exist at ${buildGradlePath}`);
    assert(fs.existsSync(workflowPath), `.github/workflows/build-apk.yml must exist at ${workflowPath}`);

    const manifest = fs.readFileSync(manifestPath, 'utf8');
    const mainActivity = fs.readFileSync(mainActivityPath, 'utf8');
    const bridge = fs.readFileSync(bridgePath, 'utf8');
    const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    // 1. AndroidManifest.xml Audit
    console.log('[Test 1] AndroidManifest.xml Security & Permissions Audit');
    // Cleartext traffic check: must NOT be true
    assert(!manifest.includes('android:usesCleartextTraffic="true"'), 
        'Security flaw: android:usesCleartextTraffic must NOT be set to true!');
    
    // Minimal permissions check
    const dangerousPermissions = [
        'android.permission.RECORD_AUDIO',
        'android.permission.CAMERA',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.READ_CONTACTS',
        'android.permission.SEND_SMS',
        'android.permission.READ_SMS'
    ];
    for (const perm of dangerousPermissions) {
        assert(!manifest.includes(perm), `Excessive permission found in manifest: ${perm}`);
    }
    assert(manifest.includes('android.permission.INTERNET'), 'INTERNET permission required');
    console.log('  -> PASS: AndroidManifest.xml permissions and cleartext traffic policy verified');

    // 2. MainActivity WebView Security Audit
    console.log('[Test 2] MainActivity.java WebView Hardening');
    // Never proceed on SSL error
    assert(!mainActivity.includes('handler.proceed()'), 
        'CRITICAL SECURITY FLAW: SSL error handler must NEVER call handler.proceed()!');
    assert(mainActivity.includes('handler.cancel()'), 
        'SSL error handler must explicitly call handler.cancel()');

    // File URL access restrictions
    assert(mainActivity.includes('setAllowFileAccessFromFileURLs(false)') || mainActivity.includes('setAllowFileAccess(false)') || mainActivity.includes('setAllowFileAccess'), 
        'WebView file access policy must be configured');
    assert(mainActivity.includes('setAllowUniversalAccessFromFileURLs(false)'), 
        'CRITICAL SECURITY: setAllowUniversalAccessFromFileURLs must be explicitly set to false');
    console.log('  -> PASS: WebView SSL and local file access controls verified');

    // 3. AndroidBridge Security Audit
    console.log('[Test 3] AndroidBridge.java Security & Domain Allowlist');
    // Domain allowlist check in fetchHtml
    assert(bridge.includes('fetchHtml'), 'AndroidBridge must implement fetchHtml');
    assert(bridge.includes('nartodrama.com'), 
        'fetchHtml MUST validate URLs against an allowlist containing nartodrama.com');
    
    // Check that arbitrary non-HTTP or file protocols are rejected
    const hasProtocolOrDomainCheck = bridge.includes('.getHost()') || 
                                     bridge.includes('.contains("nartodrama.com")') ||
                                     bridge.includes('startsWith("https://') ||
                                     bridge.includes('URI.create') ||
                                     bridge.includes('new URL(');
    assert(hasProtocolOrDomainCheck, 'Bridge must parse and validate target URL origin/scheme');

    // Check external browser intent validation
    assert(bridge.includes('openInExternalBrowser') || bridge.includes('openExternalUrl'), 
        'AndroidBridge must expose safe external browser navigation');
    console.log('  -> PASS: AndroidBridge domain validation and security controls verified');

    // 4. Zero Hardcoded Secrets Audit
    console.log('[Test 4] Hardcoded Secrets Scan');
    const sensitivePatterns = [
        /AIzaSy[0-9A-Za-z-_]{33}/, // Google API key
        /AKIA[0-9A-Z]{16}/,        // AWS Access Key
        /ghp_[0-9A-Za-z]{36}/,     // GitHub Personal Access Token
        /["']password["']\s*:\s*["'][^"']+["']/i,
        /["']secret["']\s*:\s*["'][^"']+["']/i
    ];
    
    const filesToScan = [manifest, mainActivity, bridge, buildGradle, workflow];
    for (const fileContent of filesToScan) {
        for (const pattern of sensitivePatterns) {
            assert(!pattern.test(fileContent), `Potential secret pattern detected: ${pattern}`);
        }
    }
    console.log('  -> PASS: Zero hardcoded secrets confirmed');

    // 5. GitHub Actions Workflow Configuration
    console.log('[Test 5] GitHub Actions CI Workflow Structure');
    assert(workflow.includes('actions/checkout'), 'CI workflow must use actions/checkout');
    assert(workflow.includes('actions/setup-java'), 'CI workflow must configure Java');
    assert(workflow.includes('actions/upload-artifact'), 'CI workflow must upload APK artifact');
    assert(workflow.includes('assembleDebug') || workflow.includes('build'), 'CI workflow must build debug APK');
    console.log('  -> PASS: GitHub Actions CI workflow verified');

    console.log('=== All Android Security & Architecture Tests PASSED ===\n');
    return true;
}

if (require.main === module) {
    try {
        runSecurityAudit();
    } catch (err) {
        console.error('SECURITY AUDIT FAILED:', err.message);
        process.exit(1);
    }
}

module.exports = { runSecurityAudit };
