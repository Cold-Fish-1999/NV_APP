# NVAPP Monorepo 本地搭建与测试

基于 `SPEC.md` 的 monorepo 结构，按以下步骤搭建并验证。

---

## 一、环境要求

- Node.js 18+
- pnpm 9+
- （可选）Xcode + iOS Simulator，或物理 iOS 设备

---

## 二、逐步命令

### 1. 安装 pnpm（若未安装）

```bash
npm install -g pnpm
```

### 2. 进入项目根目录并安装依赖

```bash
cd /Applications/NVAPP
pnpm install
```

> **若此前已安装过**：`.npmrc` 中使用了 `node-linker=hoisted`，建议先删除 `node_modules` 和 `pnpm-lock.yaml`，再执行 `pnpm install` 重新安装。

### 3. 构建 shared 包（供 server 与 mobile 使用）

```bash
pnpm --filter @nvapp/shared build
```

### 4. 启动 Server（Next.js API）

```bash
pnpm dev:server
```

或单独在 `apps/server` 目录：

```bash
cd apps/server && pnpm dev
```

- 默认地址：**http://localhost:3000**
- 入口页会列出 API 链接

### 5. 启动 Mobile（Expo）

**新开一个终端**，在项目根目录执行：

```bash
pnpm dev:mobile
```

或：

```bash
cd apps/mobile && pnpm dev
```

### 6. 同时启动 mobile + server

```bash
pnpm dev:all
```

或使用根目录的 `dev` 脚本（若配置了 `--parallel`）：

```bash
pnpm dev
```

---

## 三、API 列表（空壳 Mock）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/daily-logs?startDate=&endDate=` | 查询 Daily Log（Mock） |
| GET | `/api/health-profile` | 查询健康档案（Mock） |
| POST | `/api/chat` | 聊天（Mock），Body: `{ message, date }` |

---

## 四、测试方式

### A. Server 测试

- **浏览器**：打开 http://localhost:3000
- **curl**：
  ```bash
  curl http://localhost:3000/api/health
  curl "http://localhost:3000/api/daily-logs?startDate=2025-02-01&endDate=2025-02-28"
  curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"message":"头痛","date":"2025-02-21"}'
  ```

### B. Mobile 测试

| 方式 | 适用场景 | 操作 |
|------|----------|------|
| **Expo Go（手机扫码）** | 真机快速验证 | 终端显示 QR 码，用 Expo Go App 扫码 |
| **iOS Simulator** | Mac 上模拟器 | 在终端按 `i`，或 `pnpm ios` |
| **Android Emulator** | 模拟器 | 在终端按 `a`，或 `pnpm android` |
| **Web** | 浏览器本地验证 | 在终端按 `w`，或 `pnpm web`，打开 localhost:8081 |

**结论：**

- **不需要 iPhone 也能快速验证**：用 `pnpm web` 在浏览器中打开，可验证三个 Tab 切换和 UI。
- **想看原生效果**：Mac 上按 `i` 用 iOS Simulator，或手机装 Expo Go 扫码。

### C. Mobile 调用 Server

在 `apps/mobile` 中配置 API 基地址。开发时：

- **模拟器/真机**：用电脑局域网 IP，例如 `http://192.168.x.x:3000`
- **Web**：可用 `http://localhost:3000`

---

## 五、目录结构概览

```
/Applications/NVAPP
├── package.json          # 根脚本：dev:all, dev:mobile, dev:server
├── pnpm-workspace.yaml
├── SPEC.md
├── SETUP.md
├── apps/
│   ├── mobile/           # Expo + expo-router，三个 Tab 空壳
│   │   ├── app/
│   │   │   ├── _layout.tsx
│   │   │   └── (tabs)/
│   │   │       ├── _layout.tsx
│   │   │       ├── index.tsx      # 聊天
│   │   │       ├── calendar.tsx   # 日历
│   │   │       └── profile.tsx    # 档案
│   │   └── package.json
│   └── server/           # Next.js App Router API
│       ├── app/
│       │   ├── api/
│       │   │   ├── health/route.ts
│       │   │   ├── daily-logs/route.ts
│       │   │   ├── health-profile/route.ts
│       │   │   └── chat/route.ts
│       │   ├── layout.tsx
│       │   └── page.tsx
│       └── package.json
└── packages/
    └── shared/           # DailyLog 等 zod schema
        ├── src/
        │   ├── daily-log.ts
        │   └── index.ts
        └── package.json
```

---

*完成以上步骤后，应能同时启动 mobile 和 server，并通过 localhost 或 Expo 进行基本验证。*
