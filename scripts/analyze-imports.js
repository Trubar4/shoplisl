// Scan for unused imports across AI services
const fs = require('fs');
const path = require('path');

function analyzeImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = content.match(/import\s+{([^}]+)}/g) || [];
  const usage = content.split('\n').slice(10); // Skip import section
  
  imports.forEach(imp => {
    const items = imp.match(/{([^}]+)}/)[1].split(',').map(s => s.trim());
    items.forEach(item => {
      const used = usage.some(line => line.includes(item));
      if (!used) console.log(`❌ Unused import: ${item} in ${filePath}`);
    });
  });
}