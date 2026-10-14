[CmdletBinding()]
param(
  [string]$ProjectId,
  [switch]$ConfirmDevelopment,
  [System.Security.SecureString]$DevelopmentKey,
  [string]$Directory = (Join-Path $env:LOCALAPPDATA 'Staynex\development-evaluation')
)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmDevelopment) {
  throw 'Use -ConfirmDevelopment only for a new, authorized DEVELOPMENT project key. Never use a deployed key.'
}
if (-not $ProjectId) { $ProjectId = Read-Host 'Development project ID (proj_..., not a secret)' }
if ($ProjectId -notmatch '^proj_[A-Za-z0-9_-]+$') { throw 'A development project identifier is required.' }
$destination = [IO.Path]::GetFullPath($Directory)
if (Test-Path -LiteralPath $destination) {
  if ((Test-Path -LiteralPath (Join-Path $destination 'openai-key.dpapi')) -or
      (Test-Path -LiteralPath (Join-Path $destination 'provenance.json'))) {
    throw 'Development credentials already exist at this destination; no files were replaced.'
  }
}
if (-not $DevelopmentKey) { $DevelopmentKey = Read-Host 'Paste the NEW development key here (hidden; never paste it into chat)' -AsSecureString }
if ($DevelopmentKey.Length -lt 20) { throw 'The development key is empty or too short.' }
# Windows DPAPI protects this value for the current account. No plaintext key,
# process environment change, provider request or Git operation occurs here.
$protected = ConvertFrom-SecureString -SecureString $DevelopmentKey
[IO.Directory]::CreateDirectory($destination) | Out-Null
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $destination 'openai-key.dpapi'), $protected, $utf8)
$provenance = [ordered]@{
  version = 1
  environment = 'development'
  projectId = $ProjectId
  userAttestedDevelopment = $true
  authorizedPurpose = 'staynex-synthetic-service-naturalness'
  credentialSource = 'new-development-project-key-entered-by-user'
  baseSha = '852eeb06f113c69b8e98ee5353113d9407c7ddfa'
  createdAt = [DateTime]::UtcNow.ToString('o')
  secretStorage = 'Windows DPAPI current user'
}
[IO.File]::WriteAllText((Join-Path $destination 'provenance.json'), ($provenance | ConvertTo-Json), $utf8)
$protected = $null
$DevelopmentKey.Dispose()
Write-Output 'Development credential stored encrypted. No provider calls were made. You may confirm setup in chat without sharing the key.'
