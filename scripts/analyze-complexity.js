function analyzeComplexity(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const methods = content.match(/\w+\([^)]*\)\s*{/g) || [];
    
    methods.forEach(method => {
      const methodBody = extractMethodBody(content, method);
      const lines = methodBody.split('\n').length;
      const nesting = (methodBody.match(/\s{6,}/g) || []).length;
      
      if (lines > 50) console.log(`🔄 Long method: ${method} (${lines} lines)`);
      if (nesting > 10) console.log(`🔄 Deep nesting: ${method} (${nesting} levels)`);
    });
  }