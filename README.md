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
2. **3 Kademeli Akıllı Taşıma (3-Tier Transport)**:
   - **Kademe 1 (Yerel Köprü)**: `AndroidBridge.fetchHtml()` ile WebView CORS engellerine takılmadan `nartodrama.com` üzerindeki HTML/REST verilerini güvenli `HttpsURLConnection` ile çeker.
   - **Kademe 2 (Standart Fetch)**: Test ortamlarında veya tarayıcıda standart `fetch()` ile çalışır.
   - **Kademe 3 (Uygulama İçi Canlı Görünüm)**: Cloudflare veya site yapısı değişikliklerinde, tek dokunuşla NartoDrama canlı sitesine geçer ve üstte sabit `"← DramaPocket'a Dön"` yerel düğmesi sunar.
3. **Dürüst Yayın ve İndirme Politikası**:
   - NartoDrama üçüncü parti video yerleştirmeleri (embed) kullanır ve SSS sayfasında çevrimdışı indirmelerin desteklenmediğini belirtir.
   - DramaPocket kullanıcıyı yanıltmaz: NartoDrama bölümleri için sahte indirme düğmeleri koymak yerine yayın politikasını şeffafça açıklar ve dizileri uygulama içinde veya canlı sitede oynatır.
4. **Yetkili Test İndirmeleri (DownloadManager)**:
   - Android sistem `DownloadManager` ve çevrimdışı video oynatıcı fonksiyonlarını test etmek amacıyla Açık Lisanslı (Creative Commons / Kamu Malı) 2 adet örnek video sunar (`DramaPocket/` klasörüne iner).
5. **Cihazdaki Yerel Videoları Oynatma**:
   - Android Storage Access Framework (SAF) entegrasyonu ile cihazınızda kayıtlı herhangi bir videoyu uygulama içi HTML5 oynatıcıda izleyebilirsiniz.
6. **Favoriler ve İzleme Geçmişi**:
   - Beğendiğiniz dizileri favorilere ekleyin, son izlediğiniz bölümlere kaldığınız yerden devam edin.
7. **Tam Ekran Video ve Donanım Hızlandırma**:
   - `WebChromeClient.onShowCustomView` entegrasyonu ile tam ekran yatay/dikey video oynatımı.
8. **Yerel Geri Tuşu Yönetimi**:
   - Android donanım geri tuşuna basıldığında önce tam ekran kapatılır, ardından açık modallar veya sekmeler kapanır; en son ana sayfada iken uygulamadan çıkılır.

---

## 🏗️ Mimari ve Teknoloji (Architecture)

```
download_series/
├── app/
│   ├── build.gradle                   # Sıfır harici Maven bağımlılığı (dependencies {})
│   ├── proguard-rules.pro             # ProGuard ve JavascriptInterface koruma kuralları
│   └── src/main/
│       ├── AndroidManifest.xml        # Minimal izinler (INTERNET, ACCESS_NETWORK_STATE)
│       ├── java/com/dramapocket/app/
│       │   ├── MainActivity.java      # Güvenli WebViewClient, Fullscreen WebChromeClient
│       │   └── AndroidBridge.java     # fetchHtml, enqueueDownload, getDownloadsStatus
│       ├── res/                       # Temalar, renkler, vektör ikonlar, layout
│       └── assets/www/                # Çevrimdışı hazır HTML5/CSS/JS istemci
│           ├── index.html             # Türkçe UI sekmeleri
│           ├── css/styles.css         # Responsive koyu tema
│           └── js/
│               ├── site-adapter.js    # NartoDrama veri ayrıştırıcı (3-tier)
│               ├── storage.js         # localStorage kalıcılık yöneticisi
│               └── app.js             # UI kontrolcü ve video oynatıcı
├── .github/workflows/
│   └── build-apk.yml                  # Otomatik GitHub Actions APK derleme iş akışı
├── ARCHITECTURE.md                    # Detaylı sistem tasarımı ve güvenlik modeli
├── BUILD.md                           # Yerel ve CI derleme kılavuzu
└── FEASIBILITY.md                     # NartoDrama teknik analiz raporu
```

Detaylı teknik mimari için [ARCHITECTURE.md](ARCHITECTURE.md) dosyasını inceleyebilirsiniz.

---

## 🔒 Güvenlik Standartları (Security Posture)

- **Cleartext Engelleme**: `android:usesCleartextTraffic="false"` (şifresiz HTTP tamamen engellenmiştir).
- **Köprü Köken Kontrolü**: `AndroidBridge`, yalnızca `file:///android_asset/www/` kökeninden gelen çağrıları kabul eder.
- **Sıkı Alan Adı Filtresi**: Ağ istekleri yalnızca `nartodrama.com` ve alt alan adlarına izin verir; harici bağlantılar güvenli harici tarayıcıya yönlendirilir.
- **Sertifika Doğrulama**: SSL hatalarında hiçbir zaman bağlantıya devam edilmez (`handler.cancel()`).
- **Dizin Atlama Koruması**: İndirilen dosyalar temizlenir (`sanitizeFileName`), `../` karakterleri temizlenir ve sadece `.mp4`/`.webm`/`.mkv` uzantılarına izin verilir.

---

## 🚀 APK Derleme ve Kurulum (Build & Install)

### 1. GitHub Actions ile Otomatik Derleme (Önerilen)
1. Bu depoyu GitHub'a yükleyin veya bir pull request açın.
2. **Actions** sekmesinde `Build DramaPocket Android APK` iş akışı otomatik olarak çalışır.
3. Derleme tamamlandığında **`DramaPocket-debug-apk`** adlı ZIP arşivinden `app-debug.apk` dosyasını indirin.

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

## ⚖️ Yasal Uyarı (Legal Disclaimer)

DramaPocket, bağımsız ve açık kaynaklı bir üçüncü parti istemcidir. NartoDrama ile resmi bir bağı veya ortaklığı bulunmamaktadır. Tüm dizi içerikleri, görseller ve ticari markalar hak sahiplerine ve NartoDrama platformuna aittir. DramaPocket, NartoDrama'nın yayın politikalarına ve telif haklarına tam saygı gösterir.
