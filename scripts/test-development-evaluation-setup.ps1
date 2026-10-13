$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.npm-cache'))
$temp = Join-Path $root ('development-setup-test-' + [Guid]::NewGuid().ToString('N'))
$setup = Join-Path $PSScriptRoot 'configure-development-evaluation.ps1'
$fake = 'synthetic-development-test-value-not-a-provider-key'
try {
  $secret = ConvertTo-SecureString $fake -AsPlainText -Force
  & $setup -ConfirmDevelopment -ProjectId 'proj_synthetic' -DevelopmentKey $secret -Directory $temp | Out-Null
  $cipher = [IO.File]::ReadAllText((Join-Path $temp 'openai-key.dpapi'))
  if ($cipher.Contains($fake)) { throw 'Credential was not encrypted' }
  $restored = ConvertTo-SecureString $cipher
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($restored)
  try {
    if ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) -ne $fake) { throw 'DPAPI round trip failed' }
  } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $restored.Dispose() }
  $provenance = Get-Content -Raw -LiteralPath (Join-Path $temp 'provenance.json') | ConvertFrom-Json
  if ($provenance.environment -ne 'development' -or -not $provenance.userAttestedDevelopment) { throw 'Missing development attestation' }
  $rejected = $false
  try { & $setup -ConfirmDevelopment -ProjectId 'proj_synthetic' -Directory $temp | Out-Null } catch { $rejected = $true }
  if (-not $rejected -or [IO.File]::ReadAllText((Join-Path $temp 'openai-key.dpapi')) -ne $cipher) { throw 'Existing credential was overwritten' }
  $rejected = $false
  try { & $setup -ProjectId 'proj_synthetic' -Directory (Join-Path $temp 'unapproved') | Out-Null } catch { $rejected = $true }
  if (-not $rejected -or (Test-Path -LiteralPath (Join-Path $temp 'unapproved'))) { throw 'Missing approval was accepted' }
  $rejected = $false
  try { & $setup -ConfirmDevelopment -ProjectId 'invalid' -Directory (Join-Path $temp 'invalid') | Out-Null } catch { $rejected = $true }
  if (-not $rejected -or (Test-Path -LiteralPath (Join-Path $temp 'invalid'))) { throw 'Invalid project accepted' }
  Write-Output 'PASS encrypted development setup, provenance, no overwrite and fail closed before writes; synthetic key only, zero network calls'
} finally {
  $resolved = [IO.Path]::GetFullPath($temp)
  if (-not $resolved.StartsWith($root + [IO.Path]::DirectorySeparatorChar + 'development-setup-test-')) { throw 'Unsafe test cleanup target' }
  if (Test-Path -LiteralPath $resolved) {
    if ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unsafe test directory link' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
