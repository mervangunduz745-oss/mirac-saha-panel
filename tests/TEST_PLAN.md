# Miraç ERP Masaüstü ve Mobil QA Planı

## Test İlkeleri

- Canlı veri kullanılmaz ve değiştirilmez.
- Bulut testleri ayrı Firebase test projesinde veya Emulator Suite üzerinde yapılır.
- Her koşu öncesi izole test organizasyonu açılır: `orgId = qa-YYYYMMDD-HHMM`.
- Kayıt adları `QA-` ile başlar. Test bitiminde yalnızca test organizasyonu yönetici tarafından kaldırılır.
- Cihaz A ve B ayrı tarayıcı profili/telefon olmalı; aynı `localStorage` paylaşılmamalı.
- Eşzamanlı senaryolarda iki cihaz da aynı başlangıç verisini gördükten sonra ağ isteği birlikte serbest bırakılır.

## Yayın Kapıları

`P0` senaryolardan biri başarısızsa bulut yayını yapılmaz. Özellikle veri kaybı, çift ödeme, ID çakışması, tek-belge mimarisi, yetkisiz erişim ve kurallarla adaptör alanlarının uyuşmaması kesin engeldir.

## Masaüstü ve Mobil

| ID | Öncelik | Senaryo | Uygulama | Beklenen |
|---|---|---|---|---|
| UI-01 | P0 | Masaüstü temel açılış | Chrome ve Edge, 1366x768/1920x1080; login ve tüm menüleri aç | Taşma/örtüşme yok; ana işlemler erişilebilir |
| UI-02 | P0 | Telefon portre | 360x800 ve 390x844; login, menü, formlar, tablolar | Metin/buton taşmaz; yatay tablo kontrollü kayar |
| UI-03 | P1 | Telefon yatay/tablet | 844x390 ve 768x1024 | Menü ve form alanları kullanılabilir kalır |
| UI-04 | P1 | Klavye ve odak | Sadece Tab/Shift+Tab/Enter ile login ve kayıt formu | Odak görünür ve sırası mantıklı; işlem tetiklenir |
| UI-05 | P1 | Uzun Türkçe veri | Uzun cari, ürün ve not gir | Kart/tablo düzeni bozulmaz; veri kesilmeden görülebilir |
| UI-06 | P1 | Yakınlaştırma | Mobil %200, masaüstü %200 | Kritik kontrol ve metinler üst üste binmez |

## Login ve Yetki

| ID | Öncelik | Senaryo | Uygulama | Beklenen |
|---|---|---|---|---|
| AUTH-01 | P0 | Geçerli kullanıcı | Doğru e-posta/parola ile giriş | Yetkili organizasyon açılır; parola saklanmaz |
| AUTH-02 | P0 | Hatalı parola | Hatalı parola ile giriş | Veri görünmez; anlaşılır hata; oturum oluşmaz |
| AUTH-03 | P0 | Yetkisiz ama Firebase kullanıcısı | `allowedUsers` kaydı olmayan hesapla giriş | Firestore verisi okunamaz/yazılamaz |
| AUTH-04 | P0 | Viewer yetkisi | Viewer hesapla kayıt/ödeme/silme dene | Okuma açık; tüm yazmalar reddedilir |
| AUTH-05 | P1 | Beni hatırla | İşaretli/işaretsiz girişten sonra tarayıcıyı kapat-aç | Kalıcılık tercihi doğru uygulanır |
| AUTH-06 | P0 | Çıkış | Çıkış yap, geri tuşuna bas | Panel verisi tekrar görünmez; aktif dinleyiciler kapanır |
| AUTH-07 | P1 | Oturum süresi/iptali | Firebase oturumunu uzaktan iptal et | Uygulama login ekranına döner; yerel değişiklik durumu açıklanır |

## Offline ve Ağ Kesintisi

| ID | Öncelik | Senaryo | Uygulama | Beklenen |
|---|---|---|---|---|
| OFF-01 | P0 | Açık panelde ağ kesilmesi | Panel açıkken offline yap, yeni test hareketi gir | Kayıt yerelde işaretlenir; senkron olmuş gibi gösterilmez |
| OFF-02 | P0 | Yeniden bağlanma | OFF-01 sonrası online yap | Kayıt bir kez gönderilir; tekrar/eksik oluşmaz |
| OFF-03 | P1 | Offline yeniden açılış | Daha önce açılmış uygulamayı çevrimdışı yeniden aç | Destekleniyorsa kabuk ve önbellek açılır; değilse açık hata gösterilir |
| OFF-04 | P0 | Gönderim ortasında kesinti | Ödeme gönderilirken ağı kes | Atomik işlem ya tamamlanır ya hiç oluşmaz |
| OFF-05 | P1 | Uzun offline dönem | A offline değişiklik yaparken B bulutu güncellesin; A online olsun | Otomatik üzerine yazma yok; çakışma güvenli biçimde çözülür |

## Senkron ve İki Cihaz

| ID | Öncelik | Senaryo | Uygulama | Beklenen |
|---|---|---|---|---|
| SYNC-01 | P0 | İlk yükleme | Boş yerel profille giriş | Tüm alt koleksiyonlar okunur; kayıt sayıları doğru |
| SYNC-02 | P0 | Tek cihaz ekleme | A'da cari, işlem, borç ve üretim kaydı ekle | Her varlık doğru alt koleksiyona gider; B'de görünür |
| SYNC-03 | P0 | Farklı iki eşzamanlı işlem | A ve B aynı başlangıçtan farklı satış/alış ekleyip aynı anda kaydetsin | Toplam hareket sayısı `+2`; iki kayıt ve iki audit izi korunur; son-yazan kazanır veri kaybı yok |
| SYNC-04 | P0 | Farklı varlıklara eşzamanlı yazma | A sipariş, B stok kartı eklesin | İkisi de başarılı; biri diğerinin koleksiyonunu silmez/değiştirmez |
| SYNC-05 | P0 | Aynı kayda eşzamanlı düzenleme | A ve B aynı cari/işi farklı güncellesin | Bir yazma kabul edilir; diğeri sürüm çakışması alır; sessiz ezme yok |
| SYNC-06 | P0 | Aynı borca eşzamanlı ödeme | Kalan 1.000 TL borca A ve B aynı anda 700 TL ödesin | Yalnız biri commit olur; borç `paid <= amount`; ikinci cihaz çakışma alır; ödeme hareketi ile borç güncellemesi atomiktir |
| SYNC-07 | P0 | Aynı borcun kalanını eşzamanlı ödeme | Kalan 1.000 TL'ye iki cihaz aynı anda 1.000 TL ödesin | Tek kapanış ve tek ödeme hareketi oluşur; çift kasa çıkışı yok |
| SYNC-08 | P0 | ID çakışması | A ve B aynı kayıt sayısıyla offline iken birer işlem oluşturup online olsun | Firestore belge ID'leri farklıdır; ikisi de korunur; iş görünen numarası çakışsa bile sistem kimliği çakışmaz |
| SYNC-09 | P0 | Yeniden deneme/idempotency | Aynı isteği ağ zaman aşımı nedeniyle tekrar gönder | Aynı iş iki kez oluşmaz; istemci işlem anahtarı tekrar kullanılır |
| SYNC-10 | P1 | Dinleyici yankısı | A kayıt eklesin ve kendi snapshot'ını alsın | Kayıt tekrar gönderilmez; sonsuz senkron döngüsü yok |
| SYNC-11 | P0 | Kurallar-adaptör sözleşmesi | Create/update alanlarını Firestore Rules Emulator ile test et | Adaptörün yazdığı `revision/createdAt/createdBy/updatedAt/updatedBy` kurallardan geçer |

## Alt Koleksiyon ve 1 MiB Riski

| ID | Öncelik | Senaryo | Uygulama | Beklenen |
|---|---|---|---|---|
| ARCH-01 | P0 | Alt koleksiyon yolu | Firestore kayıt yollarını incele | Yol `orgs/{orgId}/{collection}/{docId}`; merkezi `state` belgesi yok |
| ARCH-02 | P0 | Toplam veri 1 MiB üstü | En az 2.000 küçük işlemle toplam organizasyon verisini 1 MiB üstüne çıkar | Yükleme ve yeni kayıt sürer; hiçbir tek belge tüm dizileri içermez |
| ARCH-03 | P0 | Tek belge sınırı | 1 MiB'a yaklaşan aşırı not/alan gönder | Kontrollü doğrulama hatası; diğer kayıtlar ve senkron bozulmaz |
| ARCH-04 | P1 | Büyük koleksiyon sayfalama | 10.000 hareketle liste/arama aç | Sayfalama/sorgu sınırı var; tüm koleksiyon zorunlu tek seferde indirilmez |
| ARCH-05 | P0 | Toplu işlem limiti | 450'den fazla değişikliği tek senkron turunda dene | Parçalı ve güvenli aktarım veya açık engel; yarım/sessiz kayıp yok |

## Veri Silme ve Geri Alma

| ID | Öncelik | Senaryo | Uygulama | Beklenen |
|---|---|---|---|---|
| DEL-01 | P0 | Hareket iptali | Satış/alış hareketini iptal et | Belge silinmez; `İptal` olur; hesap/stok etkisi kalkar; log oluşur |
| DEL-02 | P0 | Borç ödeme iptali | Kısmi ödeme hareketini iptal et | Borç `paid/status` atomik geri alınır; kasa etkisi kalkar |
| DEL-03 | P0 | Borç planı iptali | Açık planı iptal et | Geçmiş korunur; öncelik/toplamdan çıkar; hard delete yok |
| DEL-04 | P0 | Üretim işi iptali | Açık işi iptal et | İş geçmişte kalır; açık işlerden çıkar |
| DEL-05 | P1 | Son işlem geri alma | Son işlemi geri al ve iki cihazdan kontrol et | Yedek alınır; bağlı borç etkisi tutarlı; diğer cihaz güncellenir |
| DEL-06 | P0 | Yetkisiz hard delete | Viewer/editor ile finansal belge delete isteği | Firestore kuralları reddeder |

## Borç Kısmi Ödeme

| ID | Öncelik | Senaryo | Uygulama | Beklenen |
|---|---|---|---|---|
| DEBT-01 | P0 | Geçerli kısmi ödeme | 1.000 TL borca 300 TL öde | Kalan 700, durum `Kısmi`; tek `BORC_ODEME`; kasa -300 |
| DEBT-02 | P0 | Borcu kapatma | Kalan 700 TL'yi öde | Kalan 0, durum `Ödendi`; tekrar ödeme kapalı |
| DEBT-03 | P0 | Fazla/negatif/sıfır | 701, 0, -1 ve metin dene | Hepsi reddedilir; veri ve kasa değişmez |
| DEBT-04 | P0 | Ağ hatası | Ödeme commit anında ağı kes | Borç ve hareket birlikte var ya da ikisi de yok |
| DEBT-05 | P1 | Ondalık ve Türkçe giriş | `100,50` öde | 100,50 işlenir; yuvarlama ve kalan doğru |

## Sipariş, Üretim ve Stok Alarmı

| ID | Öncelik | Senaryo | Uygulama | Beklenen |
|---|---|---|---|---|
| ORD-01 | P0 | Sipariş kaydı | Cari, ürün, miktar, fiyat, kapora ile sipariş ekle | Bir sipariş ve bağlı üretim işi atomik oluşur; stok hemen düşmez |
| ORD-02 | P0 | Kapora sınırı | Kaporayı toplamdan büyük gir | Kayıt oluşmaz |
| ORD-03 | P0 | Üretim aşamaları | Kesimden Teslim'e ilerlet | Sıra atlanmaz; her adım loglanır; iki cihazda görünür |
| ORD-04 | P0 | Üretim stok etkisi | Reçeteli mamul üret | Mamul artar, bileşenler reçete miktarı kadar azalır |
| ORD-05 | P0 | Reçetesiz üretim | Reçetesiz mamul üretmeyi dene | Açık uyarı/engel; sessiz negatif stok yok |
| STOCK-01 | P0 | Minimuma eşit stok | Mevcut = min yap | `Kritik` alarm görünür |
| STOCK-02 | P0 | Minimum altı/negatif | Satış/üretimle min altına ve eksiye düşür | Düşük stok ve eksi stok ayrı, görünür uyarı üretir |
| STOCK-03 | P0 | İptal sonrası alarm | Stok düşüren hareketi iptal et | Stok ve alarm yeniden doğru hesaplanır |
| STOCK-04 | P1 | Min = 0 | Alarm dışı kart oluştur | Yanlış düşük stok alarmı oluşmaz |
| STOCK-05 | P0 | Eşzamanlı stok tüketimi | A ve B aynı son stoğu eşzamanlı tüketsin | Sürüm/iş kuralı çatışması; sessiz eksi stok ve veri kaybı yok |

## Kanıt ve Kapanış

Her koşuda cihaz/tarayıcı, test organizasyonu, saat, başlangıç-bitiş kayıt sayıları ve Firestore Emulator/Rules çıktısı saklanır. P0 sonuçları için ekran görüntüsüne ek olarak belge yolları, revision değerleri ve kasa/stok/borç toplamları karşılaştırılır.

