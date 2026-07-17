# Siyah Saha Komuta Paneli

## Amaç

Bu ekran Miraç ERP'nin teknoloji vitrini değil, saha karar ekranıdır.

Ana ekranda araç isimleri görünmez. Kullanıcı sadece iş dilini görür:

- Para
- Tahsilat
- Borç
- Sipariş
- Üretim
- Stok
- Teslim
- Risk
- Karar

## Eklenen sayfa

```text
public/siyah-saha-paneli.html
```

Firebase Hosting deploy sonrası beklenen yol:

```text
https://tamam-d1caa.web.app/siyah-saha-paneli.html
```

## Tasarım karakteri

- Siyah / füme ana zemin
- Büyük aksiyon butonları
- İlk bakışta karar verdirecek veri yerleşimi
- Araç isimleri gizli, iş dili önde
- Saha gerçekliği: tahsilat, borç, üretim, stok, teslim riski

## Korunan kural

Mevcut `public/index.html` dosyası bozulmadı. Siyah saha paneli önce ayrı sayfa olarak eklendi. Onay sonrası ana ekrana bağlanabilir veya ana panel yerine geçirilebilir.
