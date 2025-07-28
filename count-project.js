const fs = require('fs');
const path = require('path');

function countLinesInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch (error) {
    return 0;
  }
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });

  return arrayOfFiles;
}

function analyzeProject() {
  const srcPath = './src';
  const allFiles = getAllFiles(srcPath);
  
  const stats = {
    typescript: { files: 0, lines: 0 },
    html: { files: 0, lines: 0 },
    scss: { files: 0, lines: 0 },
    other: { files: 0, lines: 0 },
    total: { files: 0, lines: 0 }
  };

  allFiles.forEach(file => {
    const ext = path.extname(file);
    const lines = countLinesInFile(file);
    
    stats.total.files++;
    stats.total.lines += lines;

    switch (ext) {
      case '.ts':
        stats.typescript.files++;
        stats.typescript.lines += lines;
        break;
      case '.html':
        stats.html.files++;
        stats.html.lines += lines;
        break;
      case '.scss':
        stats.scss.files++;
        stats.scss.lines += lines;
        break;
      default:
        stats.other.files++;
        stats.other.lines += lines;
    }
  });

  console.log('🏗️  ShopLisl Project Analysis');
  console.log('==============================');
  console.log(`📁 Total Files: ${stats.total.files}`);
  console.log(`📝 Total Lines: ${stats.total.lines}`);
  console.log('');
  console.log('📊 Breakdown by Type:');
  console.log(`   TypeScript: ${stats.typescript.files} files, ${stats.typescript.lines} lines`);
  console.log(`   HTML:       ${stats.html.files} files, ${stats.html.lines} lines`);
  console.log(`   SCSS:       ${stats.scss.files} files, ${stats.scss.lines} lines`);
  console.log(`   Other:      ${stats.other.files} files, ${stats.other.lines} lines`);
  
  const tsPercent = Math.round((stats.typescript.lines / stats.total.lines) * 100);
  const htmlPercent = Math.round((stats.html.lines / stats.total.lines) * 100);
  const scssPercent = Math.round((stats.scss.lines / stats.total.lines) * 100);
  
  console.log('');
  console.log('📈 Distribution:');
  console.log(`   TypeScript: ${tsPercent}%`);
  console.log(`   HTML:       ${htmlPercent}%`);
  console.log(`   SCSS:       ${scssPercent}%`);
}

analyzeProject();