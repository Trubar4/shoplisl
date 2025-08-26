// src/app/core/services/list-utils.service.ts
import { Injectable, signal } from '@angular/core';
import { DepartmentService } from './department.service';

@Injectable({
  providedIn: 'root'
})
export class ListUtilsService {
  private readonly currentListColor = signal<string>('#1a9edb');
  private departmentIconFilterCache = '';

  constructor(private readonly departmentService: DepartmentService) {}

  // === COLOR MANAGEMENT ===
  
  setCurrentListColor(color: string): void {
    this.currentListColor.set(color);
    this.departmentIconFilterCache = ''; // Reset cache when color changes
  }

  getCurrentListColor(): string {
    return this.currentListColor();
  }

  getContrastColor(hexColor: string): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#333333' : '#ffffff';
  }

  getLightColor(hexColor: string): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const lightR = Math.round(r + (255 - r) * 0.7);
    const lightG = Math.round(g + (255 - g) * 0.7);
    const lightB = Math.round(b + (255 - b) * 0.7);
    return `rgb(${lightR}, ${lightG}, ${lightB})`;
  }

  getDarkColor(hexColor: string): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    return `rgb(${Math.round(r * 0.8)}, ${Math.round(g * 0.8)}, ${Math.round(b * 0.8)})`;
  }

  // === DEPARTMENT UTILITIES ===

  getDepartmentIconPath(departmentId: string): string {
    return this.departmentService.getDepartmentIconPath(departmentId);
  }

  getDepartmentIconFilter(): string {
    if (this.departmentIconFilterCache) return this.departmentIconFilterCache;
    this.departmentIconFilterCache = `hue-rotate(${this.getHueRotation()}deg) saturate(1.2)`;
    return this.departmentIconFilterCache;
  }

  getDepartmentNameGerman(departmentId: string): string {
    return this.departmentService.getDepartmentName(departmentId, 'german');
  }

  // === THEME MANAGEMENT ===

  updateThemeColors(color: string): void {
    this.setCurrentListColor(color);
    const root = document.documentElement;
    root.style.setProperty('--list-primary-color', color);
    root.style.setProperty('--list-contrast-color', this.getContrastColor(color));
    root.style.setProperty('--list-light-color', this.getLightColor(color));
    root.style.setProperty('--list-dark-color', this.getDarkColor(color));
    this.updateThemeColorMeta(color);
  }

  resetToDefaultTheme(): void {
    const defaultColor = '#1a9edb';
    this.updateThemeColors(defaultColor);
    
    const root = document.documentElement;
    root.style.setProperty('--list-primary-color-rgb', '26, 158, 219');
    document.documentElement.style.backgroundColor = defaultColor;
  }

  // === PRIVATE HELPERS ===

  private getHueRotation(): number {
    const color = this.getCurrentListColor();
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return Math.floor((r + g + b) / 3 / 255 * 360);
  }

  private updateThemeColorMeta(color: string): void {
    let themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement;
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.name = 'theme-color';
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.content = color;
    document.documentElement.style.backgroundColor = color;
  }
}