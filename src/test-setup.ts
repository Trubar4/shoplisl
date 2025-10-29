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

// Jasmine compatibility layer for Vitest
(globalThis as any).jasmine = {
  createSpy: (name?: string) => vi.fn(),
  createSpyObj: (baseName: string, methodNames: string[]) => {
    const obj: any = {};
    methodNames.forEach((method) => {
      obj[method] = vi.fn();
    });
    return obj;
  },
};
