# DramaPocket 🎬📱

> **Hafif, Güvenli ve Sıfır Bağımlılıklı Android NartoDrama İstemcisi**  
> *A lightweight, secure, zero-dependency Android Java WebView application for [NartoDrama](https://nartodrama.com).*

---

## 🌟 Projeye Genel Bakış (Overview)

**DramaPocket**, Kore, Japon, Çin ve diğer Asya dramalarını NartoDrama üzerinden kolayca aramak, keşfetmek ve izlemek üzere geliştirilmiş, Türkçe arayüze sahip modern ve minimalist bir Android uygulamasıdır.

Uygulama, yüzlerce megabaytlık üçüncü parti kütüphaneler yerine doğrudan saf **Android Java Platformu (SDK 34)** bileşenlerini kullanır. Böylece derlenmiş APK boyutu **1 MB'ın altındadır**, anında açılır ve sıfır dış bağımlılık sayesinde maksimum güvenlik sunar.

---

## ✨ Temel Özellikler (Key Features)

1. **Canlı NartoDrama Kataloğu ve Arama**:
   - NartoDrama üzerindeki popüler, yeni eklenen ve güncel dizileri dinamik olarak listeler.
   - Gerçek zamanlı dizi arama desteği (`?s=...`).
2. **Çift WebView Mimarisi ve %100 Köprü İzolasyonu (Dual-WebView)**:
   - **`appWebView`**: Yalnızca yerel `file:///android_asset/www/index.html` dosyasını çalıştırır ve `AndroidBridge` köprüsüne sahiptir. Harici web sitelerine asla yönlendirilmez.
   - **`siteWebView`**: NartoDrama canlı yayınlarını ve video oynatıcısını yönetir. **Sıfır JavascriptInterface** (`addJavascriptInterface` çağrılmaz) ile tam güvenlik izolasyonu sağlar. User-Agent başlığından `; wv` ve `Version/4.0` kaldırılarak wrapper-guard (`ND-WG-PROBE`) ve `/open-in-browser` tetiklemeleri önlenir.
3. **Uygulama İçi Reklam Kapısı ve Açılır Pencere Yönetimi (Popup Overlay)**:
   - `onCreateWindow` ile kullanıcı etkileşimi olmayan açılır pencereler (`!isUserGesture`) engellenir.
   - NartoDrama'nın `"İzlemeden önce reklam"` (6 reklam etkileşimi) kapısı için açılan pencereler, harici Chrome'a gitmeden uygulama içi kapatılabilir bir katmanda (`popupContainer`) açılır ve üçüncü parti çerez desteği sayesinde video kilidini sorunsuz açar.
4. **Dayanıklı Dizi Listesi ve Doğrudan Akış Ayrıştırma**:
   - $O(N)$ derinlik takipli parantez dengeleyici (`extractBalancedJsonArray`) ile 285 bölümlük 350+ KB boyutundaki `episodeItemsRaw` dizisi eksiksiz okunur.
   - Doğrudan CDN akışları (`directPlayUrl` / `playUrl`) yerel HTML5 `<video>` oynatıcıda kesintisiz oynatılır; akış hatası durumunda tek tıkla uygulama içi web görünümüne geçiş sağlanır.
5. **Dürüst Yayın ve İndirme Politikası**:
   - NartoDrama üçüncü parti video yerleştirmeleri (embed) kullanır ve SSS sayfasında çevrimdışı indirmelerin desteklenmediğini belirtir.
   - DramaPocket kullanıcıyı yanıltmaz: NartoDrama bölümleri için sahte indirme düğmeleri koymak yerine yayın politikasını şeffafça açıklar ve dizileri uygulama içinde oynatır.
6. **Yetkili Test İndirmeleri (DownloadManager)**:
   - Android sistem `DownloadManager` ve çevrimdışı video oynatıcı fonksiyonlarını test etmek amacıyla Açık Lisanslı (Creative Commons / Kamu Malı) örnek videolar sunar (`DramaPocket/` klasörüne iner).
7. **Cihazdaki Yerel Videoları Oynatma**:
   - Android Storage Access Framework (SAF) entegrasyonu ile cihazınızda kayıtlı herhangi bir videoyu uygulama içi HTML5 oynatıcıda izleyebilirsiniz.
8. **Favoriler ve İzleme Geçmişi**:
   - Beğendiğiniz dizileri favorilere ekleyin, son izlediğiniz bölümlere kaldığınız yerden devam edin.
9. **Tam Ekran Video ve Donanım Hızlandırma**:
   - `WebChromeClient.onShowCustomView` entegrasyonu ile tam ekran yatay/dikey video oynatımı.
10. **4 Kademeli Yerel Geri Tuşu Hiyerarşisi**:
    - 1. Tam ekran video açıkken -> tam ekrandan çıkar.
    - 2. Uygulama içi popup açıkken -> popup katmanını kapatır (`closePopup()`).
    - 3. Canlı site modunda iken -> canlı site geçmişinde geri gider veya canlı site modundan çıkar.
    - 4. Yerel uygulama açıkken -> açık modalları kapatır veya ana sayfaya döner.
11. **Sıfır Bağımlılıklı Yerel Geliştirme Sunucusu (`dev/server.js`)**:
    - Harici npm veya Docker bağımlılığı olmadan, tek komutla (`npm run dev` veya `node dev/server.js`) çalışan yerel geliştirme sunucusu.
    - Canlı site proxy'si (`/__dev/fetch`), dinamik köprü enjeksiyonu (`/__dev/dev-bridge.js`) ve Dev Bar paneli sunar.

---

## 🏗️ Mimari ve Dizin Yapısı (Architecture)

```
download_series/
├── app/
│   ├── build.gradle                   # Sıfır harici Maven bağımlılığı (dependencies {})
│   ├── proguard-rules.pro             # ProGuard ve JavascriptInterface koruma kuralları
│   └── src/main/
│       ├── AndroidManifest.xml        # Minimal izinler (INTERNET, ACCESS_NETWORK_STATE)
│       ├── java/com/dramapocket/app/
│       │   ├── MainActivity.java      # Dual-WebView, Popup Manager, Fullscreen WebChromeClient
│       │   └── AndroidBridge.java     # fetchHtml, openSiteWebView, enqueueDownload
│       ├── res/                       # Temalar, layout (activity_main.xml), stringler
│       └── assets/www/                # Çevrimdışı hazır Türkçe HTML5/CSS/JS istemci
│           ├── index.html             # Türkçe UI sekmeleri ve player modal
│           ├── css/styles.css         # Responsive koyu tema
│           └── js/
│               ├── site-adapter.js    # NartoDrama veri ayrıştırıcı (balanced JSON)
│               ├── storage.js         # localStorage kalıcılık yöneticisi
│               └── app.js             # UI kontrolcü ve akış oynatıcı
├── dev/
│   ├── server.js                      # Sıfır bağımlılıklı Node.js geliştirme sunucusu
│   └── dev-bridge.js                  # Tarayıcı için AndroidBridge simülatörü & Dev Bar
├── tests/                             # 8 Kapsamlı Otomasyonel Test Paketi
│   ├── run-all-tests.js               # Ana test çalıştırıcı (8/8 PASSED)
│   ├── test-playback-regression.js    # Akış seçimi & canlı bölüm ayrıştırma testi
│   ├── test-dev-server.js             # Geliştirme sunucusu & dinamik enjeksiyon testi
│   ├── test-security-android.js       # Güvenlik, izinler ve Dual-WebView denetimi
│   ├── test-live-e2e.js               # nartodrama.com canlı ağ testleri
│   ├── test-live-dom-parsing.js       # Sentetik ve gerçek DOM ayrıştırma testleri
│   ├── test-frontend-ui.js            # Türkçe UI & geri tuşu testi
│   ├── test-site-adapter.js           # Kontrat & fallback testleri
│   └── test-storage.js                # Depolama & bozuk veri dayanıklılık testi
├── .github/workflows/
│   └── build-apk.yml                  # Otomatik GitHub Actions APK derleme iş akışı
├── ARCHITECTURE.md                    # Detaylı sistem tasarımı ve güvenlik modeli
├── BUILD.md                           # Yerel ve CI derleme kılavuzu
├── DEV.md                             # Yerel geliştirme ortamı kılavuzu
├── FEASIBILITY.md                     # NartoDrama teknik analiz & oynatma fizibilitesi
└── TEST_REPORT.md                     # Kapsamlı QA doğrulama ve test raporu
```

Detaylı teknik mimari için [ARCHITECTURE.md](ARCHITECTURE.md) dosyasını inceleyebilirsiniz.

---

## 🔒 Güvenlik Standartları (Security Posture)

- **Cleartext Engelleme**: `android:usesCleartextTraffic="false"` (şifresiz HTTP tamamen engellenmiştir).
- **Çift WebView İzolasyonu**: `AndroidBridge` yalnızca yerel `appWebView` (`file:///android_asset/www/`) üzerine eklenir; harici içerik gösteren `siteWebView` ve `popupWebView` üzerine kesinlikle eklenmez.
- **Sıkı Alan Adı Filtresi**: Ağ istekleri ve canlı görünümler yalnızca `nartodrama.com`, `narto-drama.com`, `nartodrama-api.online` ve alt alan adlarına izin verir; harici bağlantılar kullanıcı onayı olmaksızın açılmaz.
- **Sertifika Doğrulama**: SSL hatalarında hiçbir zaman bağlantıya devam edilmez (`handler.cancel()`).
- **Dizin Atlama Koruması**: İndirilen dosyalar temizlenir (`sanitizeFileName`), `../` karakterleri temizlenir ve sadece `.mp4`/`.webm`/`.mkv` uzantılarına izin verilir.
- **Sıfır Gizli Anahtar**: Kod tabanında hiçbir API anahtarı, parola veya token bulunmaz.

---

## 🚀 Yerel Geliştirme (Local Development)

Uygulama arayüzünü ve NartoDrama veri akışlarını test etmek için her seferinde APK derlemenize gerek yoktur:

```bash
# Geliştirme sunucusunu başlatın (port 5500)
node dev/server.js

# Tarayıcınızda açın
http://localhost:5500
```
Chrome DevTools Cihaz Araç Çubuğu (`Ctrl+Shift+M`) ile mobil boyutlarda test edebilir, sağ alttaki **Dev Bar** üzerinden Android geri tuşunu ve bridge fonksiyonlarını simüle edebilirsiniz. Ayrıntılar için [DEV.md](DEV.md) dosyasına bakınız.

---

## 📦 APK Derleme ve Kurulum (Build & Install)

### 1. GitHub Actions ile Otomatik Derleme (Önerilen)
1. Bu depoyu GitHub'a yükleyin veya `main` dalına push yapın.
2. **Actions** sekmesinde `Build DramaPocket Android APK` iş akışı otomatik olarak çalışır.
3. Derleme tamamlandığında **`DramaPocket-debug-apk`** adlı ZIP arşivinden `DramaPocket-debug.apk` dosyasını indirin.

### 2. Yerel Olarak Derleme (Android Studio veya Gradle)
Gereksinimler: JDK 17 ve Android SDK 34.
```bash
# Windows
.\gradlew.bat assembleDebug

# Linux / macOS
./gradlew assembleDebug
```
Derlenen APK dosya konumu: `app/build/outputs/apk/debug/app-debug.apk`

Detaylı yerel derleme ve imzalama yönergeleri için [BUILD.md](BUILD.md) dosyasına göz atın.

---

## 🧪 Testleri Çalıştırma (Automated Testing)

Tüm birim, entegrasyon, canlı ağ ve güvenlik testlerini tek komutla çalıştırabilirsiniz:

```bash
node tests/run-all-tests.js
```

**Sonuç: 8/8 Test Paketi Başarılı (109 Doğrulama)**

---

## ⚖️ Yasal Uyarı (Legal Disclaimer)

DramaPocket, bağımsız ve açık kaynaklı bir üçüncü parti istemcidir. NartoDrama ile resmi bir bağı veya ortaklığı bulunmamaktadır. Tüm dizi içerikleri, görseller ve ticari markalar hak sahiplerine ve NartoDrama platformuna aittir. DramaPocket, NartoDrama'nın yayın politikalarına ve telif haklarına tam saygı gösterir.
