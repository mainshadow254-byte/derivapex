[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$pbRoot = 'D:\pocketbase_0.39.4_windows_amd64'
$pb = Join-Path $pbRoot 'pocketbase.exe'
$data = Join-Path $pbRoot 'pb_data'
$migrations = Join-Path $PSScriptRoot 'pb_migrations'
$requiredCollections = @(
  'users', 'admins', 'subscriptions', 'payments', 'bots', 'audit_logs',
  'plans', 'system_settings', 'trades', 'strategies', 'copy_follows',
  'marketplace_listings', 'bot_reviews', 'bot_installs', 'notifications',
  'notification_prefs', 'devices', 'watchlists'
)
$coreAuthFields = @(
  'id', 'password', 'tokenKey', 'email', 'emailVisibility', 'verified',
  'name', 'avatar', 'created', 'updated'
)

function Assert-Path([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "$label not found: $path"
  }
}

function Export-Collections([string]$targetDir) {
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = ('y' | & $pb migrate collections --dir $data --migrationsDir $targetDir 2>&1 | Out-String)
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $oldPreference
  if ($exitCode -ne 0 -or $output -match '(?m)^Error:') {
    throw "Could not export collections for verification.`n$output"
  }

  $file = Get-ChildItem -LiteralPath $targetDir -Filter '*collections_snapshot.js' |
    Select-Object -First 1
  if (-not $file) { throw 'PocketBase did not create a verification snapshot.' }

  $raw = Get-Content -Raw -LiteralPath $file.FullName
  $start = $raw.IndexOf('const snapshot = ') + 'const snapshot = '.Length
  $end = $raw.IndexOf(';', $start)
  if ($start -lt 'const snapshot = '.Length -or $end -lt $start) {
    throw 'Could not parse the verification snapshot.'
  }
  return ($raw.Substring($start, $end - $start) | ConvertFrom-Json)
}

Assert-Path $pb 'PocketBase executable'
Assert-Path $data 'PocketBase data directory'
Assert-Path $migrations 'ApexBot migrations directory'

$running = @(Get-Process pocketbase -ErrorAction SilentlyContinue)
$wasRunning = $running.Count -gt 0
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$work = Join-Path $env:TEMP "apexbot-pb-migration-$stamp"
$backup = Join-Path $pbRoot "pb_data.backup-$stamp"
$migrationSucceeded = $false

try {
  if ($wasRunning) {
    Write-Host "Stopping PocketBase PID(s): $($running.Id -join ', ')"
    $running | Stop-Process -Force
    Start-Sleep -Milliseconds 800
  }
  if (Get-Process pocketbase -ErrorAction SilentlyContinue) {
    throw 'PocketBase is still running. Close it before retrying.'
  }

  Write-Host "Backing up pb_data to: $backup"
  Copy-Item -LiteralPath $data -Destination $backup -Recurse

  $before = Export-Collections (Join-Path $work 'before')
  $beforeUsers = $before | Where-Object name -eq 'users'
  if (-not $beforeUsers -or $beforeUsers.type -ne 'auth') {
    throw 'The existing users collection is not a valid auth collection.'
  }
  $beforeSystemNames = @($before | Where-Object system | ForEach-Object name)

  Write-Host 'Applying ApexBot PocketBase migration...'
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $migrationOutput = (& $pb migrate up --dir $data --migrationsDir $migrations 2>&1 | Out-String)
  $migrationExitCode = $LASTEXITCODE
  $ErrorActionPreference = $oldPreference
  Write-Host $migrationOutput.Trim()
  if ($migrationExitCode -ne 0 -or $migrationOutput -match '(?m)^Error:') {
    throw 'PocketBase migration failed. The pre-migration backup is available above.'
  }

  $after = Export-Collections (Join-Path $work 'after')
  $afterNames = @($after.name)
  $afterUsers = $after | Where-Object name -eq 'users'
  $missingCollections = @($requiredCollections | Where-Object { $_ -notin $afterNames })
  $deletedSystem = @($beforeSystemNames | Where-Object { $_ -notin $afterNames })
  $changedCoreFields = @()

  foreach ($fieldName in $coreAuthFields) {
    $beforeField = $beforeUsers.fields | Where-Object name -eq $fieldName
    $afterField = $afterUsers.fields | Where-Object name -eq $fieldName
    if (-not $beforeField -or -not $afterField) {
      $changedCoreFields += $fieldName
      continue
    }
    $beforeJson = $beforeField | ConvertTo-Json -Compress -Depth 20
    $afterJson = $afterField | ConvertTo-Json -Compress -Depth 20
    if ($beforeJson -ne $afterJson) { $changedCoreFields += $fieldName }
  }

  if ($afterUsers.type -ne 'auth') { throw 'users is no longer an auth collection.' }
  if ($changedCoreFields.Count) {
    throw "Built-in users fields changed: $($changedCoreFields -join ', ')"
  }
  if ($deletedSystem.Count) {
    throw "System collections were removed: $($deletedSystem -join ', ')"
  }
  if ($missingCollections.Count) {
    throw "Required collections are missing: $($missingCollections -join ', ')"
  }

  Write-Host ''
  Write-Host 'Verification passed:' -ForegroundColor Green
  Write-Host "  users type: $($afterUsers.type)"
  Write-Host '  built-in users fields changed: none'
  Write-Host '  deleted system collections: none'
  Write-Host "  required collections: $($requiredCollections -join ', ')"
  Write-Host "  backup: $backup"
  $migrationSucceeded = $true
}
finally {
  if ($wasRunning) {
    Write-Host 'Restarting PocketBase...'
    Start-Process -FilePath $pb `
      -ArgumentList @('serve', '--dir', $data, '--migrationsDir', $migrations) `
      -WorkingDirectory $pbRoot -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 2
  }
}

if (-not $migrationSucceeded) { exit 1 }

$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8090/api/health' -TimeoutSec 5
Write-Host "PocketBase health: $($health.code) $($health.message)" -ForegroundColor Green
