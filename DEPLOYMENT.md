# Miraç ERP Cloud dağıtımı

Bu klasör Firebase Hosting ile statik paneli, Firestore için ise yalnızca güvenlik kurallarını dağıtır. Script Firestore verisi yüklemez, belge silmez ve index dağıtmaz.

## Bir kez yapılacak ayar

1. Firebase projesinde Hosting ve Cloud Firestore'u etkinleştirin.
2. `.firebaserc.example` dosyasını `.firebaserc` adıyla kopyalayın.
3. `REPLACE_WITH_FIREBASE_PROJECT_ID` değerini Firebase Console'daki gerçek proje kimliğiyle değiştirin.
4. `public/firebase-config.js.example` dosyasını `public/firebase-config.js` adıyla kopyalayıp aynı projenin Firebase Web App ayarlarıyla doldurun. Service account veya private key koymayın.

`.firebaserc` yerel/hedef ortama özeldir; örnek dosya dağıtım sözleşmesidir.

## Güvenli dağıtım

PowerShell'de bu klasörde çalıştırın:

```powershell
.\deploy.ps1 -ExpectedProjectId "mirac-erp-prod"
```

Örnekteki `mirac-erp-prod` yerine `.firebaserc` içine yazdığınız gerçek proje kimliğini kullanın.

Yalnızca doğrulama yapmak ve hiçbir şey dağıtmamak için:

```powershell
.\deploy.ps1 -ExpectedProjectId "mirac-erp-prod" -PreflightOnly
```

## Kullanıcının yapacağı tek onay

Firebase CLI oturumu yoksa script şu mesajda durur:

`KULLANICI ADIMI: Açılan resmi Google sayfasında hesabı seçin ve Firebase CLI iznini onaylayın.`

Kullanıcı yalnızca tarayıcıdaki Google hesap seçimi/izin adımını tamamlar. Proje seçimi veya elle deploy yapılmaz; terminale dönüldüğünde script doğrulamaya otomatik devam eder. Geçerli oturum varsa bu adım da açılmaz.

## Koruma zinciri

- Yalnızca `bin` altındaki çalışabilir resmi standalone Windows Firebase CLI adayı kullanılır; `PATH`, `npm` veya `npx` kullanılmaz.
- `.firebaserc` içindeki proje kimliği ile `-ExpectedProjectId` birebir eşleşmezse işlem durur.
- Login doğrulanır; giriş yapılan hesabın hedef projeyi `projects:list` içinde tam kimlikle görebildiği kontrol edilir.
- Her deploy komutuna `--project` açıkça verilir. CLI'nin aktif/varsayılan başka projesine güvenilmez.
- Preflight; `firebase.json`, rules, indexes, üretim web ayarı ve `public` modül/rules koleksiyon uyumunu kontrol eder. Ardından CLI `--dry-run` ile rules + indexes + Hosting'i release oluşturmadan doğrular.
- Gerçek dağıtım kapsamı sabittir: `firestore:rules,hosting`. Firestore belge verisi ve index değişiklikleri gerçek release kapsamı dışındadır.
- `public` ve `firestore.rules` önce geçici klasöre kopyalanır. Böylece deploy anındaki snapshot sabit kalır ve workspace'e Firebase cache/log dosyası yazılmaz.
- Hosting güvenlik başlıkları `firebase.json` ile uygulanır; içerik cache'i kapalıdır.

`firestore.rules` ilk yetkili kullanıcıyı kendiliğinden oluşturmaz. İlk owner kaydı güvenilir Admin SDK süreci veya Firebase Console üzerinden kurallardaki şemaya uygun biçimde açılmalıdır. Geçici `allow true` kuralı kullanmayın.

Dağıtım hatasında script non-zero çıkar ve hedef proje açıkça görünmeden hiçbir release başlatmaz.
