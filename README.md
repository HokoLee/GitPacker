# Git Packer - File Archive - VS Code 扩展

基于Git变动文件的快速压缩打包VS Code扩展。

## 功能特性

- **打包工作区变动**：自动检测Git变动文件（修改、新增、重命名、未跟踪的文件）
- **打包提交范围**：对比两个Git节点（提交、分支、标签）并打包改动的文件
- 支持选择全部或部分文件进行打包
- 多种节点选择方式：最近提交、手动输入、分支/标签选择
- **节点标记显示**：选择提交时会显示该提交上的标签和分支信息
- **自定义文件名格式**：支持通过配置自定义打包文件名
- 压缩包中保留文件的完整路径
- 自动在 `packs` 目录下生成带时间戳的ZIP文件
- 友好的用户界面和进度提示
- 打包完成后可直接打开文件夹查看

## 安装

### 本地开发模式

```bash
npm install
```

### 打包安装

```bash
npm install -g vsce
vsce package
```

然后在VS Code中通过 `扩展: 从VSIX安装` 命令安装生成的 `.vsix` 文件。

## 使用方法

### 功能一：打包工作区变动文件

1. 在VS Code中打开一个Git仓库
2. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (Mac)
3. 输入并选择 `Git Pack: 打包变动文件`
4. 选择打包方式：
   - 打包所有变动文件
   - 选择要打包的文件
5. 等待打包完成，可选择打开文件夹查看

### 功能二：打包提交范围

1. 在VS Code中打开一个Git仓库
2. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (Mac)
3. 输入并选择 `Git Pack: 打包提交范围`
4. 选择节点选择方式：
   - **选择最近提交**：从最近50个提交中选择起点和终点
   - **输入提交哈希**：手动输入提交哈希、分支名或标签
   - **选择分支/标签**：从现有的分支和标签中选择
5. 选择要打包的文件（全部或部分）
6. 等待打包完成，可选择打开文件夹查看

## 文件说明

- `extension.js` - VS Code扩展主入口文件
- `package.json` - 扩展配置和依赖
- `pack.js` - 旧版脚本文件（保留用于兼容）

## 输出

默认文件名格式：`<项目名> <时间> <签名>.zip`（例如：`myproject 20260514-10 GitPack.zip`）

- **工作区变动**：使用配置的文件名格式
- **提交范围**：使用配置的文件名格式，支持 `{start}` 和 `{end}` 变量

打包文件保存在项目根目录的 `packs/` 文件夹下。

## 配置选项

在 VS Code 设置中搜索 "Git Packer" 进行配置：

### `gitPacker.filenameFormat`
- 类型: `string`
- 默认值: `{project} {time} {signature}.zip`
- 描述: 打包文件名格式

**支持的变量:**
- `{project}` - 项目名称
- `{time}` - 自定义的时间格式
- `{date}` - 日期 (YYYYMMDD)
- `{signature}` - 自定义签名
- `{start}` - 起点引用 (范围打包专用)
- `{end}` - 终点引用 (范围打包专用)

### `gitPacker.timeFormat`
- 类型: `string`
- 默认值: `YYYYMMDD-HH`
- 描述: 时间格式字符串

**支持的格式标记:**
- `YYYY` - 年 (4位)
- `MM` - 月 (2位)
- `DD` - 日 (2位)
- `HH` - 时 (2位)
- `mm` - 分 (2位)
- `ss` - 秒 (2位)

### `gitPacker.signature`
- 类型: `string`
- 默认值: `GitPacker`
- 描述: 签名字符串

### 配置示例

```json
{
  "gitPacker.filenameFormat": "{project}_{time}_{signature}.zip",
  "gitPacker.timeFormat": "YYYYMMDD-HHmm",
  "gitPacker.signature": "myproject"
}
```

## 开发调试

在VS Code中：
1. 按 `F5` 打开扩展开发宿主窗口
2. 在新窗口中测试扩展功能
