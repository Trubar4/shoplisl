# Integration Tests - Setup Guide

## Overview

The integration tests in this directory validate real-time sync functionality using Firebase Emulator Suite. These tests require the Firebase emulator to be running locally.

## Prerequisites

1. **Java Runtime Environment (JRE)**
   - Firebase Emulator requires Java 11 or higher
   - Install: `sudo apt-get install openjdk-11-jre` (Linux)
   - Or download from: https://www.oracle.com/java/technologies/downloads/

2. **Firebase CLI**
   - Already installed via npm (firebase-tools@^14.5.1)
   - Accessible via: `npx firebase`

3. **Firebase Emulator JAR**
   - Automatically downloaded on first run
   - Location: `~/.cache/firebase/emulators/`

## Running Integration Tests

### Option 1: Automated (Recommended for CI/CD)
```bash
npm run test:integration
```

This command:
1. Starts Firebase Emulator
2. Runs integration tests
3. Shuts down emulator automatically

### Option 2: Manual (Recommended for Development)

**Terminal 1: Start Emulator**
```bash
npx firebase emulators:start --only firestore
```

**Terminal 2: Run Tests**
```bash
vitest run test/integration
# Or watch mode:
vitest watch test/integration
# Or UI mode:
vitest --ui test/integration
```

## Troubleshooting

### Issue: "firebase: command not found"

**Solution:** Use `npx firebase` instead of `firebase`

### Issue: "Converting circular structure to JSON" when starting emulator

**Cause:** Network/proxy issue when downloading Firebase Emulator JAR

**Solutions:**
1. **Manual Download:** Download the JAR file manually from Firebase GitHub releases
2. **Proxy Configuration:** Set environment variables:
   ```bash
   export HTTP_PROXY=http://your-proxy:port
   export HTTPS_PROXY=http://your-proxy:port
   ```
3. **Skip Integration Tests:** Run unit tests only:
   ```bash
   npm run test:unit
   ```

### Issue: Emulator port already in use

**Solution:** Kill existing process:
```bash
lsof -ti:8081 | xargs kill -9
```

### Issue: Tests timeout or fail to connect

**Check:**
1. Emulator is running: `curl http://localhost:8081`
2. Firestore emulator UI: http://localhost:4000
3. Check emulator logs for errors

## Test Structure

### Critical Tests (Phase 2a)

1. **Test 1: Participant Adds Article (Online)**
   - File: `realtime-sync.spec.ts`
   - Validates: Optimistic list updates
   - Time: ~2-3 seconds

2. **Test 2: Rapid Addition**
   - File: `realtime-sync.spec.ts`
   - Validates: Multiple rapid operations
   - Time: ~2-3 seconds

3. **Test 3: Offline Article Creation**
   - File: `realtime-sync.spec.ts`
   - Validates: Temp ID replacement
   - Time: ~2-3 seconds

### Total Test Time
- **With Emulator:** ~10-15 seconds
- **Emulator Startup:** ~5-10 seconds (first time: +30s for JAR download)

## Alternative: Unit Tests

If Firebase Emulator is not available (e.g., in restricted environments), use unit tests instead:

```bash
npm run test:unit
```

Unit tests mock Firebase services and test the same logic without requiring the emulator.

## CI/CD Integration

See `.github/workflows/test.yml` for automated testing in GitHub Actions.

The CI pipeline:
1. Installs Java
2. Caches Firebase Emulator JAR
3. Runs integration tests
4. Uploads coverage reports

## Development Workflow

### Recommended Approach for Phase 2

1. **Start Development:**
   ```bash
   # Terminal 1: Start emulator
   npx firebase emulators:start --only firestore

   # Terminal 2: Run tests in watch mode
   vitest watch test/integration
   ```

2. **Make Changes:**
   - Edit services in `src/app/core/services/`
   - Tests auto-run and show results

3. **Verify All Tests:**
   ```bash
   npm run test:all  # Unit + Integration
   ```

4. **Commit Only if All Pass:**
   ```bash
   git add .
   git commit -m "feat: your changes"
   ```

## Performance Tips

1. **Use Watch Mode:** Tests re-run only on file changes
2. **Run Specific Tests:**
   ```bash
   vitest run test/integration/realtime-sync.spec.ts
   ```
3. **Parallelize:** Vitest runs tests in parallel by default
4. **Skip Slow Tests:** Use `.skip()` for tests not needed during development

## Next Steps

- [ ] Add more integration test scenarios (Phase 2b)
- [ ] Add E2E tests with real browser (Phase 3)
- [ ] Add performance benchmarks
- [ ] Add visual regression tests

## Resources

- [Firebase Emulator Documentation](https://firebase.google.com/docs/emulator-suite)
- [Vitest Documentation](https://vitest.dev/)
- [Phase 2 Handoff Document](../../REALTIME_SYNC_HANDOFF.md)
