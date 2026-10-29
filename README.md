# Web FinalShell (CloudShell Pro)

基于 **Cloudflare Workers 原生全栈架构** 的网页版 FinalShell。单 Worker 覆盖：
* **SSH 交互式终端**（多标签切换、分屏、Xterm.js WebGL 硬件加速）
* **无 Agent 实时服务器监控**（CPU/内存/实时网速/磁盘/Top 进程表）
* **可视化 SFTP 文件管理**（文件树浏览、分片上传下载、Monaco 在线代码编辑）
* **快捷命令库**（分类管理、一键输入、多服务器批量广播）
* **零知识端到端加密云同步**（主密码 PBKDF2 派生 + AES-256-GCM 本地加解密，D1 数据库零明文凭据）
* **GitHub Actions 全自动部署**（代码 Push 即自动执行 D1 Schema 迁移与边缘节点发布）

---

## 快速开始

### 1. 本地依赖安装
```bash
pnpm install
```

### 2. 生成与应用 D1 数据库表结构
```bash
# 生成 SQL 迁移文件
pnpm drizzle:generate

# 本地 SQLite 测试环境迁移
pnpm d1:migrate:local
```

### 3. 本地启动开发
```bash
# 启动 Vite 前端热更新服务器
pnpm dev

# 或使用 Wrangler 本地模拟 Cloudflare Workers & Durable Objects
pnpm preview
```

---

## GitHub Actions 自动化部署配置

本项目已内置 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。

在 GitHub 仓库中，进入 **Settings -> Secrets and variables -> Actions**，添加以下两个 Secret：
1. `CLOUDFLARE_API_TOKEN`：拥有 Workers 及 D1 编辑权限的 Cloudflare API Token。
2. `CLOUDFLARE_ACCOUNT_ID`：你的 Cloudflare 账户 ID。

随后在 [wrangler.jsonc](wrangler.jsonc) 中将 `database_id` 填入你在 Cloudflare 控制台创建的 D1 数据库 UUID 即可。
每次向 `main` 分支执行 `git push`，GitHub Actions 就会自动完成：
`类型检查 -> 前后端全量编译 -> 远程 D1 表结构迁移 -> 全球边缘节点一键发布`。
