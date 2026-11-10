# DramaPocket — Sıfır Bağımlılıklı Yerel Geliştirme Ortamı (DEV.md)

DramaPocket Android WebView Asya dizileri uygulamasının ön yüzünü (HTML5/CSS3/ES6) her kod değişikliğinde yeni bir APK üretmeye gerek kalmadan doğrudan masaüstü tarayıcınızda (Google Chrome, Microsoft Edge, Firefox vb.) canlı NartoDrama verisiyle test etmek ve geliştirmek için sıfır bağımlılıklı (`zero-dependency`) yerel geliştirme sunucusu hazırlanmıştır.

---

## 1. Mimari ve Temel Özellikler

1. **Sıfır Harici Bağımlılık (Zero npm Dependencies)**:
   - `npm install` gerektirmez.
   - Docker veya harici web sunucuları (Nginx/Apache) gerektirmez.
   - Yalnızca Node.js standart yerleşik modüllerini (`http`, `https`, `fs`, `path`, `url`) kullanır.
2. **Üretim Varlıklarının Korunması (Clean Production Assets)**:
   - `app/src/main/assets/www/` dizinindeki kaynak dosyalar disk üzerinde **asla değiştirilmez**.
   - `index.html` istendiğinde, `dev/server.js` çalışma zamanında HTTP yanıt gövdesine `<script src="/__dev/dev-bridge.js"></script>` etiketini `js/storage.js`'den hemen önce dinamik olarak enjekte eder.
3. **Güvenli NartoDrama Canlı Proxy (`/__dev/fetch?url=...`)**:
   - Tarayıcının Same-Origin Policy / CORS kısıtlamalarını devre dışı bırakmadan canlı NartoDrama verisi (`/featured`, `/search`, `/detail/watch/...`) çekilmesini sağlar.
   - Yalnızca izinli alan adlarına (`nartodrama.com`, `*.nartodrama.com`, `narto-drama.com`, `*.narto-drama.com`, `nartodrama-api.online`, `*.nartodrama-api.online`) ve yalnızca `HTTPS` protokolüne izin verir. Diğer tüm istekler HTTP 403 Forbidden ile engellenir.
   - Android WebView `CookieManager` davranışını simüle eden bellek içi `nd_ck` ve `Set-Cookie` kavanozuna (Cookie Jar) sahiptir.
4. **Masaüstü `AndroidBridge` Simülatörü (`dev/dev-bridge.js`)**:
   - Yalnızca `window.AndroidBridge` tanımlı olmadığında devreye girer (gerçek Android cihazında asla çalışmaz).
   - Java `@JavascriptInterface public String fetchHtml(String url)` metodunun senkron (`synchronous`) dönüş kontratını `XMLHttpRequest` ile birebir sağlar.
   - Android `DownloadManager` indirme döngüsünü (`PENDING` -> `RUNNING` -> `SUCCESSFUL`) `localStorage` üzerinde simüle eder.
   - Android Geri Tuşu (`window.handleAndroidBack()`) ve Mobil Boyut simülasyonunu tek tıkla test etmenizi sağlayan sağ alt köşede katlanabilir **Dev Paneli** sunar.

---

## 2. Hızlı Başlangıç (Windows)

### Adım 1: Yerel Geliştirme Sunucusunu Başlatın
PowerShell veya CMD terminalinde proje kök dizininde (`e:\download_series`) şu komutu çalıştırın:

```powershell
node dev/server.js
```

Varsayılan olarak `5500` portunda başlar. Farklı bir port kullanmak isterseniz:
```powershell
$env:PORT="5555"; node dev/server.js
```

Terminalde aşağıdaki karşılama ekranını göreceksiniz:
```text
================================================================
      DramaPocket Zero-Dependency Development Server
================================================================
  Local URL      : http://localhost:5500/
  Network URL    : http://0.0.0.0:5500/
  Static Root    : .../app/src/main/assets/www
  Dev Bridge     : http://localhost:5500/__dev/dev-bridge.js
  Status API     : http://localhost:5500/__dev/status
  Secure Proxy   : http://localhost:5500/__dev/fetch?url=...
----------------------------------------------------------------
  Mode           : Zero npm dependencies (Node.js built-ins)
  Injection      : Dynamic in-memory dev-bridge.js (assets clean)
  CORS Policy    : Bypass via server proxy with NartoDrama jar
================================================================
  Press Ctrl+C to stop the development server.
```

---

### Adım 2: Tarayıcıda Açın ve Mobil Cihaz Görünümünü Aktif Edin
1. Google Chrome veya Microsoft Edge açın.
2. Adres çubuğuna gidin:
   ```text
   http://localhost:5500/
   ```
3. Geliştirici Araçlarını açın:
   - `F12` veya `Ctrl + Shift + I` tuşlarına basın.
4. Cihaz Araç Çubuğunu (Device Toolbar / Mobile Emulation) aktif edin:
   - `Ctrl + Shift + M` tuşlarına basın.
   - Üst kısımdaki cihaz listesinden **Samsung Galaxy S20 Ultra**, **Pixel 7** veya **iPhone 14 Pro** seçin ya da `412 x 915` piksel boyutuna ayarlayın.
5. Sayfayı yenileyin (`F5` veya `Ctrl + F5`).

> **İpucu:** Sağ altta yer alan mavi renkli **`🛠 Dev Panel`** butonuna tıklayarak **`Mobil Boyut (412px)`** seçeneğini açıp DevTools açmadan da telefon genişliğini simüle edebilirsiniz!

---

## 3. Geliştirme Döngüsü (Edit & Instant Refresh)

1. `app/src/main/assets/www/` altındaki dosyaları favori kod düzenleyicinizde (VS Code, Cursor vb.) düzenleyin:
   - Görsel arayüz & yerleşim: `app/src/main/assets/www/index.html`
   - Stiller & animasyonlar: `app/src/main/assets/www/css/styles.css`
   - Uygulama durumu, sekmeler, oynatıcı mantığı: `app/src/main/assets/www/js/app.js`
   - NartoDrama veri ayrıştırıcı & ağ katmanı: `app/src/main/assets/www/js/site-adapter.js`
   - Yerel depolama & favoriler: `app/src/main/assets/www/js/storage.js`
2. Tarayıcıda `F5` tuşuna basın.
3. Sunucu tüm dosyalara `Cache-Control: no-store, no-cache, must-revalidate` başlıkları eklediğinden değişiklikler anında ekrana yansır.

---

## 4. `window.AndroidBridge` Masaüstü Simülatörü Yetenekleri

Geliştirici köprüsü (`dev/dev-bridge.js`), gerçek Android uygulamasındaki Java köprüsü ile birebir aynı metotları sağlar:

| Metot | Masaüstü Geliştirme Davranışı |
|---|---|
| `fetchHtml(url)` | Senkron `XMLHttpRequest` ile yerel proxy (`/__dev/fetch`) üzerinden NartoDrama'ya bağlanır. Cookie jar'ı günceller ve JSON döner. |
| `enqueueDownload(url, title, fileName)` | İndirmeyi `localStorage`'a yazar. Otomatik arka plan sayacıyla indirme yüzdesini her saniye %25 artırarak `RUNNING` -> `SUCCESSFUL` geçişini simüle eder. |
| `getDownloadsStatus()` | `localStorage`'daki simüle edilmiş indirme kayıtlarını gerçek `DownloadManager` JSON formatında döndürür. |
| `cancelDownload(downloadId)` | Simüle edilen indirmeyi listeden ve depolamadan kaldırır. |
| `openSiteWebView(url)` | Tarayıcı içinde üstte **`← DramaPocket'a Dön (Dev Simülasyonu)`** barı olan tam ekran canlı site önizleme katmanını açar. |
| `returnToApp()` | Canlı site önizleme katmanını kapatır ve ana uygulamaya döner. |
| `openExternalUrl(url)` | Güvenli `HTTPS` bağlantısını yeni bir tarayıcı sekmesinde (`window.open`) açar. |
| `pickLocalVideo()` | Sayfadaki gizli `#local-video-file-input` elemanını tetikleyerek işletim sistemi dosya seçicisinden yerel `.mp4` / `.webm` seçilmesini ve dahili video oynatıcıda anında oynatılmasını sağlar. |
| `getAppInfo()` | `{"versionName":"1.0.0-dev","versionCode":1,"sdkInt":34,"platform":"android-dev-simulator"}` döner. |

---

## 5. Donanım Geri Tuşu Simülasyonu (`window.handleAndroidBack`)

Fiziksel Android geri tuşuna basıldığında uygulamanın davranışı hiyerarşik olarak test edilebilir:
1. Video oynatıcı açıksa -> Oynatıcıyı kapatır (`true`).
2. Dizi detay kartı açıksa -> Detay kartını kapatır (`true`).
3. İkincil bir sekmedeyse (Arama, İndirmeler, Kütüphane) -> Ana Sayfaya döner (`true`).
4. Ana sayfadaysa -> Uygulamadan çıkış için `false` döner.

**Masaüstünde Test Etme Yolları:**
- **Yol 1:** Ekranın sağ altındaki **`🛠 Dev Panel`**'i açıp **`◀ Android Geri Tuşu`** butonuna tıklayın.
- **Yol 2:** Tarayıcı konsolunda (`F12 -> Console`):
  ```javascript
  window.handleAndroidBack();
  ```

---

## 6. Uç Noktalar ve Durum Denetimi (Health Check)

Sunucunun durumunu ve proxy yapılandırmasını doğrulamak için şu uç noktaları ziyaret edebilirsiniz:

- **Ana Uygulama:** `http://localhost:5500/`
- **Sunucu Durumu (JSON):** `http://localhost:5500/__dev/status`
  ```json
  {
    "status": "running",
    "port": 5500,
    "root": "app/src/main/assets/www",
    "uptime": 120,
    "proxyAllowlist": ["nartodrama.com", "narto-drama.com", "nartodrama-api.online"],
    "cookiesStored": 2
  }
  ```
- **Köprü Betiği:** `http://localhost:5500/__dev/dev-bridge.js`
- **Proxy Testi:** `http://localhost:5500/__dev/fetch?url=https%3A%2F%2Fnartodrama.com%2Ffeatured%3Fpage%3D1%26lang%3Dtr-TR`

---

## 7. Otomatik Doğrulama Testi

Sunucunun tüm işlevlerini ve güvenlik kontrollerini otomatik olarak test etmek için:

```powershell
node tests/test-dev-server.js
```

Bu test şunları onaylar:
1. Sunucunun programatik olarak ayağa kalkması ve yanıt vermesi.
2. `index.html` dosyasının disk üzerinde hiç bozulmadan çalışma zamanında dinamik olarak enjekte edilmesi.
3. İzin verilmeyen harici alan adlarının (`evil.com`) HTTP 403 ile engellenmesi.
4. Canlı NartoDrama proxy isteğinin başarıyla tamamlanıp canlı HTML gövdesi döndürmesi.
5. Sunucunun temiz bir şekilde kapatılması.
