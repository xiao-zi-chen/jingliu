param(
    [string]$AndroidSdk = $env:ANDROID_HOME,
    [string]$JavaHome = $env:JAVA_HOME
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not $AndroidSdk) {
    foreach ($candidate in @($env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk", 'I:\AndroidSdk')) {
        if ($candidate -and (Test-Path -LiteralPath "$candidate\platforms\android-36")) { $AndroidSdk = $candidate; break }
    }
}
if (-not $AndroidSdk -or -not (Test-Path -LiteralPath "$AndroidSdk\platforms\android-36")) {
    throw 'Install Android SDK platform 36 and build-tools 36.0.0; pass -AndroidSdk with the SDK directory.'
}
if ((-not $JavaHome -or $JavaHome -match 'jdk-25') -and (Test-Path -LiteralPath 'E:\Java\jdk-21')) { $JavaHome = 'E:\Java\jdk-21' }
if (-not $JavaHome -or -not (Test-Path -LiteralPath "$JavaHome\bin\java.exe")) { throw 'Pass -JavaHome with a JDK 17 or 21 directory.' }
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidSdk
$env:ANDROID_SDK_ROOT = $AndroidSdk
$sdkProperty = 'sdk.dir=' + ($AndroidSdk -replace '\\', '/' -replace ':', '\:')
[IO.File]::WriteAllText((Join-Path $projectRoot 'android/local.properties'), $sdkProperty + "`n", [Text.Encoding]::ASCII)

& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Website build failed.' }

# Keep this project-specific signing identity for future install-over upgrades.
$signingDirectory = Join-Path $projectRoot '.android-signing'
$keystore = Join-Path $signingDirectory 'release.jks'
$signingProperties = Join-Path $signingDirectory 'signing.properties'
New-Item -ItemType Directory -Path $signingDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $keystore)) {
    $secret = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($secret)
    $rng.Dispose()
    $signingPassword = [Convert]::ToBase64String($secret)
    $env:JINGLIU_SIGNING_PASSWORD = $signingPassword
    try {
        & "$JavaHome\bin\keytool.exe" -genkeypair -keystore $keystore -alias jingliu -keyalg RSA -keysize 3072 -validity 10000 -storetype PKCS12 -storepass:env JINGLIU_SIGNING_PASSWORD -keypass:env JINGLIU_SIGNING_PASSWORD -dname 'CN=Jingliu, OU=Mobile, O=Jingliu, C=CN'
        if ($LASTEXITCODE -ne 0) { throw 'Could not generate the signing key.' }
        [IO.File]::WriteAllText($signingProperties, "storePassword=$signingPassword`n", [Text.Encoding]::ASCII)
    } finally { Remove-Item Env:JINGLIU_SIGNING_PASSWORD -ErrorAction SilentlyContinue }
}
if (-not (Test-Path -LiteralPath $signingProperties)) { throw 'The signing key exists but signing.properties is missing. Restore its matching password file before continuing.' }

$hasher = [Security.Cryptography.SHA256]::Create()
$projectHash = ([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot)))).Replace('-', '').Substring(0, 12)
$hasher.Dispose()
$nativeCache = Join-Path $env:LOCALAPPDATA "JingliuBuild\$projectHash"
$nativeBuildDir = Join-Path $nativeCache 'app'
New-Item -ItemType Directory -Path $nativeCache -Force | Out-Null
Push-Location -LiteralPath (Join-Path $projectRoot 'android')
try {
    & .\gradlew.bat --no-daemon --project-cache-dir (Join-Path $nativeCache 'gradle') "-PjingliuBuildDir=$nativeBuildDir" assembleRelease lintRelease
    if ($LASTEXITCODE -ne 0) { throw 'Android build or lint failed.' }
} finally { Pop-Location }

$releaseDirectory = Join-Path $projectRoot 'release'
New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
$appVersion = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$apkName = "jingliu-$appVersion.apk"
$apk = Join-Path $releaseDirectory $apkName
Copy-Item -LiteralPath (Join-Path $nativeBuildDir 'outputs/apk/release/app-release.apk') -Destination $apk -Force
& "$AndroidSdk\build-tools\36.0.0\apksigner.bat" verify --verbose $apk
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
$hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$apk.sha256", "$hash  $apkName`n", [Text.Encoding]::ASCII)
Write-Output "APK ready: $apk"
