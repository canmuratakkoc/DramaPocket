# DramaPocket — Build, Testing & Deployment Guide

This guide details how to build, test, sign, and install the DramaPocket Android APK, both locally and through automated CI/CD with GitHub Actions, as well as how to run the zero-dependency local development server.

---

## 1. System Requirements & Toolchain

| Component | Minimum Version | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **Java Development Kit (JDK)** | JDK 17 | JDK 17 (Temurin / OpenJDK) | Required for Gradle 8.5 & Android Gradle Plugin 8.2+ |
| **Android SDK** | `compileSdk 34` | Android SDK Platform 34 | Build Tools 34.0.0+ |
| **Minimum Android OS** | Android 7.0 (API 24) | Android 10+ (API 29+) | Targets Android 14 (API 34) |
| **Gradle** | 8.2 | 8.5 | Zero external Maven dependencies |
| **Node.js** | 18+ | 20+ | Used for dev server and automated test runner |

---

## 2. Rapid Local Development Server (Zero-Dependency)

To develop and test frontend views, styling, Turkish localization, and NartoDrama API integration without waiting for APK compilations:

```bash
# Start local dev server (default port 5500)
node dev/server.js

# Or specify a custom port
node dev/server.js --port 5500
```

Open your browser to:
```
http://localhost:5500
```

### Features of the Dev Server:
- **Zero External Dependencies**: Uses only Node.js built-in modules (`http`, `https`, `url`, `path`, `fs`, `zlib`).
- **Dynamic Bridge Injection**: Serves `/__dev/dev-bridge.js` to simulate `AndroidBridge` without modifying `index.html` on disk.
- **Allowed Domain Proxy**: Proxies requests via `/__dev/fetch?url=...` with automatic decompression and cookie handling while enforcing the NartoDrama domain allowlist (rejects external domains with HTTP 403).
- **Interactive Dev Bar**: Floating toolbar with an Android Back Button trigger and mobile viewport simulator.

For complete documentation, see [DEV.md](DEV.md).

---

## 3. Automated Cloud Builds (GitHub Actions)

The repository includes a ready-to-use, zero-configuration GitHub Actions workflow at [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml).

### How to trigger and retrieve the APK:
1. Push changes to `main`:
   ```bash
   git push origin main
   ```
2. The workflow automatically:
   - Checks out the repository.
   - Provisions JDK 17 (`actions/setup-java@v4`).
   - Configures Gradle 8.5 (`gradle/actions/setup-gradle@v3`).
   - Runs `gradle assembleDebug --stacktrace --no-daemon`.
   - Copies `app-debug.apk` to `DramaPocket-debug.apk`.
   - Validates the resulting binary.
   - Uploads the APK as an artifact named **`DramaPocket-debug-apk`** containing `DramaPocket-debug.apk`.
3. Download the zipped artifact from the GitHub Actions run summary, extract `DramaPocket-debug.apk`, and install it directly on your Android phone or emulator.

---

## 4. Local Build Instructions

### A. Clone and Prepare the Workspace
```bash
git clone https://github.com/canmuratakkoc/DramaPocket.git
cd download_series
```

### B. Building with Gradle Wrapper

**On Linux / macOS:**
```bash
chmod +x ./gradlew
./gradlew assembleDebug
```

**On Windows (PowerShell):**
```powershell
.\gradlew.bat assembleDebug
```

**Using System Gradle (if wrapper JAR is not checked into git):**
```bash
gradle assembleDebug
```

### C. Output APK Location
The compiled debug APK is located at:
```
app/build/outputs/apk/debug/app-debug.apk
(and app/build/outputs/apk/debug/DramaPocket-debug.apk)
```

---

## 5. Automated Verification Tests

DramaPocket includes 8 comprehensive automated test suites covering storage persistence, SiteAdapter contracts, DOM parsing, live E2E extraction, frontend UI, Android Dual-WebView security, playback regression, and the dev server:

```bash
# Run all 8 test suites
node tests/run-all-tests.js
```

### Individual Test Suites:
```bash
# Playback regression & live episode extraction
node tests/test-playback-regression.js

# Dual-WebView & popup security audit
node tests/test-security-android.js

# Zero-dependency local dev server
node tests/test-dev-server.js

# Live E2E against https://nartodrama.com
node tests/test-live-e2e.js

# Storage persistence & deduplication
node tests/test-storage.js
```

---

## 6. Installing on Device or Emulator via ADB

Ensure your Android device has **Developer Options** and **USB Debugging** enabled:

```bash
# Verify device connection
adb devices

# Install APK (replacing existing installation if present)
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch MainActivity
adb shell am start -n com.dramapocket.app/.MainActivity
```

To view live application logs and JavaScript console output:
```bash
adb logcat -s DramaPocket:V Chromium:V
```

---

## 7. Production Release Build & Signing

DramaPocket strictly adheres to secret management standards: **no keystore or password is ever committed to source control**.

### Step 1: Generate a Release Keystore (One-time)
```bash
keytool -genkey -v -keystore dramapocket-release.jks \
  -alias dramapocket -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=DramaPocket, OU=Mobile, O=DramaPocket, C=TR"
```

### Step 2: Configure Environment Variables or `local.properties`
Add signing variables to your environment or create a git-ignored `keystore.properties`:

```properties
RELEASE_STORE_FILE=/path/to/dramapocket-release.jks
RELEASE_STORE_PASSWORD=your_keystore_password
RELEASE_KEY_ALIAS=dramapocket
RELEASE_KEY_PASSWORD=your_key_password
```

### Step 3: Build Signed Release APK
```bash
./gradlew assembleRelease
```
The optimized, ProGuard-shrunk release APK will be generated at:
```
app/build/outputs/apk/release/app-release.apk
```
