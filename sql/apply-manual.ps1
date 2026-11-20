# Apply Turso schema manually (Windows PowerShell).
# Tidak dijalankan otomatis oleh app — review SQL dulu.
#
# Prasyarat: turso CLI login
#   turso auth login
#
# Usage:
#   .\sql\apply-manual.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host 'Applying sql/001_schema_v4.sql to database asrama...'
Get-Content -Raw .\sql\001_schema_v4.sql | turso db shell asrama

Write-Host 'Applying sql/002_sync_meta.sql...'
Get-Content -Raw .\sql\002_sync_meta.sql | turso db shell asrama

Write-Host 'Done. Create token for web/.env:'
Write-Host '  turso db tokens create asrama'
