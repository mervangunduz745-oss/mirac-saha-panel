# Miraç ERP Firebase Migrasyon Araçları

Bu klasör salt-okunur migrasyon ve doğrulama araçlarını içerir. Kaynak olarak yalnızca:

- `GET http://127.0.0.1:8777/api/state`
- Yerel state JSON
- Yerel Excel backend (`.xlsx` / `.xlsm`, read-only)

kullanılır. Araçlarda Firebase SDK, servis hesabı, ağ üzerinden yazma veya upload kodu yoktur.

## Çıktı Mimarisi

Seed tek state belgesi değildir. Her tablo ayrı belge listesi olarak üretilir:

```text
manifest.json
settings.json             -> orgs/{orgId}/settings/{documentId}
accounts.json             -> orgs/{orgId}/accounts/{documentId}
cariCards.json            -> orgs/{orgId}/cariCards/{documentId}
items.json                -> orgs/{orgId}/items/{documentId}
recipes.json              -> orgs/{orgId}/recipes/{documentId}
transactions.json         -> orgs/{orgId}/transactions/{documentId}
debtPlans.json            -> orgs/{orgId}/debtPlans/{documentId}
fixedExpenses.json        -> orgs/{orgId}/fixedExpenses/{documentId}
productionJobs.json       -> orgs/{orgId}/productionJobs/{documentId}
logs.json                 -> orgs/{orgId}/logs/{documentId}
dry_run_report.json
dry_run_report.md
```

Her belgenin `data` alanında `legacyId`, `schemaVersion` ve `importBatchId` bulunur. Makineye özel Excel tam yolu seed'e alınmaz.

## Bundled Python

PowerShell'de bu oturumda doğrulanan Codex bundled Python yolu:

```powershell
$PY = 'C:\Users\merva\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
Set-Location 'C:\Users\merva\Documents\Codex\2026-06-06\files-mentioned-by-the-user-mirac\outputs\mirac_erp_cloud\tools'
& $PY --version
```

Excel okuma için gereken `openpyxl` bundled runtime içinde bulunur; ek paket kurulmaz.

## Kullanım

Canlı API'den seed paketi ve dry-run raporu:

```powershell
& $PY .\build_seed.py --source 'http://127.0.0.1:8777/api/state' --org-id 'mirac' --schema-version 1
```

Excel backend'den seed paketi:

```powershell
& $PY .\build_seed.py --source '..\..\mirac_erp_pilot_v0_2\excel_backend\MIRAC_ERP_CANLI_VERI_v0_8.xlsx' --org-id 'mirac'
```

Seed oluşturmadan dry-run:

```powershell
& $PY .\dry_run.py --source 'http://127.0.0.1:8777/api/state' --org-id 'mirac'
```

Kaynak şeması veya üretilen seed paketi doğrulama:

```powershell
& $PY .\validate_schema.py --source 'http://127.0.0.1:8777/api/state' --org-id 'mirac'
& $PY .\validate_schema.py --seed-dir '.\seed_batches\<importBatchId>'
```

Sabit batch kimliği gerekiyorsa `--import-batch-id MIGRASYON-2026-06-24-A` verilir. Çıktı klasörü doluysa araç üzerine yazmaz.

## Kontroller

- Zorunlu alanlar ve veri tipleri
- Aynı koleksiyondaki tekrarlı legacy ID/kod/bileşik reçete anahtarı
- Üretilen Firestore belge ID ve tam yol çakışmaları
- Reçete, stok, hesap, üretim, borç planı ve cari referansları
- Borçta fazla/negatif ödeme, yanlış kapalı/kısmi durum, olası tekrar planlar
- `BORC_ODEME` hareketlerinin eksik veya bozuk `debtPlanId` bağlantıları
- Eski Excel kolon kayması belirtisi olan tarih biçimli `debtPlanId` değerleri

`schemaValid=false` ise seed dosyaları yazılmaz. Yapısal olarak geçerli fakat iş kuralı hatalı veri için seed üretilir, ancak raporda `uploadReady=false` olur.

## Çıkış Kodları

- `0`: Şema geçerli ve yüklemeye hazır.
- `1`: Kaynak/çalışma hatası.
- `2`: Zorunlu alan, veri tipi veya ID/yol çakışması nedeniyle şema geçersiz.
- `3`: Seed üretildi ya da dry-run tamamlandı; iş kuralı/referans sorunları nedeniyle inceleme gerekli.

## Test

```powershell
& $PY -m unittest discover -s .\tests -v
```
