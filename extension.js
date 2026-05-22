const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const simpleGit = require('simple-git');

function getConfiguration() {
  return vscode.workspace.getConfiguration('gitPacker');
}

function formatDate(date, format) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace(/YYYY/g, year)
    .replace(/MM/g, month)
    .replace(/DD/g, day)
    .replace(/HH/g, hours)
    .replace(/mm/g, minutes)
    .replace(/ss/g, seconds);
}

function getProjectName(workspaceFolder) {
  return path.basename(workspaceFolder.uri.fsPath);
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\s]/g, '_').replace(/[()]/g, '');
}

function formatFilename(config, workspaceFolder, extraVars = {}) {
  const filenameFormat = config.get('filenameFormat') || '{project} {time} {signature}.zip';
  const timeFormat = config.get('timeFormat') || 'YYYYMMDD-HH';
  const signature = config.get('signature') || 'GitPacker';

  const now = new Date();
  const projectName = getProjectName(workspaceFolder);
  const timeStr = formatDate(now, timeFormat);
  const dateStr = formatDate(now, 'YYYYMMDD');

  let filename = filenameFormat
    .replace('{project}', sanitizeFilename(projectName))
    .replace('{time}', timeStr)
    .replace('{date}', dateStr)
    .replace('{signature}', sanitizeFilename(signature));

  for (const [key, value] of Object.entries(extraVars)) {
    filename = filename.replace(`{${key}}`, sanitizeFilename(value));
  }

  if (!filename.endsWith('.zip')) {
    filename += '.zip';
  }

  return filename;
}

function isPathSafe(basePath, filePath) {
  const fullPath = path.resolve(basePath, filePath);
  return fullPath.startsWith(basePath);
}

async function selectFilesToPack(files) {
  const userSelection = await vscode.window.showQuickPick(
    [
      { label: '打包所有变动文件', value: 'all' },
      { label: '选择要打包的文件', value: 'select' }
    ],
    { placeHolder: `检测到 ${files.length} 个变动文件，请选择打包方式` }
  );

  if (!userSelection) {
    return null;
  }

  if (userSelection.value === 'all') {
    return files;
  }

  const selectedFiles = await vscode.window.showQuickPick(
    files.map(file => ({ label: file, picked: true })),
    { canPickMany: true, placeHolder: '选择要打包的文件' }
  );

  return selectedFiles?.map(item => item.label) || [];
}

function activate(context) {
  let packChangesDisposable = vscode.commands.registerCommand('packer.packChanges', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('请先打开一个工作区');
      return;
    }

    const git = simpleGit(workspaceFolder.uri.fsPath);
    const config = getConfiguration();
    const workspacePath = workspaceFolder.uri.fsPath;

    try {
      vscode.window.showInformationMessage('正在检测Git文件变动...');

      const status = await git.status();
      const changes = [];
      changes.push(...status.modified);
      changes.push(...status.created);
      changes.push(...status.renamed.map(r => r.to));
      changes.push(...status.not_added);
      const uniqueChanges = [...new Set(changes)];

      if (uniqueChanges.length === 0) {
        vscode.window.showInformationMessage('没有检测到文件变动');
        return;
      }

      const filesToPack = await selectFilesToPack(uniqueChanges);
      if (filesToPack === null) {
        return;
      }

      if (filesToPack.length === 0) {
        vscode.window.showInformationMessage('没有选择任何文件');
        return;
      }

      const OUTPUT_DIR = path.join(workspacePath, 'packs');
      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }

      const outputFilename = formatFilename(config, workspaceFolder);
      const outputPath = path.join(OUTPUT_DIR, outputFilename);

      await packFiles(filesToPack, outputPath, workspacePath);

      const openChoice = await vscode.window.showInformationMessage(
        `打包完成！共 ${filesToPack.length} 个文件`,
        '打开文件夹',
        '关闭'
      );

      if (openChoice === '打开文件夹') {
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
      }

    } catch (error) {
      vscode.window.showErrorMessage(`打包失败: ${error.message}`);
      console.error(error);
    }
  });

  let packRangeDisposable = vscode.commands.registerCommand('packer.packRange', async () => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('请先打开一个工作区');
      return;
    }

    const git = simpleGit(workspaceFolder.uri.fsPath);
    const config = getConfiguration();
    const workspacePath = workspaceFolder.uri.fsPath;

    try {
      const commitMode = await vscode.window.showQuickPick(
        [
          { label: '选择最近提交', value: 'recent' },
          { label: '输入提交哈希', value: 'input' },
          { label: '选择分支/标签', value: 'branch' }
        ],
        { placeHolder: '选择起点方式' }
      );

      if (!commitMode) {
        return;
      }

      let rev1 = null, rev2 = null;
      let rev1Display = null, rev2Display = null;

      if (commitMode.value === 'recent') {
        const [commits, branches, tags] = await Promise.all([
          git.log({ maxCount: 50 }),
          git.branchLocal(),
          git.tags()
        ]);

        if (commits.all.length === 0) {
          vscode.window.showInformationMessage('没有找到提交记录');
          return;
        }

        const refMap = new Map();
        
        for (const branch of branches.all) {
          try {
            const hash = await git.revparse([branch]);
            if (!refMap.has(hash)) refMap.set(hash, []);
            refMap.get(hash).push(`分支:${branch}`);
          } catch (_) {
            // ignore error for detached branches
          }
        }

        for (const tag of tags.all) {
          try {
            const hash = await git.revparse([tag]);
            if (!refMap.has(hash)) refMap.set(hash, []);
            refMap.get(hash).push(`标签:${tag}`);
          } catch (_) {
            // ignore error for invalid tags
          }
        }

        const commitItems = commits.all.map(commit => {
          const refs = refMap.get(commit.hash) || [];
          const refStr = refs.length > 0 ? ` (${refs.join(', ')})` : '';
          return {
            label: `${commit.hash.substring(0, 8)} - ${commit.message.split('\n')[0]}${refStr}`,
            description: commit.date,
            value: commit.hash,
            display: `${commit.hash.substring(0, 8)}${refStr}`
          };
        });

        const commit1 = await vscode.window.showQuickPick(
          commitItems,
          { placeHolder: '选择起点提交' }
        );

        if (!commit1) {
          return;
        }
        rev1 = commit1.value;
        rev1Display = commit1.display;

        const commit2 = await vscode.window.showQuickPick(
          [...commitItems],
          { placeHolder: '选择终点提交（默认使用当前HEAD）' }
        );

        rev2 = commit2 ? commit2.value : 'HEAD';
        rev2Display = commit2 ? commit2.display : 'HEAD';

      } else if (commitMode.value === 'input') {
        rev1 = await vscode.window.showInputBox({
          placeHolder: '输入起点提交哈希、分支名或标签（如：HEAD~1）',
          prompt: '起点提交'
        });

        if (!rev1) {
          return;
        }
        rev1Display = rev1;

        rev2 = await vscode.window.showInputBox({
          placeHolder: '输入终点提交哈希、分支名或标签（默认使用当前HEAD）',
          prompt: '终点提交（留空使用HEAD）'
        }) || 'HEAD';
        rev2Display = rev2;

      } else if (commitMode.value === 'branch') {
        const branches = await git.branchLocal();
        const tags = await git.tags();

        const branchItems = branches.all.map(b => ({ label: `分支: ${b}`, value: b, display: b }));
        const tagItems = tags.all.map(t => ({ label: `标签: ${t}`, value: t, display: t }));

        const ref1 = await vscode.window.showQuickPick(
          [...branchItems, ...tagItems],
          { placeHolder: '选择起点分支/标签' }
        );

        if (!ref1) {
          return;
        }
        rev1 = ref1.value;
        rev1Display = ref1.display;

        const ref2 = await vscode.window.showQuickPick(
          [...branchItems, ...tagItems, { label: '当前 HEAD', value: 'HEAD', display: 'HEAD' }],
          { placeHolder: '选择终点分支/标签' }
        );

        if (!ref2) {
          return;
        }
        rev2 = ref2.value;
        rev2Display = ref2.display;
      }

      if (!rev1 || !rev2) {
        return;
      }

      vscode.window.showInformationMessage(`正在对比 ${rev1Display} 和 ${rev2Display}...`);

      const diffSummary = await git.diffSummary([`${rev1}...${rev2}`]);
      const changedFiles = diffSummary.files.map(f => f.file);

      if (changedFiles.length === 0) {
        vscode.window.showInformationMessage('两个提交之间没有文件变动');
        return;
      }

      const filesToPack = await selectFilesToPack(changedFiles);
      if (filesToPack === null) {
        return;
      }

      if (filesToPack.length === 0) {
        vscode.window.showInformationMessage('没有选择任何文件');
        return;
      }

      const OUTPUT_DIR = path.join(workspacePath, 'packs');
      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }

      const outputFilename = formatFilename(config, workspaceFolder, {
        start: rev1Display,
        end: rev2Display
      });
      const outputPath = path.join(OUTPUT_DIR, outputFilename);

      await packFilesFromRevisions(filesToPack, rev1, rev2, outputPath, workspacePath, git);

      const openChoice = await vscode.window.showInformationMessage(
        `打包完成！共 ${filesToPack.length} 个文件`,
        '打开文件夹',
        '关闭'
      );

      if (openChoice === '打开文件夹') {
        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputPath));
      }

    } catch (error) {
      vscode.window.showErrorMessage(`打包失败: ${error.message}`);
      console.error(error);
    }
  });

  context.subscriptions.push(packChangesDisposable, packRangeDisposable);
}

async function packFiles(files, outputPath, workspacePath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    files.forEach(file => {
      if (!isPathSafe(workspacePath, file)) {
        console.warn(`Skipping unsafe path: ${file}`);
        return;
      }
      const fullPath = path.join(workspacePath, file);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        archive.file(fullPath, { name: file });
      }
    });

    archive.finalize();
  });
}

async function packFilesFromRevisions(files, rev1, rev2, outputPath, workspacePath, git) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    const promises = files.map(async (file) => {
      if (!isPathSafe(workspacePath, file)) {
        console.warn(`Skipping unsafe path: ${file}`);
        return;
      }
      try {
        const content = await git.show([`${rev2}:${file}`]);
        archive.append(Buffer.from(content, 'utf8'), { name: file });
      } catch (error) {
        const fullPath = path.join(workspacePath, file);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          archive.file(fullPath, { name: file });
        }
      }
    });

    Promise.all(promises).then(() => {
      archive.finalize();
    }).catch(reject);
  });
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
