@echo off
REM Windows batch script to execute temp ID cleanup with backup
echo Running temp ID cleanup with --execute --backup flags...
npx ts-node scripts/cleanup-legacy-temp-ids.ts --execute --backup
