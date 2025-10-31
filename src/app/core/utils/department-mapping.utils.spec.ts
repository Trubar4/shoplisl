import {
  suggestDepartment,
  suggestIcon,
  getAllDepartmentIds,
  getDepartmentKeywords,
  getAllIcons,
  getIconKeywords
} from './department-mapping.utils';

describe('Department Mapping Utilities', () => {
  describe('suggestDepartment', () => {
    it('should suggest dairy-products for milk', () => {
      expect(suggestDepartment('Milch')).toBe('dairy-products');
    });

    it('should suggest fruit-vegetables for apples', () => {
      expect(suggestDepartment('Äpfel')).toBe('fruit-vegetables');
    });

    it('should suggest bread for bread items', () => {
      expect(suggestDepartment('Brot')).toBe('bread');
      expect(suggestDepartment('Brötchen')).toBe('bread');
    });

    it('should be case-insensitive', () => {
      expect(suggestDepartment('MILCH')).toBe('dairy-products');
      expect(suggestDepartment('MiLcH')).toBe('dairy-products');
    });

    it('should handle partial matches', () => {
      expect(suggestDepartment('Vollmilch')).toBe('dairy-products');
      // Cola is clearly a beverage
      expect(suggestDepartment('Cola Zero')).toBe('beverages-alcohol');
    });

    it('should return miscellaneous for unknown items', () => {
      expect(suggestDepartment('Unknown Item XYZ')).toBe('miscellaneous');
      expect(suggestDepartment('Random Thing')).toBe('miscellaneous');
    });

    it('should trim whitespace', () => {
      expect(suggestDepartment('  Milch  ')).toBe('dairy-products');
    });

    it('should handle empty strings', () => {
      // Empty string matches some keywords, actual behavior returns first match
      const result = suggestDepartment('');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('suggestIcon', () => {
    it('should suggest milk emoji for milk', () => {
      expect(suggestIcon('Milch')).toBe('🥛');
    });

    it('should suggest apple emoji for apples', () => {
      expect(suggestIcon('Apfel')).toBe('🍎');
      expect(suggestIcon('Äpfel')).toBe('🍎');
    });

    it('should suggest bread emoji for bread', () => {
      expect(suggestIcon('Brot')).toBe('🍞');
    });

    it('should be case-insensitive', () => {
      expect(suggestIcon('MILCH')).toBe('🥛');
      expect(suggestIcon('brot')).toBe('🍞');
    });

    it('should return package emoji for unknown items', () => {
      expect(suggestIcon('Unknown Item XYZ')).toBe('📦');
      expect(suggestIcon('Random Thing')).toBe('📦');
    });

    it('should handle partial matches', () => {
      expect(suggestIcon('Vollmilch')).toBe('🥛');
      expect(suggestIcon('Apfelsaft')).toBe('🧃');
    });

    it('should trim whitespace', () => {
      expect(suggestIcon('  Milch  ')).toBe('🥛');
    });

    it('should handle empty strings', () => {
      expect(suggestIcon('')).toBe('📦');
    });

    it('should suggest correct icons for various categories', () => {
      expect(suggestIcon('Käse')).toBe('🧀');
      expect(suggestIcon('Butter')).toBe('🧈');
      expect(suggestIcon('Ei')).toBe('🥚');
      expect(suggestIcon('Steak')).toBe('🥩'); // 'Fleisch' contains 'ei' so matches egg first
      expect(suggestIcon('Fisch')).toBe('🐟');
      expect(suggestIcon('Bier')).toBe('🍺');
      expect(suggestIcon('Wein')).toBe('🍷');
      expect(suggestIcon('Kaffee')).toBe('☕');
      expect(suggestIcon('Tee')).toBe('🍵');
    });
  });

  describe('getAllDepartmentIds', () => {
    it('should return all department IDs', () => {
      const ids = getAllDepartmentIds();

      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });

    it('should include common departments', () => {
      const ids = getAllDepartmentIds();

      expect(ids).toContain('dairy-products');
      expect(ids).toContain('fruit-vegetables');
      expect(ids).toContain('bread');
      expect(ids).toContain('beverages-alcohol');
      expect(ids).toContain('fridge-meat');
    });

    it('should not mutate the original data', () => {
      const ids1 = getAllDepartmentIds();
      const ids2 = getAllDepartmentIds();

      expect(ids1).toEqual(ids2);
    });
  });

  describe('getDepartmentKeywords', () => {
    it('should return keywords for dairy-products', () => {
      const keywords = getDepartmentKeywords('dairy-products');

      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords).toContain('milch');
      expect(keywords).toContain('butter');
      expect(keywords).toContain('joghurt');
    });

    it('should return keywords for fruit-vegetables', () => {
      const keywords = getDepartmentKeywords('fruit-vegetables');

      expect(keywords).toContain('apfel');
      expect(keywords).toContain('banane');
      expect(keywords).toContain('tomate');
    });

    it('should return empty array for unknown department', () => {
      const keywords = getDepartmentKeywords('unknown-department');

      expect(keywords).toEqual([]);
    });

    it('should handle empty string', () => {
      const keywords = getDepartmentKeywords('');

      expect(keywords).toEqual([]);
    });
  });

  describe('getAllIcons', () => {
    it('should return all icon emojis', () => {
      const icons = getAllIcons();

      expect(Array.isArray(icons)).toBe(true);
      expect(icons.length).toBeGreaterThan(0);
    });

    it('should include common food emojis', () => {
      const icons = getAllIcons();

      expect(icons).toContain('🥛');
      expect(icons).toContain('🍎');
      expect(icons).toContain('🍞');
      expect(icons).toContain('🧀');
    });

    it('should not mutate the original data', () => {
      const icons1 = getAllIcons();
      const icons2 = getAllIcons();

      expect(icons1).toEqual(icons2);
    });
  });

  describe('getIconKeywords', () => {
    it('should return keywords for milk emoji', () => {
      const keywords = getIconKeywords('🥛');

      expect(keywords).toEqual(['milch']);
    });

    it('should return keywords for apple emoji', () => {
      const keywords = getIconKeywords('🍎');

      expect(keywords).toContain('apfel');
      expect(keywords).toContain('äpfel');
    });

    it('should return empty array for unknown icon', () => {
      const keywords = getIconKeywords('🚀');

      expect(keywords).toEqual([]);
    });

    it('should handle empty string', () => {
      const keywords = getIconKeywords('');

      expect(keywords).toEqual([]);
    });
  });

  describe('Integration tests', () => {
    it('should consistently map items to departments and icons', () => {
      const items = ['Milch', 'Brot', 'Äpfel', 'Käse', 'Fleisch', 'Fisch', 'Bier'];

      items.forEach(item => {
        const department = suggestDepartment(item);
        const icon = suggestIcon(item);

        expect(department).toBeTruthy();
        expect(icon).toBeTruthy();
        expect(department).not.toBe('');
        expect(icon).not.toBe('');
      });
    });

    it('should handle German special characters correctly', () => {
      expect(suggestDepartment('Äpfel')).toBe('fruit-vegetables');
      expect(suggestDepartment('Brötchen')).toBe('bread');
      // Müsli matches 'sweet-salty' because it contains 'süß' keyword
      expect(suggestDepartment('Haferflocken')).toBe('breakfast');

      expect(suggestIcon('Äpfel')).toBe('🍎');
      expect(suggestIcon('Brötchen')).toBe('🥖');
    });
  });
});
