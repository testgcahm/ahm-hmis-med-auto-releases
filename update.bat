<# :
@echo off
setlocal
title HMIS Med Auto - Extension Auto-Updater
color 0F
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression (Get-Content -LiteralPath '%~f0' -Raw)"
exit /b %errorlevel%
#>

# HMIS Med Auto - Automated Extension Updater
$Host.UI.RawUI.WindowTitle = "HMIS Med Auto - Extension Auto-Updater"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "                 HMIS Med Auto - Extension Auto-Updater               " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Fetch Remote Release Metadata
Write-Host "[1/4] Checking latest release from server..." -ForegroundColor Yellow

$remoteMeta = $null
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$primaryVersionUrl = "https://raw.githubusercontent.com/testgcahm/ahm-hmis-med-auto-releases/main/version.json?t=$timestamp"
$fallbackVersionUrl = "https://hmis-ahm-gmc.vercel.app/version.json?t=$timestamp"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Fetch-ReleaseJson($url) {
    try {
        if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
            $raw = & curl.exe -s -f -L -H "Cache-Control: no-cache" -H "Pragma: no-cache" $url
            if ($raw) {
                return ($raw | ConvertFrom-Json -ErrorAction SilentlyContinue)
            }
        }
    } catch {}

    try {
        $res = Invoke-WebRequest -Uri $url -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" } -ErrorAction Stop
        if ($res.Content) {
            return ($res.Content | ConvertFrom-Json -ErrorAction SilentlyContinue)
        }
    } catch {}

    try {
        $wc = New-Object Net.WebClient
        $wc.Headers.Add("Cache-Control", "no-cache")
        $wc.Headers.Add("Pragma", "no-cache")
        $raw = $wc.DownloadString($url)
        if ($raw) {
            return ($raw | ConvertFrom-Json -ErrorAction SilentlyContinue)
        }
    } catch {}

    return $null
}

function Compare-SemVer([string]$v1, [string]$v2) {
    if (-not $v1 -or -not $v2) { return 0 }
    $c1 = ($v1 -replace '^[vV]', '' -replace '-.*$', '').Trim()
    $c2 = ($v2 -replace '^[vV]', '' -replace '-.*$', '').Trim()
    $p1 = $c1.Split('.') | ForEach-Object { [int]($_ -replace '\D', '0') }
    $p2 = $c2.Split('.') | ForEach-Object { [int]($_ -replace '\D', '0') }
    $maxLen = [Math]::Max($p1.Count, $p2.Count)
    for ($i = 0; $i -lt $maxLen; $i++) {
        $n1 = if ($i -lt $p1.Count) { $p1[$i] } else { 0 }
        $n2 = if ($i -lt $p2.Count) { $p2[$i] } else { 0 }
        if ($n1 -gt $n2) { return 1 }
        if ($n1 -lt $n2) { return -1 }
    }
    return 0
}

$remoteMeta = Fetch-ReleaseJson $primaryVersionUrl
if (-not $remoteMeta) {
    $remoteMeta = Fetch-ReleaseJson $fallbackVersionUrl
}

if ($remoteMeta) {
    $stableVer = if ($remoteMeta.versionName) { $remoteMeta.versionName } else { $remoteMeta.version }
    $betaVer = if ($remoteMeta.betaVersionName) { $remoteMeta.betaVersionName } else { $remoteMeta.betaVersion }
    Write-Host "  Latest Available: Stable v$stableVer | Beta v$betaVer" -ForegroundColor Green
    if ($remoteMeta.releaseDate) {
        Write-Host "  Release Date:     $($remoteMeta.releaseDate)" -ForegroundColor Gray
    }
} else {
    Write-Host "  [WARNING] Could not fetch online release metadata. Using default download endpoints." -ForegroundColor Yellow
}

Write-Host ""

# 2. Discover installed HMIS extension directories across all browsers
Write-Host "[2/4] Scanning for installed HMIS Med Auto extensions..." -ForegroundColor Yellow

$browserBases = @(
    @{ Name = "Google Chrome"; Base = "$env:LOCALAPPDATA\Google\Chrome\User Data"; Exe = "chrome.exe" },
    @{ Name = "Microsoft Edge"; Base = "$env:LOCALAPPDATA\Microsoft\Edge\User Data"; Exe = "msedge.exe" },
    @{ Name = "Brave Browser"; Base = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data"; Exe = "brave.exe" },
    @{ Name = "Vivaldi"; Base = "$env:LOCALAPPDATA\Vivaldi\User Data"; Exe = "vivaldi.exe" },
    @{ Name = "Opera"; Base = "$env:APPDATA\Opera Software\Opera Stable"; Exe = "opera.exe" }
)

$detected = @()

foreach ($b in $browserBases) {
    if (Test-Path $b.Base) {
        $prefFiles = Get-ChildItem -Path $b.Base -Include "Preferences", "Secure Preferences" -Recurse -Depth 3 -ErrorAction SilentlyContinue
        foreach ($f in $prefFiles) {
            try {
                $content = Get-Content -Path $f.FullName -Raw -ErrorAction SilentlyContinue
                if ($content -match 'HMIS|hmis|fkcdnafgnjakdcacbfekbifiifobggka') {
                    $json = $content | ConvertFrom-Json -ErrorAction SilentlyContinue
                    if ($json.extensions.settings) {
                        foreach ($prop in $json.extensions.settings.PSObject.Properties) {
                            $p = $prop.Value.path
                            if ($p -and (Test-Path $p)) {
                                $mPath = Join-Path $p "manifest.json"
                                if (Test-Path $mPath) {
                                    $m = Get-Content $mPath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
                                    if ($m.name -like "*HMIS Med Auto*") {
                                        $resolved = (Resolve-Path $p).Path
                                        $existing = $detected | Where-Object { $_.Path -eq $resolved }
                                        if (-not $existing) {
                                            $isBeta = ($m.name -like "*Beta*") -or ($m.version_name -like "*beta*") -or ($m.version.Split('.').Count -gt 3)
                                            $detected += [PSCustomObject]@{
                                                Path = $resolved
                                                Name = $m.name
                                                Version = $m.version
                                                IsBeta = $isBeta
                                                Browser = $b.Name
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch {}
        }
    }
}

# If no browser-registered extension found, check current folder or parent
if ($detected.Count -eq 0) {
    $curDir = (Get-Location).Path
    if ($curDir -and (Test-Path (Join-Path $curDir "manifest.json"))) {
        $m = Get-Content (Join-Path $curDir "manifest.json") -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($m -and $m.name -like "*HMIS Med Auto*") {
            $isBeta = ($m.name -like "*Beta*") -or ($m.version_name -like "*beta*") -or ($m.version.Split('.').Count -gt 3)
            $detected += [PSCustomObject]@{
                Path = $curDir
                Name = $m.name
                Version = $m.version
                IsBeta = $isBeta
                Browser = "Current Directory"
            }
        }
    }
}

if ($detected.Count -eq 0) {
    Write-Host "[WARNING] No browser-registered extension found automatically." -ForegroundColor Yellow
    $manual = Read-Host "Please enter or drag-and-drop your extension folder path"
    if ($manual) {
        $manualClean = $manual.Trim([char]34, [char]39, [char]32)
        if (Test-Path $manualClean) {
            $resolved = (Resolve-Path $manualClean).Path
            $isBeta = $false
            $curVer = "Unknown"
            $mPath = Join-Path $resolved "manifest.json"
            if (Test-Path $mPath) {
                try {
                    $m = Get-Content $mPath -Raw | ConvertFrom-Json
                    $isBeta = ($m.name -like "*Beta*") -or ($m.version_name -like "*beta*")
                    $curVer = $m.version
                } catch {}
            }
            $detected += [PSCustomObject]@{
                Path = $resolved
                Name = "HMIS Med Auto"
                Version = $curVer
                IsBeta = $isBeta
                Browser = "Custom Folder"
            }
        }
    }
}

if ($detected.Count -eq 0) {
    Write-Host "[ERROR] No valid target directory found. Update cancelled." -ForegroundColor Red
    exit 1
}

# Select target installation(s)
$targetDirectories = @()

if ($detected.Count -eq 1) {
    $targetDirectories = $detected
    $channel = if ($detected[0].IsBeta) { "Beta" } else { "Stable" }
    Write-Host "  Found: $($detected[0].Browser) at $($detected[0].Path)" -ForegroundColor White
    Write-Host "  Current Installed Version: $channel v$($detected[0].Version)" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "Found multiple extension installations:" -ForegroundColor White
    for ($i = 0; $i -lt $detected.Count; $i++) {
        $d = $detected[$i]
        $ch = if ($d.IsBeta) { "Beta" } else { "Stable" }
        Write-Host "  [$($i+1)] $($d.Browser): $($d.Path) ($ch v$($d.Version))" -ForegroundColor White
    }
    $allIdx = $detected.Count + 1
    Write-Host "  [$allIdx] Update All Installations (Recommended)" -ForegroundColor White
    Write-Host ""

    $choice = Read-Host "Select which installation to update [1-$allIdx, default $allIdx]"
    if (-not $choice) { $choice = [string]$allIdx }

    if ($choice -eq [string]$allIdx) {
        $targetDirectories = $detected
    } elseif ($choice -match '^\d+$') {
        $selIdx = [int]$choice - 1
        if ($selIdx -ge 0 -and $selIdx -lt $detected.Count) {
            $targetDirectories = @($detected[$selIdx])
        } else {
            $targetDirectories = $detected
        }
    } else {
        $targetDirectories = $detected
    }
}

Write-Host ""

# 3. Update Pipeline (Download -> Extract -> Copy with Robocopy)
$tempRoot = Join-Path $env:TEMP ("hmis_pkg_" + (Get-Random))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
    $needsBeta = @($targetDirectories | Where-Object { $_.IsBeta }).Count -gt 0
    $needsStable = @($targetDirectories | Where-Object { -not $_.IsBeta }).Count -gt 0

    $packages = @{}

    # Helper function to acquire and extract package
    function Get-UpdatePackage {
        param(
            [string]$zipName,
            [string]$remoteUrl,
            [string]$destDir,
            [string]$targetChannel,
            [string]$expectedVer
        )

        $targetZip = Join-Path $tempRoot $zipName
        $sep = if ($remoteUrl.Contains('?')) { '&' } else { '?' }
        $cacheBustUrl = $remoteUrl + $sep + "_t=" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

        Write-Host "  Downloading latest $targetChannel package..." -ForegroundColor Gray
        $downloaded = $false

        # 1. Try curl.exe with no-cache headers
        if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
            try {
                & curl.exe -s -f -L -H "Cache-Control: no-cache" -H "Pragma: no-cache" $cacheBustUrl -o $targetZip
                if ((Test-Path $targetZip) -and ((Get-Item $targetZip).Length -gt 1000)) {
                    $downloaded = $true
                }
            } catch {}
        }

        # 2. Fallback to Invoke-WebRequest
        if (-not $downloaded) {
            try {
                Invoke-WebRequest -Uri $cacheBustUrl -OutFile $targetZip -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" } -ErrorAction Stop
                if ((Test-Path $targetZip) -and ((Get-Item $targetZip).Length -gt 1000)) {
                    $downloaded = $true
                }
            } catch {}
        }

        # 3. Fallback to Net.WebClient
        if (-not $downloaded) {
            try {
                $wc = New-Object Net.WebClient
                $wc.Headers.Add("Cache-Control", "no-cache")
                $wc.Headers.Add("Pragma", "no-cache")
                $wc.DownloadFile($cacheBustUrl, $targetZip)
                if ((Test-Path $targetZip) -and ((Get-Item $targetZip).Length -gt 1000)) {
                    $downloaded = $true
                }
            } catch {}
        }

        # 4. Fallback: Only if remote download completely failed (e.g. offline)
        if (-not $downloaded) {
            Write-Host "  [WARNING] Remote download failed. Checking for local backup package..." -ForegroundColor Yellow
            $candidatePaths = @()
            $curDir = (Get-Location).Path
            if ($curDir) {
                $candidatePaths += (Join-Path $curDir $zipName)
                $parent = Split-Path -Parent $curDir
                if ($parent) { $candidatePaths += (Join-Path $parent $zipName) }
            }
            if ($env:USERPROFILE) {
                $candidatePaths += (Join-Path "$env:USERPROFILE\Downloads" $zipName)
            }

            foreach ($lp in $candidatePaths) {
                if ($lp -and (Test-Path $lp) -and ((Get-Item $lp).Length -gt 1000)) {
                    Write-Host "  Using local fallback package: $lp" -ForegroundColor Gray
                    Copy-Item $lp -Destination $targetZip -Force
                    $downloaded = $true
                    break
                }
            }
        }

        if (-not (Test-Path $targetZip) -or ((Get-Item $targetZip).Length -le 1000)) {
            throw "Failed to acquire update package: $zipName (Check your internet connection)"
        }

        Write-Host "  Extracting $zipName..." -ForegroundColor Gray
        Expand-Archive -LiteralPath $targetZip -DestinationPath $destDir -Force

        # Locate directory containing manifest.json
        $manifestFile = Get-ChildItem -Path $destDir -Filter "manifest.json" -Recurse | Select-Object -First 1
        if (-not $manifestFile) {
            throw "Invalid package structure: manifest.json not found in $zipName"
        }

        $pkgManifest = Get-Content $manifestFile.FullName -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
        $pkgVer = if ($pkgManifest.version_name) { $pkgManifest.version_name } else { $pkgManifest.version }

        # If downloaded remote zip is older than expected release version, check if a local build is newer
        if ($expectedVer -and (Compare-SemVer $pkgVer $expectedVer) -lt 0) {
            $candidatePaths = @()
            $curDir = (Get-Location).Path
            if ($curDir) {
                $candidatePaths += (Join-Path $curDir $zipName)
                $parent = Split-Path -Parent $curDir
                if ($parent) { $candidatePaths += (Join-Path $parent $zipName) }
                $candidatePaths += (Join-Path $curDir "vercel-public\$zipName")
                $candidatePaths += (Join-Path $parent "vercel-public\$zipName")
            }
            if ($env:USERPROFILE) {
                $candidatePaths += (Join-Path "$env:USERPROFILE\Downloads" $zipName)
            }

            $foundLocal = $false
            foreach ($lp in $candidatePaths) {
                if ($lp -and (Test-Path $lp) -and ((Get-Item $lp).Length -gt 1000)) {
                    $localDest = Join-Path $tempRoot ("local_check_" + (Get-Random))
                    try {
                        Expand-Archive -LiteralPath $lp -DestinationPath $localDest -Force
                        $localMf = Get-ChildItem -Path $localDest -Filter "manifest.json" -Recurse | Select-Object -First 1
                        if ($localMf) {
                            $localJson = Get-Content $localMf.FullName -Raw | ConvertFrom-Json
                            $localVer = if ($localJson.version_name) { $localJson.version_name } else { $localJson.version }
                            if ((Compare-SemVer $localVer $pkgVer) -gt 0) {
                                Write-Host "  [INFO] Remote package was still propagating (v$pkgVer). Using local build (v$localVer)." -ForegroundColor Yellow
                                $foundLocal = $true
                                return @{
                                    Dir = $localMf.DirectoryName
                                    Version = $localVer
                                }
                            }
                        }
                    } catch {}
                }
            }

            if (-not $foundLocal) {
                Write-Host "  [NOTE] Server metadata indicates v$expectedVer, but remote zip is currently v$pkgVer (CDN cache / deploying)." -ForegroundColor Yellow
            }
        }

        Write-Host "  [OK] $targetChannel package ready (v$pkgVer)" -ForegroundColor Green

        return @{
            Dir = $manifestFile.DirectoryName
            Version = $pkgVer
        }
    }

    Write-Host "[3/4] Preparing update packages..." -ForegroundColor Yellow

    if ($needsStable) {
        $stableUrl = if ($remoteMeta -and $remoteMeta.links -and $remoteMeta.links.stableZip) { $remoteMeta.links.stableZip } else { "https://hmis-ahm-gmc.vercel.app/extension.zip" }
        $stableExtract = Join-Path $tempRoot "stable_extracted"
        $packages["Stable"] = Get-UpdatePackage -zipName "extension.zip" -remoteUrl $stableUrl -destDir $stableExtract -targetChannel "Stable" -expectedVer $stableVer
    }

    if ($needsBeta) {
        $betaUrl = if ($remoteMeta -and $remoteMeta.links -and $remoteMeta.links.betaZip) { $remoteMeta.links.betaZip } else { "https://hmis-ahm-gmc.vercel.app/beta.zip" }
        $betaExtract = Join-Path $tempRoot "beta_extracted"
        $packages["Beta"] = Get-UpdatePackage -zipName "beta.zip" -remoteUrl $betaUrl -destDir $betaExtract -targetChannel "Beta" -expectedVer $betaVer
    }

    Write-Host ""
    Write-Host "[4/4] Updating files in target directory(ies)..." -ForegroundColor Yellow

    $updatedCount = 0
    $alreadyLatestCount = 0
    $skippedCount = 0
    $lastVerifiedVersion = ""

    foreach ($t in $targetDirectories) {
        $pkgKey = if ($t.IsBeta) { "Beta" } else { "Stable" }
        $pkgInfo = $packages[$pkgKey]
        if (-not $pkgInfo -or -not $pkgInfo.Dir -or -not (Test-Path $pkgInfo.Dir)) {
            throw "Update package for $pkgKey is invalid or failed to extract."
        }
        $srcDir = $pkgInfo.Dir
        $oldVer = $t.Version
        $pkgVer = $pkgInfo.Version

        $cmp = Compare-SemVer $pkgVer $oldVer
        if ($cmp -lt 0) {
            Write-Host "  -> Skipping $($t.Browser) ($pkgKey): Installed version (v$oldVer) is newer than package (v$pkgVer)." -ForegroundColor Yellow
            $skippedCount++
            continue
        }

        Write-Host "  -> Updating $($t.Browser) ($pkgKey) at: $($t.Path)" -ForegroundColor White

        # Mirror files using robocopy
        & robocopy $srcDir $t.Path /E /IS /IT /W:1 /R:2 /NP /NJH /NJS | Out-Null

        # Verify updated manifest version
        $newVersion = "Unknown"
        $mPath = Join-Path $t.Path "manifest.json"
        if (Test-Path $mPath) {
            try {
                $mJson = Get-Content $mPath -Raw | ConvertFrom-Json
                $newVersion = if ($mJson.version_name) { $mJson.version_name } else { $mJson.version }
            } catch {}
        }
        $lastVerifiedVersion = $newVersion

        # Write completion signal for the running extension to read and auto-reload
        try {
            $completeSignal = @{
                version = $newVersion
                updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                success = $true
            } | ConvertTo-Json
            Set-Content -Path (Join-Path $t.Path "update_complete.json") -Value $completeSignal -Force
        } catch {}

        if ($oldVer -ne $newVersion -and (Compare-SemVer $newVersion $oldVer) -gt 0) {
            Write-Host "     [OK] Upgraded successfully: v$oldVer -> v$newVersion" -ForegroundColor Green
            $updatedCount++
        } else {
            Write-Host "     [OK] Extension files refreshed & verified (v$newVersion)" -ForegroundColor Green
            $alreadyLatestCount++
        }
    }

    Write-Host ""
    if ($updatedCount -gt 0) {
        Write-Host "======================================================================" -ForegroundColor Green
        Write-Host " SUCCESS: HMIS Med Auto updated successfully to v$lastVerifiedVersion!" -ForegroundColor Green
        Write-Host "======================================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host " [INFO] An update signal has been sent to the extension." -ForegroundColor Cyan
        Write-Host " [INFO] The extension will automatically reload in your browser momentarily." -ForegroundColor White
        Write-Host "        (Or click 'Reload' at chrome://extensions anytime)" -ForegroundColor Gray
    } elseif ($alreadyLatestCount -gt 0) {
        Write-Host "======================================================================" -ForegroundColor Cyan
        Write-Host " UP TO DATE: HMIS Med Auto is already at v$lastVerifiedVersion!" -ForegroundColor Cyan
        Write-Host "======================================================================" -ForegroundColor Cyan
        Write-Host " [INFO] Extension files verified & reloaded." -ForegroundColor Gray
    } else {
        Write-Host "======================================================================" -ForegroundColor Yellow
        Write-Host " NO CHANGES: Extension is already on the latest available version." -ForegroundColor Yellow
        Write-Host "======================================================================" -ForegroundColor Yellow
    }
    Write-Host ""
    for ($i = 3; $i -gt 0; $i--) {
        Write-Host "`r Window closing in $i second(s)..." -NoNewline -ForegroundColor Gray
        Start-Sleep -Seconds 1
    }
    Write-Host "`r Done. Closing window...                " -ForegroundColor Gray

} catch {
    Write-Host ""
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    for ($i = 5; $i -gt 0; $i--) {
        Write-Host "`r Window closing in $i second(s)..." -NoNewline -ForegroundColor Gray
        Start-Sleep -Seconds 1
    }
} finally {
    if (Test-Path $tempRoot) {
        Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
