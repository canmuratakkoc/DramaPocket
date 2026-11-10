# DramaPocket — Build & Deployment Guide

This guide details how to build, test, sign, and install the DramaPocket Android APK, both locally and through automated CI/CD with GitHub Actions.

---

## 1. System Requirements & Toolchain

| Component | Minimum Version | Recommended | Notes |
| :--- | :--- | :--- | :--- |
| **Java Development Kit (JDK)** | JDK 17 | JDK 17 (Temurin / OpenJDK) | Required for Gradle 8.5 & Android Gradle Plugin 8.2+ |
| **Android SDK** | `compileSdk 34` | Android SDK Platform 34 | Build Tools 34.0.0+ |
| **Minimum Android OS** | Android 7.0 (API 24) | Android 10+ (API 29+) | Targets Android 14 (API 34) |
| **Gradle** | 8.2 | 8.5 | Zero external Maven dependencies |
| **Node.js** | 18+ | 20+ | Used for running frontend unit/integration test suite |

---

## 2. Automated Cloud Builds (GitHub Actions)

The repository includes a ready-to-use, zero-configuration GitHub Actions workflow at [`.github/workflows/build-apk.yml`](.github/workflows/build-apk.yml).

### How to trigger and retrieve the APK:
1. Push code to the `main` branch, or trigger manually from the GitHub **Actions** tab via `workflow_dispatch`.
2. The workflow automatically:
   - Checks out the repository.
   - Provisions JDK 17 (`actions/setup-java@v4`).
   - Configures Gradle 8.5 (`gradle/actions/setup-gradle@v3`).
   - Generates the wrapper jar if missing and executes `./gradlew assembleDebug`.
   - Validates the resulting `app-debug.apk`.
   - Uploads the APK as an artifact named **`DramaPocket-debug-apk`**.
3. Download the zipped artifact from the GitHub Actions run summary, extract `app-debug.apk`, and install it directly on your Android phone or emulator.

---

## 3. Local Build Instructions

### A. Clone and Prepare the Workspace
```bash
git clone <repository-url>
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
```

---

## 4. Installing on Device or Emulator via ADB

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

## 5. Production Release Build & Signing

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

### Step 3: Configure Release Signing in `app/build.gradle` (Optional snippet)
```groovy
android {
    signingConfigs {
        release {
            if (System.getenv("RELEASE_STORE_FILE") != null) {
                storeFile file(System.getenv("RELEASE_STORE_FILE"))
                storePassword System.getenv("RELEASE_STORE_PASSWORD")
                keyAlias System.getenv("RELEASE_KEY_ALIAS")
                keyPassword System.getenv("RELEASE_KEY_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            signingConfig signingConfigs.release
        }
    }
}
```

### Step 4: Build Signed Release APK
```bash
./gradlew assembleRelease
```
The optimized, ProGuard-shrunk release APK will be generated at:
```
app/build/outputs/apk/release/app-release.apk
```

---

## 6. Local Host Environment Status

During development on this Windows host:
- **Node.js**: Installed at `C:\Program Files\nodejs\node.exe` (used for running automated JavaScript and contract tests).
- **Android Platform Tools (ADB)**: Present at `C:\Users\galli\AppData\Local\Android\Sdk\platform-tools\adb.exe`.
- **JDK / Gradle**: Not pre-configured in Windows global PATH. Therefore, builds can be triggered directly in **Android Studio** (which bundles JDK 17) or via the automated **GitHub Actions CI/CD workflow** (`.github/workflows/build-apk.yml`).
