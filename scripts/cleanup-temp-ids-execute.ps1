#!/usr/bin/env pwsh
# PowerShell script to execute temp ID cleanup with backup
Write-Host "Running temp ID cleanup with --execute --backup flags..." -ForegroundColor Cyan
npx ts-node scripts/cleanup-legacy-temp-ids.ts --execute --backup
