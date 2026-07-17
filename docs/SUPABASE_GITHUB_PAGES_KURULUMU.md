# Miraç ERP — Supabase + GitHub Pages

## Yeni mimari
- GitHub: kod ve sürüm deposu
- GitHub Pages: panel yayını
- Supabase Auth: kullanıcı girişi
- Supabase Postgres: cari, tahsilat, borç, stok ve üretim kayıtları

## Hazır olanlar
- Siyah saha paneli Supabase istemcisine geçirildi.
- Veri tabanı şeması ve RLS kuralları `supabase/schema.sql` dosyasında hazırlandı.
- GitHub Pages otomatik yayın workflow'u eklendi.
- Firebase otomatik dağıtım workflow'u kaldırıldı.

## Supabase tarafında zorunlu tek kurulum
1. Yeni Supabase projesi oluştur.
2. SQL Editor'da `supabase/schema.sql` dosyasını çalıştır.
3. Authentication bölümünden ilk kullanıcıyı oluştur.
4. Kullanıcının UUID değerini kullanarak şu kaydı ekle:

```sql
insert into public.members(user_id, org_id, role, active)
values ('KULLANICI_UUID','mirac','owner',true);
```

5. Project URL ve anon public key değerlerini `public/supabase-config.js` dosyasına yaz.

## Güvenlik
- Service role key kesinlikle tarayıcı koduna yazılmaz.
- Panel yalnız anon public key kullanır.
- Gerçek erişim Row Level Security ve `members` tablosuyla sınırlandırılır.
