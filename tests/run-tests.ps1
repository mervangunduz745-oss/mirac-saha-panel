[CmdletBinding()]
param(
  [switch]$StrictWarnings,
  [switch]$CloudOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:Results = [System.Collections.Generic.List[object]]::new()

function Add-Result {
  param(
    [ValidateSet("PASS", "WARN", "FAIL")][string]$Status,
    [string]$Area,
    [string]$Name,
    [string]$Detail
  )
  $script:Results.Add([pscustomobject]@{
    Status = $Status
    Area = $Area
    Name = $Name
    Detail = $Detail
  })
}

function Test-Match {
  param([string]$Text, [string]$Pattern)
  if ($null -eq $Text) { return $false }
  return [regex]::IsMatch(
    $Text,
    $Pattern,
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor
      [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
}

function Add-PatternCheck {
  param(
    [string]$Text,
    [string]$Pattern,
    [string]$Area,
    [string]$Name,
    [string]$PassDetail,
    [string]$FailDetail,
    [ValidateSet("WARN", "FAIL")][string]$MissingStatus = "FAIL"
  )
  if (Test-Match $Text $Pattern) {
    Add-Result "PASS" $Area $Name $PassDetail
  } else {
    Add-Result $MissingStatus $Area $Name $FailDetail
  }
}

function Read-Source {
  param([string]$Path, [string]$Label)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Add-Result "FAIL" "Kaynak" $Label "Dosya bulunamadi: $Path"
    return $null
  }
  $item = Get-Item -LiteralPath $Path
  if ($item.Length -eq 0) {
    Add-Result "FAIL" "Kaynak" $Label "Dosya bos: $Path"
    return $null
  }
  Add-Result "PASS" "Kaynak" $Label "$($item.Length) bayt okundu."
  return Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
}

function Test-HtmlIds {
  param([string]$Html, [string]$Label)
  if ($null -eq $Html) { return }

  $idTagPattern = @'
<[A-Za-z][^<>]*\bid\s*=\s*["']([^"']+)["'][^<>]*>
'@
  $byIdPattern = @'
byId\(\s*["']([^"']+)["']\s*\)
'@
  $ids = @([regex]::Matches($Html, $idTagPattern, "IgnoreCase") | ForEach-Object { $_.Groups[1].Value })
  $duplicates = $ids | Group-Object | Where-Object Count -gt 1 | Select-Object -ExpandProperty Name
  if ($duplicates) {
    Add-Result "FAIL" "HTML" "$Label benzersiz ID" ("Tekrarlanan ID: " + ($duplicates -join ", "))
  } else {
    Add-Result "PASS" "HTML" "$Label benzersiz ID" "$($ids.Count) ID benzersiz."
  }

  $idSet = @{}
  foreach ($id in $ids) { $idSet[$id] = $true }
  $references = @([regex]::Matches($Html, $byIdPattern) | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
  $missing = @($references | Where-Object { -not $idSet.ContainsKey($_) })
  if ($missing.Count) {
    Add-Result "FAIL" "HTML" "$Label byId hedefleri" ("HTML'de olmayan hedef: " + ($missing -join ", "))
  } else {
    Add-Result "PASS" "HTML" "$Label byId hedefleri" "$($references.Count) JavaScript hedefi HTML'de bulundu."
  }
}

function Test-LocalAssets {
  param([string]$Html, [string]$HtmlPath, [string]$Label)
  if ($null -eq $Html) { return }
  $assetPattern = @'
<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']
'@
  $refs = @([regex]::Matches($Html, $assetPattern, "IgnoreCase") | ForEach-Object { $_.Groups[1].Value })
  $missing = @()
  foreach ($ref in $refs) {
    if ($ref -match '^(?:https?:|//|data:|#)') { continue }
    $clean = ($ref -split '[?#]')[0]
    if (-not $clean) { continue }
    $candidate = Join-Path (Split-Path -Parent $HtmlPath) $clean
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { $missing += $ref }
  }
  if ($missing.Count) {
    Add-Result "FAIL" "HTML" "$Label yerel asset" ("Eksik referans: " + ($missing -join ", "))
  } else {
    Add-Result "PASS" "HTML" "$Label yerel asset" "$($refs.Count) asset referansi kontrol edildi."
  }
}

function Test-JavaScriptSyntax {
  param([string]$Html, [string]$Label)
  if ($null -eq $Html) { return }
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Add-Result "WARN" "JavaScript" "$Label sozdizimi" "node bulunamadi; sozdizimi kontrolu atlandi."
    return
  }

  $blocks = [regex]::Matches($Html, '(?is)<script(?<attrs>[^>]*)>(?<code>.*?)</script>') |
    Where-Object { $_.Groups['attrs'].Value -notmatch '\bsrc\s*=' }
  $code = ($blocks | ForEach-Object { $_.Groups['code'].Value }) -join "`n"
  if ([string]::IsNullOrWhiteSpace($code)) {
    Add-Result "FAIL" "JavaScript" "$Label sozdizimi" "Kontrol edilecek inline JavaScript bulunamadi."
    return
  }

  $isModule = $blocks | Where-Object { $_.Groups['attrs'].Value -match 'type\s*=\s*["'']module["'']' }
  $arguments = if ($isModule) { "--input-type=module --check -" } else { "--check -" }
  try {
    $start = [System.Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $node.Source
    $start.Arguments = $arguments
    $start.UseShellExecute = $false
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($start)
    $process.StandardInput.Write($code)
    $process.StandardInput.Close()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -eq 0) {
      Add-Result "PASS" "JavaScript" "$Label sozdizimi" "node --check basarili."
    } else {
      $line = ($stderr -split "`r?`n" | Where-Object { $_ } | Select-Object -First 1)
      Add-Result "FAIL" "JavaScript" "$Label sozdizimi" "node --check hata verdi: $line"
    }
  } catch {
    Add-Result "WARN" "JavaScript" "$Label sozdizimi" "node calistirilamadi: $($_.Exception.Message)"
  }
}

$cloudRoot = Split-Path -Parent $PSScriptRoot
$outputsRoot = Split-Path -Parent $cloudRoot
$localRoot = Join-Path $outputsRoot "mirac_erp_pilot_v0_2"
$localHtmlPath = Join-Path $localRoot "index.html"
$localBridgePath = Join-Path $localRoot "excel_bridge_server.py"
$cloudPublic = Join-Path $cloudRoot "public"
$cloudHtmlPath = Join-Path $cloudPublic "index.html"
$cloudAdapterPath = Join-Path $cloudPublic "firebase-cloud.js"
$cloudConfigExamplePath = Join-Path $cloudPublic "firebase-config.js.example"
$cloudConfigPath = Join-Path $cloudPublic "firebase-config.js"
$rulesPath = Join-Path $cloudRoot "firestore.rules"

$localHtml = $null
$localBridge = $null
if (-not $CloudOnly) {
  $localHtml = Read-Source $localHtmlPath "Yerel panel HTML"
  $localBridge = Read-Source $localBridgePath "Excel kopru"
}
$cloudHtml = Read-Source $cloudHtmlPath "Bulut panel HTML"
$cloudAdapter = Read-Source $cloudAdapterPath "Firebase adaptor"
$rules = Read-Source $rulesPath "Firestore kurallari"
$configExample = Read-Source $cloudConfigExamplePath "Firebase ayar ornegi"

$targets = @()
if ($null -ne $localHtml) {
  $targets += @{ Label = "Yerel"; Html = $localHtml; Path = $localHtmlPath }
}
$targets += @{ Label = "Bulut"; Html = $cloudHtml; Path = $cloudHtmlPath }

foreach ($target in $targets) {
  if ($null -eq $target.Html) { continue }
  Add-PatternCheck $target.Html '<meta\s+name=["'']viewport["''][^>]*width=device-width' "Mobil" "$($target.Label) viewport" "Mobil viewport mevcut." "Mobil viewport eksik."
  Add-PatternCheck $target.Html '@media\s*\(\s*max-width\s*:\s*760px\s*\)' "Mobil" "$($target.Label) telefon kirilimi" "760px telefon kirilimi mevcut." "Telefon kirilimi bulunamadi."
  Add-PatternCheck $target.Html 'overflow-x\s*:\s*auto|overflow\s*:\s*auto' "Mobil" "$($target.Label) tablo tasmasi" "Kontrollu kaydirma stili mevcut." "Dar ekranda tablo tasmasi icin kaydirma stili bulunamadi." "WARN"
  Add-PatternCheck $target.Html 'id=["'']loginForm["'']' "Login" "$($target.Label) login formu" "Login formu mevcut." "Login formu eksik."
  Add-PatternCheck $target.Html 'type=["'']password["'']' "Login" "$($target.Label) parola alani" "Parola/PIN alani maskeli." "Maskeli parola alani eksik."
  Add-PatternCheck $target.Html 'function\s+backupState\b[\s\S]*?localStorage\.setItem\(BACKUP_KEY' "Veri" "$($target.Label) yerel yedek" "Degisiklik oncesi yerel yedek mekanizmasi mevcut." "Yerel yedek mekanizmasi eksik."
  Add-PatternCheck $target.Html 'function\s+cancelTransaction\b[\s\S]*?backupState\([\s\S]*?status\s*=\s*["'']' "Silme" "$($target.Label) yumusak hareket iptali" "Hareket iptali yedek ve durum degisikligi kullaniyor." "Hareket iptali hard-delete riski tasiyor."
  Add-PatternCheck $target.Html 'function\s+payDebtPlan\b[\s\S]*?payAmount\s*>\s*remaining[\s\S]*?type\s*:\s*["'']BORC_ODEME["'']' "Borc" "$($target.Label) kismi odeme" "Fazla odeme engeli ve bagli odeme hareketi mevcut." "Kismi odeme korumalari eksik."
  Add-PatternCheck $target.Html 'function\s+addOrder\b[\s\S]*?state\.transactions\.push\(tx\)[\s\S]*?state\.productionJobs\.push\(job\)' "Siparis" "$($target.Label) siparis-uretim bagi" "Siparis ve uretim isi birlikte olusturuluyor." "Siparis-uretim bagi eksik."
  Add-PatternCheck $target.Html 'low\s*:\s*[^\r\n]*<=\s*Number\(item\.min' "Stok" "$($target.Label) minimum alarmi" "Minimuma esit ve altinda stok alarmi var." "Stok minimum alarmi bulunamadi."
  Test-HtmlIds $target.Html $target.Label
  Test-LocalAssets $target.Html $target.Path $target.Label
  Test-JavaScriptSyntax $target.Html $target.Label
}

if (-not $CloudOnly) {
  Add-PatternCheck $localHtml 'async\s+function\s+pushStateToExcel[\s\S]*?/api/state[\s\S]*?method\s*:\s*["'']POST' "Yerel senkron" "Excel push" "Excel state POST hatti mevcut." "Excel push hatti eksik."
  Add-PatternCheck $localHtml 'async\s+function\s+pullStateFromExcel[\s\S]*?backupState\([\s\S]*?saveState\(\{\s*sync\s*:\s*false\s*\}\)' "Yerel senkron" "Excel pull guvenligi" "Pull oncesi yedek ve dongu engeli mevcut." "Excel pull yedek/dongu korumasi eksik."
  Add-PatternCheck $localBridge 'threading\.Lock\(\)[\s\S]*?with\s+LOCK[\s\S]*?write_workbook_state' "Yerel senkron" "Excel yazma kilidi" "Kopru yazmalari process ici kilitliyor." "Excel koprude yazma kilidi bulunamadi."
}

Add-PatternCheck $cloudHtml 'type=["'']module["''][\s\S]*?firebase-cloud\.js' "Bulut" "Firebase modul baglantisi" "Bulut panel Firebase adaptorunu modul olarak yukluyor." "Firebase adaptor panel HTML'ine bagli degil."
Add-PatternCheck $cloudHtml 'signInWithEmailAndPassword|cloud\.signIn' "Login" "Firebase login" "Bulut panel Firebase e-posta/parola login kullaniyor." "Bulut panel Firebase login kullanmiyor."
$hasFirebaseSignIn = Test-Match $cloudAdapter 'signInWithEmailAndPassword'
$hasLocalPersistence = Test-Match $cloudAdapter 'browserLocalPersistence'
$hasSessionPersistence = Test-Match $cloudAdapter 'browserSessionPersistence'
if ($hasFirebaseSignIn -and $hasLocalPersistence -and $hasSessionPersistence) {
  Add-Result "PASS" "Login" "Oturum kaliciligi" "Hatirla secimi local/session persistence ile uygulanmis."
} else {
  Add-Result "FAIL" "Login" "Oturum kaliciligi" "Firebase sign-in veya local/session persistence secimi eksik."
}
Add-PatternCheck $rules 'match\s+/allowedUsers/\{uid\}[\s\S]*?allow\s+get[\s\S]*?allow\s+create' "Login" "Yetkili kullanici kurallari" "allowedUsers ve rol tabanli kurallar mevcut." "Yetkili kullanici kurallari eksik."

if (Test-Path -LiteralPath $cloudConfigPath -PathType Leaf) {
  Add-Result "PASS" "Bulut" "Firebase gercek ayar" "firebase-config.js mevcut (degerler yazdirilmadi)."
} else {
  Add-Result "WARN" "Bulut" "Firebase gercek ayar" "firebase-config.js yok; deploy oncesi gercek Web App ayari gerekli."
}
Add-PatternCheck $configExample 'YOUR_API_KEY[\s\S]*?orgId\s*:' "Bulut" "Firebase ayar sablonu" "Ayar sablonu placeholder ve orgId iceriyor." "Firebase ayar sablonu eksik veya beklenmeyen yapida."
if (Test-Match $configExample '(?m)^\s*(?:privateKey|private_key|serviceAccount|service_account)\s*[:=]') {
  Add-Result "FAIL" "Guvenlik" "Ayar sablonu sir kontrolu" "Sablonda private key veya service account alani bulundu."
} else {
  Add-Result "PASS" "Guvenlik" "Ayar sablonu sir kontrolu" "Service account/private key alani yok."
}

$collections = @("accounts", "cariCards", "items", "recipes", "transactions", "debtPlans", "fixedExpenses", "productionJobs", "logs")
$missingCollections = @($collections | Where-Object { -not (Test-Match $cloudAdapter ('["'']' + [regex]::Escape($_) + '["'']')) })
if ($missingCollections.Count) {
  Add-Result "FAIL" "Mimari" "Alt koleksiyon listesi" ("Eksik koleksiyon: " + ($missingCollections -join ", "))
} else {
  Add-Result "PASS" "Mimari" "Alt koleksiyon listesi" "9 is koleksiyonu adaptorde tanimli."
}
Add-PatternCheck $cloudAdapter 'collection\(db\s*,\s*["'']orgs["'']\s*,\s*orgId\s*,\s*name\s*\)' "Mimari" "Alt koleksiyon yolu" "Yol orgs/{orgId}/{collection} biciminde." "Alt koleksiyon yolu zorunlu mimariye uymuyor."
if (Test-Match $cloudAdapter 'stateDocumentPath|transaction\.set\([^;]*\{[^}]*\bstate\s*:') {
  Add-Result "FAIL" "Mimari" "Tek belge yasağı" "Tum state'i tek belgeye yazan eski mimari izi bulundu."
} else {
  Add-Result "PASS" "Mimari" "Tek belge yasağı" "Tum ERP state'ini tek belgeye yazan kod bulunmadi."
}
Add-PatternCheck $cloudAdapter 'getDocs\(collectionRefs\[name\]\)' "Mimari" "Koleksiyon bazli okuma" "Veri koleksiyon belgeleri olarak okunuyor." "Veri alt koleksiyon belgeleri olarak okunmuyor."
Add-PatternCheck $cloudAdapter 'collectChanges\(nextState\)[\s\S]*?runTransaction' "Eszamanlilik" "Degisiklik bazli atomik yazma" "Yalniz degisen belgeler atomik transaction'a giriyor." "Farkli cihaz degisikliklerini koruyan delta transaction yok."
Add-PatternCheck $cloudAdapter 'actualVersion[\s\S]*?expectedVersion[\s\S]*?CloudConflictError' "Eszamanlilik" "Belge surum kontrolu" "Belge bazli optimistic concurrency var." "Belge bazli surum cakisma kontrolu eksik."
Add-PatternCheck $cloudAdapter 'for\s*\(const\s+item\s+of\s+reads\)[\s\S]*?transaction\.(?:set|delete)' "Eszamanlilik" "Coklu belge atomikligi" "Borc ve odeme gibi coklu degisiklikler tek Firestore transaction'inda yaziliyor." "Coklu belge degisiklikleri atomik degil."
Add-PatternCheck $cloudAdapter 'MAX_ATOMIC_WRITES\s*=\s*(?:4[0-9]{2}|500)[\s\S]*?changes\.length\s*>\s*MAX_ATOMIC_WRITES' "Mimari" "Toplu yazma siniri" "Firestore atomik yazma siniri onceden kontrol ediliyor." "Toplu yazma limiti kontrol edilmiyor."

$lengthIdPattern = 'function\s+next(?:Id|CariCardId|DebtId|FixedId|JobId)\s*\([^)]*\)\s*\{[^}]*\.length\s*\+\s*1'
if (Test-Match $cloudHtml $lengthIdPattern) {
  Add-Result "FAIL" "Eszamanlilik" "ID cakisma dayanimi" "Bulut panel kimlikleri array.length + 1 ile uretiyor; iki cihaz ayni ID'yi uretebilir."
} elseif (Test-Match $cloudHtml 'crypto\.randomUUID|serverTimestamp\(\).*doc|addDoc\(') {
  Add-Result "PASS" "Eszamanlilik" "ID cakisma dayanimi" "Cihazdan bagimsiz cakismaya dayanikli kimlik uretimi bulundu."
} else {
  Add-Result "FAIL" "Eszamanlilik" "ID cakisma dayanimi" "Cakismaya dayanikli kayit kimligi kaniti bulunamadi."
}

$saveApiTwoArgs = Test-Match $cloudAdapter 'async\s+function\s+saveState\s*\(\s*nextState\s*,\s*clientId\s*\)'
$saveCallTwoArgs = Test-Match $cloudHtml 'cloud\.saveState\(\s*clone\(state\)\s*,\s*clientId\s*\)'
if ($saveApiTwoArgs -and $saveCallTwoArgs) {
  Add-Result "PASS" "Sozlesme" "saveState parametreleri" "Panel ve adaptor saveState(nextState, clientId) kullaniyor."
} else {
  Add-Result "FAIL" "Sozlesme" "saveState parametreleri" "Panel ile adaptor saveState parametreleri uyusmuyor."
}

$adapterConflictList = Test-Match $cloudAdapter 'this\.conflicts\s*=\s*conflicts'
$uiConflictList = Test-Match $cloudHtml 'error\.conflicts|error\?\.conflicts'
if ($adapterConflictList -and $uiConflictList) {
  Add-Result "PASS" "Sozlesme" "Cakisma hata nesnesi" "Panel adaptorun conflicts listesini kullaniyor."
} else {
  Add-Result "FAIL" "Sozlesme" "Cakisma hata nesnesi" "Adaptor conflicts uretiyor ancak panel ayni alani kullanmiyor."
}

$subscriptionSendsChanges = Test-Match $cloudAdapter 'collectionName\s*:\s*name[\s\S]*?docChanges\(\)'
$uiReloadsOnSignal = Test-Match $cloudHtml 'function\s+handleRemoteSnapshot[\s\S]*?(?:cloud\.loadState\(|pullCloudState\()'
if ($subscriptionSendsChanges -and $uiReloadsOnSignal) {
  Add-Result "PASS" "Sozlesme" "Canli dinleyici" "Koleksiyon degisiklik sinyali panelde yeniden yuklemeyi tetikliyor."
} elseif (-not $subscriptionSendsChanges) {
  Add-Result "WARN" "Sozlesme" "Canli dinleyici" "Adaptorun snapshot sozlesmesi statik olarak taninamadi."
} else {
  Add-Result "FAIL" "Sozlesme" "Canli dinleyici" "Adaptor sadece collectionName/changes gonderiyor; panel tam state/revision bekliyor."
}

$rulesMetadata = Test-Match $rules "revision[\s\S]*?createdAt[\s\S]*?createdBy[\s\S]*?updatedAt[\s\S]*?updatedBy"
$adapterMetadata = Test-Match $cloudAdapter "\brevision\s*:[\s\S]*?\bcreatedAt\s*:[\s\S]*?\bcreatedBy\s*:[\s\S]*?\bupdatedAt\s*:[\s\S]*?\bupdatedBy\s*:"
if ($rulesMetadata -and $adapterMetadata) {
  Add-Result "PASS" "Sozlesme" "Firestore metadata alanlari" "Adaptor kurallarin zorunlu metadata alanlarini yaziyor."
} else {
  Add-Result "FAIL" "Sozlesme" "Firestore metadata alanlari" "Kurallar revision/createdAt/createdBy/updatedAt/updatedBy bekliyor; adaptor ayni alanlari yazmiyor."
}
if (Test-Match $cloudAdapter '__version|__updatedAt|__updatedBy') {
  Add-Result "FAIL" "Sozlesme" "Eski metadata adlari" "Adaptor __version/__updatedAt turu alanlar kullaniyor; rules sozlesmesiyle hizalanmali."
} else {
  Add-Result "PASS" "Sozlesme" "Eski metadata adlari" "Kurallarla cakisan eski __metadata alanlari yok."
}

$missingRuleCollections = @($collections | Where-Object { -not (Test-Match $rules ('match\s+/orgs/\{orgId\}/' + [regex]::Escape($_) + '/\{[^}]+\}')) })
if ($missingRuleCollections.Count) {
  Add-Result "FAIL" "Guvenlik" "Alt koleksiyon kurallari" ("Rules kapsami eksik: " + ($missingRuleCollections -join ", "))
} else {
  Add-Result "PASS" "Guvenlik" "Alt koleksiyon kurallari" "Tum is koleksiyonlari rules tarafinda kapsaniyor."
}
Add-PatternCheck $rules 'match\s+/orgs/\{orgId\}/transactions/\{docId\}[\s\S]*?allow\s+delete\s*:\s*if\s+false' "Silme" "Finansal hard-delete engeli" "Transaction hard-delete istemciye kapali." "Transaction hard-delete engeli eksik."
Add-PatternCheck $rules '1\s+MiB|1\s*MiB' "Mimari" "1 MiB tasarim notu" "Rules dosyasi tek belge limitini ve kucuk entity ilkesini belgeliyor." "1 MiB tek belge riski mimari dokumanda belirtilmemis." "WARN"

Add-PatternCheck $cloudHtml 'navigator\.onLine|addEventListener\(["'']offline["'']|addEventListener\(["'']online["'']' "Offline" "Ag durumu" "Panel online/offline durumunu izliyor." "Panel ag durumunu acikca izlemiyor; kullanici senkron durumunu yanlis anlayabilir." "WARN"
Add-PatternCheck $cloudHtml 'serviceWorker\.register' "Offline" "Service worker" "Service worker kaydi mevcut." "Offline yeniden acilis icin service worker kaydi yok." "WARN"
Add-PatternCheck $cloudHtml '<link[^>]+rel=["'']manifest["'']' "Offline" "Web manifest" "PWA manifest baglantisi mevcut." "PWA manifest baglantisi yok." "WARN"
Add-PatternCheck $cloudAdapter 'persistentLocalCache|enableMultiTabIndexedDbPersistence|enableIndexedDbPersistence' "Offline" "Firestore offline cache" "Firestore kalici offline cache yapilandirmasi mevcut." "Firestore kalici offline cache yapilandirmasi yok." "WARN"

Write-Host ""
Write-Host "MIRAC ERP STATIC QA"
Write-Host ("=" * 72)
foreach ($result in $script:Results) {
  Write-Host ("[{0}] {1} :: {2}" -f $result.Status, $result.Area, $result.Name)
  Write-Host ("       {0}" -f $result.Detail)
}

$passCount = @($script:Results | Where-Object Status -eq "PASS").Count
$warnCount = @($script:Results | Where-Object Status -eq "WARN").Count
$failCount = @($script:Results | Where-Object Status -eq "FAIL").Count
Write-Host ("=" * 72)
Write-Host ("Ozet: PASS={0} WARN={1} FAIL={2}" -f $passCount, $warnCount, $failCount)
Write-Host "Salt-okuma kosusu: ag/API/Excel/Firebase verisi degistirilmedi."

if ($failCount -gt 0) { exit 1 }
if ($StrictWarnings -and $warnCount -gt 0) { exit 2 }
exit 0
