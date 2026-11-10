/**
 * DramaPocket - Android Security, Permissions & WebView Configuration Audit
 * Audits AndroidManifest.xml, MainActivity.java, AndroidBridge.java, build.gradle,
 * and .github/workflows/build-apk.yml against strict security guidelines:
 * - Dual-WebView bridge isolation (appWebView vs siteWebView)
 * - In-app popup window management & non-user-gesture popup blocking
 * - Safe URL interception, SSL cancellation, domain allowlisting
 * - Zero hardcoded secrets & minimal manifest permissions
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

    // 2. MainActivity WebView Security Audit & Dual-WebView Bridge Isolation
    console.log('[Test 2] MainActivity.java WebView Hardening & Dual-WebView Bridge Isolation');
    // Never proceed on SSL error
    assert(!mainActivity.includes('handler.proceed()'), 
        'CRITICAL SECURITY FLAW: SSL error handler must NEVER call handler.proceed()!');
    assert(mainActivity.includes('handler.cancel()'), 
        'SSL error handler must explicitly call handler.cancel()');

    // File URL access restrictions
    assert(mainActivity.includes('setAllowFileAccessFromFileURLs(false)') || mainActivity.includes('setAllowFileAccess(false)'), 
        'WebView file access policy must be configured');
    assert(mainActivity.includes('setAllowUniversalAccessFromFileURLs(false)'), 
        'CRITICAL SECURITY: setAllowUniversalAccessFromFileURLs must be explicitly set to false');

    // Dual-WebView Isolation: appWebView vs siteWebView
    assert(mainActivity.includes('webView.addJavascriptInterface'), 
        'Primary appWebView must attach AndroidBridge for local application UI');
    assert(!mainActivity.includes('siteWebView.addJavascriptInterface'), 
        'CRITICAL ISOLATION: siteWebView must NEVER attach any JavascriptInterface!');
    
    // User-Agent sanitization for siteWebView (stripping ; wv)
    assert(mainActivity.includes('replace("; wv", "")') || mainActivity.includes('replace("; wv"'), 
        'siteWebView User-Agent must strip "; wv" to prevent wrapper-guard triggers');
    
    // File access disabled for siteWebView
    assert(mainActivity.includes('siteSettings.setAllowFileAccess(false)'), 
        'siteWebView must strictly disable local file access (setAllowFileAccess(false))');
    console.log('  -> PASS: Dual-WebView bridge isolation and hardening verified');

    // 3. In-App Popup Window Management & Safe Navigation
    console.log('[Test 3] In-App Popup Window Management & Navigation Interception');
    // Non-user-gesture popup blocking in onCreateWindow
    assert(mainActivity.includes('onCreateWindow'), 'MainActivity must implement onCreateWindow');
    assert(mainActivity.includes('!isUserGesture'), 
        'onCreateWindow must explicitly block non-user-gesture popups (!isUserGesture)');
    
    // In-app popup overlay container
    assert(mainActivity.includes('popupContainer') && mainActivity.includes('popupWebView'), 
        'Popup windows must be contained in dismissible in-app overlay (popupContainer / popupWebView)');
    assert(!mainActivity.includes('popupWebView.addJavascriptInterface'), 
        'CRITICAL ISOLATION: popupWebView must NEVER attach JavascriptInterface');
    
    // Safe subframe navigation (never auto-redirecting subframes or unknown links to external Chrome)
    assert(mainActivity.includes('isForMainFrame') || mainActivity.includes('!request.isForMainFrame()'), 
        'WebViewClient must differentiate main-frame from sub-frame navigations');
    console.log('  -> PASS: In-app popup management and safe navigation verified');

    // 4. AndroidBridge Security & Expanded Domain Allowlist Audit
    console.log('[Test 4] AndroidBridge.java Security & Domain Allowlist (nartodrama.com, narto-drama.com, nartodrama-api.online)');
    assert(bridge.includes('fetchHtml'), 'AndroidBridge must implement fetchHtml');
    assert(bridge.includes('nartodrama.com'), 'Allowlist must include nartodrama.com');
    assert(bridge.includes('narto-drama.com'), 'Allowlist must include narto-drama.com');
    assert(bridge.includes('nartodrama-api.online'), 'Allowlist must include nartodrama-api.online');
    
    // UI-thread safe URL check in isCallerAllowed
    assert(bridge.includes('isCallerAllowed'), 'Bridge must verify caller origin in isCallerAllowed');
    assert(bridge.includes('getCurrentWebViewUrl'), 
        'isCallerAllowed must use UI-thread synced getCurrentWebViewUrl() to avoid JavaBridge thread crashes');

    // Check external browser intent validation
    assert(bridge.includes('openExternalUrl') || bridge.includes('openInExternalBrowser'), 
        'AndroidBridge must expose safe external browser navigation');
    console.log('  -> PASS: AndroidBridge domain validation and thread-safe security controls verified');

    // 5. Zero Hardcoded Secrets Audit
    console.log('[Test 5] Hardcoded Secrets Scan');
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

    // 6. GitHub Actions Workflow Configuration
    console.log('[Test 6] GitHub Actions CI Workflow Structure');
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
