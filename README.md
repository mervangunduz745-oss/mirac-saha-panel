# Miraç Saha Panel

Miraç için Firebase Hosting üzerinde çalışan saha operasyon paneli.

- Canlı URL: https://tamam-d1caa.web.app
- Mobil giriş: https://tamam-d1caa.web.app/mobil
- Firebase proje id: `tamam-d1caa`

## Odak

Bu panel resmi muhasebe veya e-belge sistemi değildir. Resmi kayıt ve fatura süreçleri mevcut dış sistemlerde kalır. Panelin görevi saha kararını hızlandırmaktır:

- günlük karargah özeti
- üretim ve teslim takibi
- stok ve maliyet uyarısı
- cari, tahsilat ve borç önceliği
- mobil saha girişi

## Yayın

Hosting-only deploy:

```powershell
.\bin\firebase-tools-win-v15.22.1.exe deploy --only hosting --non-interactive --project tamam-d1caa
```

`bin/`, `backups/`, `audit_*`, dry-run ve seed çıktı klasörleri Git dışında tutulur.
