import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { vi } from 'vitest';

// Initialize the Angular testing environment
getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);

// Setup global test utilities
if (typeof globalThis.ngDevMode === 'undefined') {
  (globalThis as any).ngDevMode = true;
}

// Enhanced Jasmine compatibility layer for Vitest
// This allows existing Jasmine tests to work with Vitest
function createJasmineSpy(name?: string) {
  const spy = vi.fn();
  // Add Jasmine-style 'and' property for chaining
  (spy as any).and = {
    returnValue: (value: any) => spy.mockReturnValue(value),
    returnValues: (...values: any[]) => spy.mockReturnValueOnce(values[0]),
    callFake: (fn: Function) => spy.mockImplementation(fn),
    stub: () => spy,
    throwError: (error: any) => spy.mockImplementation(() => { throw error; })
  };
  return spy;
}

(globalThis as any).jasmine = {
  createSpy: createJasmineSpy,
  createSpyObj: (baseName: string, methodNames: string[] | Record<string, any>) => {
    const obj: any = {};

    if (Array.isArray(methodNames)) {
      // Simple array of method names
      methodNames.forEach((method) => {
        obj[method] = createJasmineSpy(method);
      });
    } else {
      // Object with method names and return values
      Object.keys(methodNames).forEach((method) => {
        const spy = createJasmineSpy(method);
        spy.mockReturnValue(methodNames[method]);
        obj[method] = spy;
      });
    }

    return obj;
  },
};
