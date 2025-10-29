# Vitest Visual Testing Setup for VS Code

This project is configured to use Vitest for testing with full visual support in VS Code.

## Quick Start

### 1. Install the VS Code Extension

Install the **Vitest extension** (`vitest.explorer`) from the VS Code marketplace. It should be recommended automatically when you open this project.

### 2. Running Tests

You have several options to run tests:

#### Command Line
```bash
# Run all tests
npm test

# Run tests with UI (opens browser interface)
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Run legacy Karma tests (if needed)
npm run test:karma
```

#### VS Code Testing Panel
1. Open the Testing panel in VS Code (click the beaker icon in the sidebar)
2. You'll see all your test files and individual tests
3. Click the play button next to any test or file to run it
4. Failed tests will show inline with error details

#### Vitest UI (Browser)
Run `npm run test:ui` to open a beautiful web interface where you can:
- See all tests organized by file
- Run/debug individual tests
- View test output and errors
- See code coverage

### 3. VS Code Features

With the Vitest extension installed, you get:

- **Test Discovery**: All tests automatically appear in the Testing panel
- **Inline Results**: See test results directly in your code
- **One-Click Run**: Run individual tests or entire files with one click
- **Debug Support**: Set breakpoints and debug tests visually
- **Watch Mode**: Tests automatically re-run when you save files
- **Coverage Visualization**: See which lines are covered by tests

## Configuration Files

- **vitest.config.ts**: Main Vitest configuration
- **src/test-setup.ts**: Test environment setup (Angular + Jasmine compatibility)
- **tsconfig.spec.json**: TypeScript configuration for tests
- **.vscode/settings.json**: VS Code test explorer settings
- **.vscode/extensions.json**: Recommended extensions

## Jasmine Compatibility

The setup includes a compatibility layer for Jasmine syntax, so your existing tests using `jasmine.createSpy()` and `jasmine.createSpyObj()` will work with Vitest.

## Tips

1. **Watch Mode**: In VS Code, tests run in watch mode by default - they'll re-run when you save files
2. **Filter Tests**: Use the filter box in the Testing panel to find specific tests
3. **Coverage**: Click on files in the test UI to see coverage highlights
4. **Debugging**: Right-click any test in the Testing panel and select "Debug Test"

## Troubleshooting

### Tests not appearing in VS Code
- Make sure the Vitest extension is installed
- Reload VS Code window (Cmd/Ctrl + Shift + P → "Reload Window")
- Check the Output panel → "Vitest" for any errors

### Component tests failing
- Ensure external templates/styles are properly loaded
- Check that all required providers are included in TestBed.configureTestingModule

### Slow test startup
- This is normal on first run as Angular needs to initialize
- Subsequent runs will be faster due to caching

## More Information

- [Vitest Documentation](https://vitest.dev/)
- [Vitest VS Code Extension](https://marketplace.visualstudio.com/items?itemName=vitest.explorer)
- [Angular Testing Guide](https://angular.dev/guide/testing)
