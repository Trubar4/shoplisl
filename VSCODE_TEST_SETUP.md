# 🧪 VS Code Test Runner Setup Guide

This guide helps you set up the visual test runner in VS Code so you can see test results clearly without terminal clutter.

---

## 📍 Step 1: Enable the Testing Sidebar

### Option A: Check if it's already there

Look at your **left sidebar** in VS Code. You should see these icons from top to bottom:

```
📁  Explorer (files)
🔍  Search
🔀  Source Control (Git)
▶️  Run and Debug
🧪  Testing          ← LOOK FOR THIS!
📦  Extensions
```

The **Testing icon** looks like:
- A beaker/flask 🧪
- Or a play button with checkmarks ✓▶️

### Option B: If you don't see it

**Right-click** on the left sidebar (anywhere on the icon bar) and check these options:

1. Make sure **"Activity Bar"** is visible (check ✓)
2. Look for **"Testing"** in the menu
3. If it's there but unchecked, **click to enable it** ✓

### Option C: Use the command palette

1. Press **`Ctrl+Shift+P`** (or `Cmd+Shift+P` on Mac)
2. Type: **"Test: Focus on Test Explorer View"**
3. Press **Enter**

This should open the Testing panel even if the icon isn't visible.

---

## 🔧 Step 2: Install Required Extensions

For Angular/Karma/Jasmine tests to work properly, install these extensions:

### Method 1: Install via VS Code UI

1. Click the **Extensions** icon (📦) in the left sidebar
2. Search for and install:
   - **"Angular Language Service"** by Angular
   - **"Karma Test Explorer"** (if available)

### Method 2: Install via Quick Install

Press **`Ctrl+P`** and paste each line one at a time:

```
ext install angular.ng-template
```

---

## 🎯 Step 3: Configure Test Explorer for Your Project

Create a settings file for your workspace:

### Create `.vscode/settings.json`

If it doesn't exist, create it with this content:

```json
{
  "testExplorer.useNativeTesting": true,
  "testing.automaticallyOpenPeekView": "failureInVisibleDocument",
  "karma.browsers": ["ChromeHeadless"],
  "karma.port": 9876
}
```

This tells VS Code to:
- Use native test discovery
- Auto-show failures
- Use headless Chrome for tests

---

## 🚀 Step 4: Verify It Works

### After setup, you should see:

1. **Testing icon appears** in the left sidebar 🧪
2. **Click the Testing icon**
3. You should see a tree view like:

```
🧪 Testing
  📁 quantity-extraction.service.spec.ts
    ▶️ German Number Formats
    ▶️ Text Numbers
    ▶️ Quantity Units
  📁 context-management.service.spec.ts
    ▶️ Context Management
  📁 simplified-disambiguation.service.spec.ts
    ▶️ Similarity Algorithm
```

### If you see this:

✅ **Success!** The test explorer is working.

### If you see "No tests found":

Try these:

1. **Reload VS Code**: Press `Ctrl+Shift+P` → Type "Reload Window" → Enter
2. **Run tests manually once**: In terminal, run `npm test` to populate cache
3. **Check the output**: Click "Test" in the bottom status bar to see test discovery logs

---

## 🎮 Step 5: How to Use the Test Explorer

### Run Tests Visually

1. **Click the Testing icon** 🧪 in the left sidebar
2. **Expand the test tree** by clicking the arrows ▶️
3. **Run tests** by clicking the ▶️ play button next to:
   - A test file (runs all tests in that file)
   - A test group (runs all tests in that describe block)
   - An individual test (runs just that one test)

### See Results

After running tests, you'll see:

- **Green checkmark** ✅ = Test passed
- **Red X** ❌ = Test failed
- **Yellow warning** ⚠️ = Test skipped

**Click on a failed test** to see the error details without terminal clutter!

---

## 📊 Visual Test Results

### Instead of this (terminal chaos):

```
LOG: '📱 DATA:', 'Initially online'
INFO: '📱 DATA:', 'Connection restored'
LOG: '🔧 Logger Commands:'
Chrome: Executed 153 of 153 (3 FAILED)
TOTAL: 3 FAILED, 150 SUCCESS
```

### You get this (clean visual view):

```
🧪 Testing
  ✅ Similarity Tests (100/100)
  ✅ Quantity Tests (128/130)
    ✅ German Number Formats
    ✅ Text Numbers
    ❌ Edge Cases (2 failed) ← Click to see why
  ✅ Context Tests (40/40)
```

---

## 🐛 Step 6: Debug Tests Visually

### Set Breakpoints

1. **Open a test file** (e.g., `quantity-extraction.service.spec.ts`)
2. **Click in the gutter** (left of line numbers) to set a red breakpoint dot 🔴
3. **Right-click on a test** in the Test Explorer
4. **Select "Debug Test"**

VS Code will:
- Stop at your breakpoint
- Show variable values
- Let you step through code line by line

Much easier than `console.log`!

---

## 🎯 Alternative: Use Karma Test Explorer Extension

If the built-in test explorer doesn't work well with Karma, install this extension:

1. Press **`Ctrl+Shift+X`** to open Extensions
2. Search for: **"Angular Karma Test Explorer"**
3. Install it
4. Reload VS Code

This extension is specifically designed for Angular + Karma tests and provides better integration.

---

## 🔍 Troubleshooting

### Problem 1: "Testing icon not showing"

**Solution:**
- Press `Ctrl+Shift+P`
- Type: "View: Show Testing"
- Press Enter

### Problem 2: "No tests found"

**Solution:**
1. Make sure you've run `npm install`
2. Run `npm test` once in the terminal
3. Reload VS Code: `Ctrl+Shift+P` → "Reload Window"
4. Check if `karma.conf.js` exists in your project root

### Problem 3: "Tests don't run from UI"

**Solution:**
1. Check the Output panel: `View > Output` → Select "Test"
2. Look for error messages
3. Make sure Chrome is installed on your system
4. Try running `npm test` in terminal to verify tests work

### Problem 4: "Too slow or hangs"

**Solution:**
- Edit `.vscode/settings.json`:
```json
{
  "karma.browsers": ["ChromeHeadless"],
  "karma.autoWatch": false
}
```

---

## 📝 Quick Reference

| Action | How |
|--------|-----|
| Open Test Explorer | Click 🧪 icon or press `Ctrl+Shift+T` |
| Run all tests | Click ▶️ at top of Test Explorer |
| Run one test file | Click ▶️ next to filename |
| Run one test | Click ▶️ next to test name |
| Debug a test | Right-click test → "Debug Test" |
| See failure details | Click ❌ failed test → See error in peek view |
| Refresh tests | Click 🔄 refresh icon at top |

---

## 🎉 Success Checklist

After following this guide, you should have:

- ✅ Testing icon 🧪 visible in left sidebar
- ✅ Test tree showing your 153 tests
- ✅ Ability to run tests with a click
- ✅ Visual pass/fail indicators (✅/❌)
- ✅ Clean error messages (no terminal clutter)
- ✅ Ability to debug tests with breakpoints

---

## 🆘 Still Need Help?

If the visual test runner still isn't working after following all steps:

### Fallback: Use Test Scripts

Create test scripts in `package.json`:

```json
{
  "scripts": {
    "test:clean": "ng test --watch=false --code-coverage=false",
    "test:similarity": "ng test --include='**/simplified-disambiguation.service.spec.ts' --watch=false",
    "test:quantity": "ng test --include='**/quantity-extraction.service.spec.ts' --watch=false",
    "test:context": "ng test --include='**/context-management.service.spec.ts' --watch=false"
  }
}
```

Then run:
```bash
npm run test:clean
```

This gives cleaner output than `npm test`.

---

## 🎓 Next Steps

Once you have the visual test runner working:

1. **Explore the tests** by clicking through the tree
2. **Run tests** by clicking ▶️ buttons
3. **Fix failures** by clicking ❌ to see what's wrong
4. **Use breakpoints** to debug complex issues

The visual test runner makes testing **10x easier** than reading terminal output!

---

**Questions? Open an issue or check the VS Code documentation:**
https://code.visualstudio.com/docs/editor/testing
