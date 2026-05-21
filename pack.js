#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const simpleGit = require('simple-git');

const git = simpleGit();
const OUTPUT_DIR = path.join(process.cwd(), 'packs');

async function getGitChanges() {
  const status = await git.status();
  const changes = [];
  
  changes.push(...status.modified);
  changes.push(...status.created);
  changes.push(...status.renamed.map(r => r.to));
  changes.push(...status.not_added);
  
  return [...new Set(changes)];
}

async function packFiles(files, outputFilename) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const outputPath = path.join(OUTPUT_DIR, outputFilename);
  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`打包完成: ${outputPath}`);
      console.log(`共 ${archive.pointer()} 字节`);
      resolve(outputPath);
    });
    
    archive.on('error', (err) => {
      reject(err);
    });
    
    archive.pipe(output);
    
    files.forEach(file => {
      const fullPath = path.join(process.cwd(), file);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        archive.file(fullPath, { name: file });
        console.log(`添加文件: ${file}`);
      }
    });
    
    archive.finalize();
  });
}

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function main() {
  try {
    console.log('正在检测Git文件变动...');
    const changes = await getGitChanges();
    
    if (changes.length === 0) {
      console.log('没有检测到文件变动');
      return;
    }
    
    console.log(`检测到 ${changes.length} 个变动文件`);
    const outputFilename = `git-changes-${getTimestamp()}.zip`;
    await packFiles(changes, outputFilename);
    
  } catch (error) {
    console.error('打包失败:', error.message);
    process.exit(1);
  }
}

main();
