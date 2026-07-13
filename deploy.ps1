[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
    [string]$ExpectedProjectId,

    [switch]$PreflightOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$env:FIREBASE_CLI_DISABLE_UPDATE_CHECK = 'true'

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Find-FirebaseStandaloneCli {
    param([string]$BinDirectory)

    if (-not (Test-Path -LiteralPath $BinDirectory -PathType Container)) {
        throw "Standalone Firebase CLI bin klasoru bulunamadi: $BinDirectory"
    }

    $namePattern = '^(firebase-tools-(instant-)?win(-v?\d+\.\d+\.\d+)?|firebase)\.exe$'
    $candidates = @(Get-ChildItem -LiteralPath $BinDirectory -File -Filter '*.exe' |
        Where-Object { $_.Name -match $namePattern })

    if ($candidates.Count -eq 0) {
        throw "Resmi standalone Firebase CLI bin altinda bulunamadi: $BinDirectory"
    }

    $workingCandidates = foreach ($candidate in $candidates) {
        $versionOutput = & $candidate.FullName --version 2>$null
        if ($LASTEXITCODE -eq 0 -and "$versionOutput" -match '(\d+\.\d+\.\d+)') {
            [PSCustomObject]@{
                Path = $candidate.FullName
                Version = [version]$Matches[1]
            }
        }
    }

    if (@($workingCandidates).Count -eq 0) {
        throw 'Bin altindaki Firebase CLI dosyalari calistirilamadi veya surumu dogrulanamadi.'
    }

    return @($workingCandidates | Sort-Object Version -Descending)[0]
}

function Read-JsonFile {
    param([string]$Path)

    try {
        return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        throw "Gecersiz JSON dosyasi: $Path`n$($_.Exception.Message)"
    }
}

function Get-JavaScriptStringProperty {
    param(
        [string]$Content,
        [string]$PropertyName
    )

    $pattern = '(?m)\b' + [regex]::Escape($PropertyName) + '\s*:\s*["'']([^"'']+)["'']'
    $match = [regex]::Match($Content, $pattern)
    if (-not $match.Success) {
        throw "JavaScript ayari bulunamadi: $PropertyName"
    }
    return $match.Groups[1].Value
}

function Assert-ContainsText {
    param(
        [string]$Content,
        [string]$Expected,
        [string]$Description
    )

    if ($Content.IndexOf($Expected, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "$Description bulunamadi: $Expected"
    }
}

function Invoke-FirebaseJson {
    param(
        [string]$CliPath,
        [string[]]$Arguments,
        [string]$ErrorFile
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Firebase CLI ilerleme satirlarini stderr'e yazar. Windows PowerShell,
        # basarili komutlarda bile bunlari NativeCommandError olarak yukseltebilir.
        $ErrorActionPreference = 'Continue'
        $stdout = & $CliPath @Arguments 2> $ErrorFile
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    $stderr = if (Test-Path -LiteralPath $ErrorFile) {
        Get-Content -LiteralPath $ErrorFile -Raw -ErrorAction SilentlyContinue
    }
    else {
        ''
    }

    if ($exitCode -ne 0) {
        throw "Firebase CLI komutu basarisiz: firebase $($Arguments -join ' ')`n$stderr"
    }

    $jsonText = (@($stdout) | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
    try {
        return $jsonText | ConvertFrom-Json
    }
    catch {
        throw "Firebase CLI JSON cikisi okunamadi: firebase $($Arguments -join ' ')"
    }
}

$root = [IO.Path]::GetFullPath($PSScriptRoot)
$binDirectory = Join-Path $root 'bin'
$firebaseJsonPath = Join-Path $root 'firebase.json'
$firebaseRcPath = Join-Path $root '.firebaserc'
$publicPath = Join-Path $root 'public'
$rulesPath = Join-Path $root 'firestore.rules'
$indexesPath = Join-Path $root 'firestore.indexes.json'
$indexHtmlPath = Join-Path $publicPath 'index.html'
$cloudModulePath = Join-Path $publicPath 'firebase-cloud.js'
$webConfigPath = Join-Path $publicPath 'firebase-config.js'

Write-Step 'Yerel dagitim yapisi kontrol ediliyor'

foreach ($requiredPath in @(
    $firebaseJsonPath,
    $publicPath,
    $rulesPath,
    $indexesPath,
    $indexHtmlPath,
    $cloudModulePath,
    $webConfigPath
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Gerekli yol bulunamadi: $requiredPath"
    }
}

$firebaseConfig = Read-JsonFile -Path $firebaseJsonPath
$indexesConfig = Read-JsonFile -Path $indexesPath

if ([string]$firebaseConfig.hosting.public -cne 'public') {
    throw "firebase.json hosting.public degeri 'public' olmali."
}

if ([string]$firebaseConfig.firestore.rules -cne 'firestore.rules') {
    throw "firebase.json firestore.rules degeri 'firestore.rules' olmali."
}

if ([string]$firebaseConfig.firestore.indexes -cne 'firestore.indexes.json') {
    throw "firebase.json firestore.indexes degeri 'firestore.indexes.json' olmali."
}

if ($null -eq $indexesConfig.indexes -or $null -eq $indexesConfig.fieldOverrides) {
    throw 'firestore.indexes.json hem indexes hem fieldOverrides dizilerini icermeli.'
}

$hostingHeaders = @($firebaseConfig.hosting.headers)
$cspHeader = @($hostingHeaders | ForEach-Object { @($_.headers) } |
    Where-Object { [string]$_.key -ieq 'Content-Security-Policy' })
if ($cspHeader.Count -ne 1) {
    throw 'firebase.json tam bir Content-Security-Policy header tanimi icermeli.'
}

$csp = [string]$cspHeader[0].value
foreach ($requiredCspSource in @(
    'https://www.gstatic.com',
    'https://identitytoolkit.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://firestore.googleapis.com',
    'https://*.googleapis.com',
    'https://*.firebaseapp.com'
)) {
    Assert-ContainsText -Content $csp -Expected $requiredCspSource -Description 'CSP Firebase kaynagi'
}

foreach ($forbiddenCspSource in @('localhost', '127.0.0.1', 'script.google')) {
    if ($csp.IndexOf($forbiddenCspSource, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        throw "Bulut uretim CSP'sinde eski kaynak bulundu: $forbiddenCspSource"
    }
}

$indexHtml = Get-Content -LiteralPath $indexHtmlPath -Raw -Encoding UTF8
$cloudModule = Get-Content -LiteralPath $cloudModulePath -Raw -Encoding UTF8
$webConfig = Get-Content -LiteralPath $webConfigPath -Raw -Encoding UTF8
$rulesContent = Get-Content -LiteralPath $rulesPath -Raw -Encoding UTF8

Assert-ContainsText -Content $indexHtml -Expected './firebase-cloud.js' -Description 'index.html bulut modul importu'
Assert-ContainsText -Content $cloudModule -Expected 'https://www.gstatic.com/firebasejs/' -Description 'Firebase SDK resmi modul kaynagi'

if ($webConfig -match 'YOUR_|CHANGE_ME|REPLACE_WITH|BEGIN PRIVATE KEY|service_account') {
    throw 'public/firebase-config.js placeholder veya yasakli gizli anahtar iceriyor.'
}

$webProjectId = Get-JavaScriptStringProperty -Content $webConfig -PropertyName 'projectId'
$webAuthDomain = Get-JavaScriptStringProperty -Content $webConfig -PropertyName 'authDomain'
if ($webProjectId -cne $ExpectedProjectId) {
    throw "Web Firebase proje kimligi eslesmiyor. firebase-config.js='$webProjectId', beklenen='$ExpectedProjectId'."
}
if ($webAuthDomain -notmatch '^[a-z0-9-]+\.firebaseapp\.com$') {
    throw "firebase-config.js authDomain resmi firebaseapp.com alani olmali: $webAuthDomain"
}

$collectionsMatch = [regex]::Match(
    $cloudModule,
    '(?s)const\s+COLLECTIONS\s*=\s*\[(.*?)\]\s*;'
)
if (-not $collectionsMatch.Success) {
    throw 'firebase-cloud.js COLLECTIONS listesi okunamadi.'
}
$cloudCollections = @([regex]::Matches($collectionsMatch.Groups[1].Value, '["'']([^"'']+)["'']') |
    ForEach-Object { $_.Groups[1].Value })
if ($cloudCollections.Count -eq 0) {
    throw 'firebase-cloud.js en az bir Firestore koleksiyonu tanimlamali.'
}
foreach ($collectionName in $cloudCollections) {
    $rulesPattern = 'match\s+/orgs/\{orgId\}/' + [regex]::Escape($collectionName) + '/\{[^}]+\}'
    if ($rulesContent -notmatch $rulesPattern) {
        throw "Firestore rules koleksiyon kapsami eksik: orgs/{orgId}/$collectionName/{docId}"
    }
}

if (-not (Test-Path -LiteralPath $firebaseRcPath -PathType Leaf)) {
    throw ".firebaserc bulunamadi. .firebaserc.example dosyasini .firebaserc olarak kopyalayip gercek proje kimligini yazin."
}

$firebaseRc = Read-JsonFile -Path $firebaseRcPath
$configuredProjectId = [string]$firebaseRc.projects.default

if ([string]::IsNullOrWhiteSpace($configuredProjectId) -or
    $configuredProjectId -eq 'REPLACE_WITH_FIREBASE_PROJECT_ID') {
    throw '.firebaserc icindeki projects.default gercek Firebase proje kimligi olmali.'
}

if ($configuredProjectId -cne $ExpectedProjectId) {
    throw "Proje kimligi eslesmiyor. .firebaserc='$configuredProjectId', beklenen='$ExpectedProjectId'. Dagitim durduruldu."
}

$firebaseCli = Find-FirebaseStandaloneCli -BinDirectory $binDirectory
Write-Host "Firebase CLI: $($firebaseCli.Path) (v$($firebaseCli.Version))"
Write-Host "Beklenen proje: $ExpectedProjectId" -ForegroundColor Yellow

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$runtimeDirectory = Join-Path $tempBase ("mirac-firebase-deploy-" + [guid]::NewGuid().ToString('N'))
$runtimeConfigPath = Join-Path $runtimeDirectory 'firebase.json'
$loginErrorPath = Join-Path $runtimeDirectory 'login-list.err'
$projectsErrorPath = Join-Path $runtimeDirectory 'projects-list.err'
$locationPushed = $false

try {
    New-Item -ItemType Directory -Path $runtimeDirectory | Out-Null

    Write-Step 'Firebase oturumu dogrulaniyor'
    $needsLogin = $false
    try {
        $loginResponse = Invoke-FirebaseJson -CliPath $firebaseCli.Path `
            -Arguments @('login:list', '--json') -ErrorFile $loginErrorPath
        $loginEntries = @($loginResponse.result | Where-Object { $null -ne $_ })
        $needsLogin = $loginEntries.Count -eq 0
    }
    catch {
        $needsLogin = $true
    }

    if ($needsLogin) {
        Write-Host ''
        Write-Host 'KULLANICI ADIMI: Acilan resmi Google sayfasinda hesabi secin ve Firebase CLI iznini onaylayin.' -ForegroundColor Yellow
        Write-Host 'Bunun disinda proje secmeyin veya elle deploy komutu calistirmayin.' -ForegroundColor Yellow
        $previousErrorActionPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $firebaseCli.Path login
        $loginExitCode = $LASTEXITCODE
        $ErrorActionPreference = $previousErrorActionPreference
        if ($loginExitCode -ne 0) {
            throw 'Google/Firebase girisi tamamlanmadi. Dagitim yapilmadi.'
        }

        $loginResponse = Invoke-FirebaseJson -CliPath $firebaseCli.Path `
            -Arguments @('login:list', '--json') -ErrorFile $loginErrorPath
        $loginEntries = @($loginResponse.result | Where-Object { $null -ne $_ })
        if ($loginEntries.Count -eq 0) {
            throw 'Firebase CLI girisi dogrulanamadi. Dagitim yapilmadi.'
        }
    }

    Write-Step 'Hesabin hedef projeye erisimi dogrulaniyor'
    $projectsResponse = Invoke-FirebaseJson -CliPath $firebaseCli.Path `
        -Arguments @('projects:list', '--json') -ErrorFile $projectsErrorPath
    $matchingProjects = @($projectsResponse.result |
        Where-Object { [string]$_.projectId -ceq $ExpectedProjectId })

    if ($matchingProjects.Count -ne 1) {
        throw "Oturum acik hesap '$ExpectedProjectId' projesini tam olarak bir kez goremiyor. Dagitim durduruldu."
    }

    $targetProject = $matchingProjects[0]
    Write-Host "Dogrulanan hedef: $($targetProject.projectId) | $($targetProject.displayName) | $($targetProject.projectNumber)" -ForegroundColor Green

    Write-Step 'Degismez dagitim kopyasi hazirlaniyor'
    Copy-Item -LiteralPath $firebaseJsonPath -Destination $runtimeConfigPath
    Copy-Item -LiteralPath $rulesPath -Destination (Join-Path $runtimeDirectory 'firestore.rules')
    Copy-Item -LiteralPath $indexesPath -Destination (Join-Path $runtimeDirectory 'firestore.indexes.json')
    Copy-Item -LiteralPath $publicPath -Destination (Join-Path $runtimeDirectory 'public') -Recurse

    Write-Step 'Rules, indexes ve Hosting cloud preflight calistiriliyor'
    Push-Location $runtimeDirectory
    $locationPushed = $true
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $firebaseCli.Path deploy `
        --config $runtimeConfigPath `
        --project $ExpectedProjectId `
        --only 'firestore:rules,firestore:indexes,hosting' `
        --dry-run `
        --non-interactive
    $preflightExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference

    if ($preflightExitCode -ne 0) {
        throw 'Firebase cloud preflight basarisiz oldu. Hicbir release baslatilmadi.'
    }

    if ($PreflightOnly) {
        Write-Host 'On kontrol tamamlandi. -PreflightOnly nedeniyle release yapilmadi.' -ForegroundColor Green
        return
    }

    Write-Step "Firestore rules ve Hosting dagitiliyor: $ExpectedProjectId"
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $firebaseCli.Path deploy `
        --config $runtimeConfigPath `
        --project $ExpectedProjectId `
        --only 'firestore:rules,hosting' `
        --non-interactive
    $deployExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference

    if ($deployExitCode -ne 0) {
        throw 'Firebase rules/hosting dagitimi basarisiz oldu.'
    }

    Write-Host "Dagitim tamamlandi: $ExpectedProjectId" -ForegroundColor Green
}
finally {
    if ($locationPushed) {
        Pop-Location
    }

    if (Test-Path -LiteralPath $runtimeDirectory) {
        $resolvedRuntime = [IO.Path]::GetFullPath($runtimeDirectory)
        $runtimeName = [IO.Path]::GetFileName($resolvedRuntime)
        $isSafeTempPath = $resolvedRuntime.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase) -and
            $runtimeName.StartsWith('mirac-firebase-deploy-', [StringComparison]::Ordinal)

        if ($isSafeTempPath) {
            Remove-Item -LiteralPath $resolvedRuntime -Recurse -Force
        }
        else {
            Write-Warning "Gecici klasor guvenlik kontrolunden gecmedi; silinmedi: $resolvedRuntime"
        }
    }
}
