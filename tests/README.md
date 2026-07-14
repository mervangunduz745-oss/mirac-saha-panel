# Miraç ERP QA Test Paketi

Bu klasör yerel paneli ve hazırlanmakta olan bulut `public` dosyalarını **canlı veriye dokunmadan** doğrular.

## Dosyalar

- `TEST_PLAN.md`: masaüstü/mobil, login, offline, senkron, iki cihaz çakışması, veri silme, borç kısmi ödeme, sipariş-üretim ve stok alarmı manuel testleri.
- `run-tests.ps1`: HTML/JavaScript, Firebase adaptörü, Firestore kuralları ve mimari sözleşmeleri için salt-okuma statik testler.

## Çalıştırma

PowerShell 7:

```powershell
pwsh -File .\outputs\mirac_erp_cloud\tests\run-tests.ps1
```

Windows PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\outputs\mirac_erp_cloud\tests\run-tests.ps1
```

Uyarıları da başarısız saymak için:

```powershell
powershell -ExecutionPolicy Bypass -File .\outputs\mirac_erp_cloud\tests\run-tests.ps1 -StrictWarnings
```

Yalnızca bu GitHub deposunda bulunan bulut paneli kaynaklarını doğrulamak için:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\run-tests.ps1 -CloudOnly -StrictWarnings
```

GitHub Actions bu depo-içi modu kullanır; repo dışındaki eski Excel/yerel panel kaynaklarına bağımlı değildir.

## Sonuç Kodları

- `0`: engelleyici hata yok.
- `1`: en az bir `FAIL` var.
- `2`: `-StrictWarnings` kullanıldı ve en az bir `WARN` var.

## Güvenlik

Script yalnızca kaynak dosyalarını okur. HTTP isteği yapmaz; Firebase, Google Sheets veya Excel'e bağlanmaz; tarayıcı açmaz; `localStorage` ya da canlı veri dosyası değiştirmez. JavaScript sözdizimi kontrolü varsa `node --check` ile standart girdi üzerinden yapılır.

Manuel senaryolar yalnızca ayrı Firebase test projesi/emülatör, test hesabı ve `QA-` önekli veriyle uygulanmalıdır. Canlı ortamda silme, ödeme, stok veya senkron testi yapılmaz.

## Zorunlu Mimari Kapıları

- İş verisi `orgs/{orgId}/{collection}/{docId}` alt koleksiyonlarında tutulmalı; tüm ERP durumu tek Firestore belgesine yazılmamalı.
- İki cihaz farklı kayıt eklediğinde iki kayıt da korunmalı.
- Aynı borca eşzamanlı ödeme tek atomik işlemle sınırlandırılmalı; fazla ödeme ve yetim ödeme hareketi oluşmamalı.
- İşlem/borç/üretim kimlikleri cihazdan bağımsız ve çakışmaya dayanıklı olmalı; `array.length + 1` kullanılmamalı.
- Toplam veri büyümesi tek belgeyi Firestore'un 1 MiB sınırına taşımamalı.
- Panel, bulut adaptörü ve Firestore kuralları aynı alan ve hata sözleşmesini kullanmalı.
