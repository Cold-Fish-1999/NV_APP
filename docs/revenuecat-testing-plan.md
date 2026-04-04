# RevenueCat 订阅测试方案

## 一、前置准备

### 1.1 RevenueCat 账号
- 注册 [RevenueCat](https://app.revenuecat.com)
- 创建项目，选择 iOS（后续可加 Android）

### 1.2 App Store Connect 配置
- 在 [App Store Connect](https://appstoreconnect.apple.com) 创建 App（如已有可跳过）
- **App 内购买项目** → 创建订阅组和产品：
  - 订阅组：`NVAPP Premium`
  - 产品 ID（需与 RevenueCat 一致）：
    - `prime_monthly` / `prime_yearly`
    - `pro_monthly` / `pro_yearly`

### 1.3 RevenueCat 配置
- **Products**：添加上述 Product ID，关联到 App Store Connect
- **Entitlements**：创建 `pro`、`prime`（或统一 `premium`）
- **Offerings**：配置展示包，例如：
  - `default`：包含 Prime / Pro 的套餐选择

---

## 二、App 端集成

### 2.1 安装依赖

```bash
pnpm add react-native-purchases --filter mobile
```

### 2.2 初始化（建议在 App 入口）

```ts
// lib/revenuecat.ts
import Purchases, { LOG_LEVEL } from "react-native-purchases";

const REVENUECAT_API_KEY_IOS = "appl_xxxx"; // RevenueCat 项目 → API Keys → iOS

export async function initRevenueCat(userId?: string) {
  await Purchases.setLogLevel(LOG_LEVEL.DEBUG); // 测试时开启

  await Purchases.configure({ apiKey: REVENUECAT_API_KEY_IOS });

  if (userId) {
    await Purchases.logIn(userId); // 关联 Supabase 用户
  }
}

export const revenuecat = Purchases;
```

### 2.3 获取套餐与购买

```ts
// 获取可购买套餐
const offerings = await Purchases.getOfferings();
const defaultOffering = offerings.current;

// 购买
const { customerInfo } = await Purchases.purchasePackage(pkg);
// customerInfo.entitlements.active["pro"] 可判断是否 Pro
```

### 2.4 权限判断

```ts
const customerInfo = await Purchases.getCustomerInfo();
const isPro = typeof customerInfo.entitlements.active["pro"] !== "undefined";
const isPrime = typeof customerInfo.entitlements.active["prime"] !== "undefined";
```

---

## 三、测试流程

### 3.1 Sandbox 测试（推荐）

| 步骤 | 操作 |
|------|------|
| 1 | 在 Xcode 或真机用 **Sandbox 测试账号** 登录（设置 → App Store → 沙盒账号） |
| 2 | 运行 App，进入定价页，点击购买 |
| 3 | 弹出沙盒购买确认，**不会扣真实款项** |
| 4 | 在 RevenueCat Dashboard → **Customers** 查看该用户订阅状态 |
| 5 | 在 App 内用 `Purchases.getCustomerInfo()` 验证权限 |

### 3.2 StoreKit 本地测试（无需 App Store Connect）

| 步骤 | 操作 |
|------|------|
| 1 | Xcode → File → New → **StoreKit Configuration File** |
| 2 | 添加产品 ID（与 RevenueCat 中一致） |
| 3 | 在 Scheme → Run → Options 中勾选该 StoreKit 配置文件 |
| 4 | 运行 App，购买走本地模拟，不连真实 App Store |

### 3.3 RevenueCat 沙盒模式

- RevenueCat 会自动识别 Sandbox 环境
- Dashboard 中可看到 **Sandbox** 标记的测试购买
- 可手动 **Grant Promotional Entitlement** 模拟给用户开通 Pro

---

## 四、与 Supabase 对接（可选）

### 4.1 Webhook 同步

在 RevenueCat → **Project Settings → Integrations** 添加 Webhook：

- URL：`https://你的后端.supabase.co/functions/v1/revenuecat-webhook`
- 事件：`INITIAL_PURCHASE`、`RENEWAL`、`CANCELLATION` 等

Webhook 收到后写入 Supabase `subscriptions` 表，供 RLS 和业务逻辑使用。

### 4.2 仅用 RevenueCat 做权限（不写 Supabase）

在需要权限的地方直接调用：

```ts
const customerInfo = await Purchases.getCustomerInfo();
if (customerInfo.entitlements.active["pro"]) {
  // 允许 Pro 功能
}
```

适合先做 MVP，后续再接入 Supabase。

---

## 五、测试检查清单

- [ ] RevenueCat 项目创建，API Key 配置
- [ ] App Store Connect 订阅产品创建（或 StoreKit 配置）
- [ ] 安装 `react-native-purchases` 并初始化
- [ ] 定价页：选择套餐 → 调用 `purchasePackage` → 成功/失败处理
- [ ] 沙盒账号登录，完成一次测试购买
- [ ] RevenueCat Dashboard 可看到该用户
- [ ] App 内 `getCustomerInfo()` 返回正确 entitlements
- [ ] 权限：Pro 功能根据 `entitlements.active["pro"]` 正确显示/隐藏

---

## 六、常见问题

| 问题 | 处理 |
|------|------|
| 购买后 entitlements 为空 | 检查 RevenueCat 中 Product ID 与 App Store Connect 是否一致 |
| Sandbox 购买不弹窗 | 确认已登录沙盒账号，且设备未登录正式 Apple ID |
| Expo 无法用 native 模块 | 需 `expo prebuild` + `expo run:ios` 生成 development build |
| 恢复购买 | 调用 `Purchases.restorePurchases()` |

---

## 七、参考链接

- [RevenueCat 文档](https://www.revenuecat.com/docs)
- [React Native Purchases](https://www.revenuecat.com/docs/getting-started/installation/reactnative)
- [RevenueCat + Supabase Webhook](https://www.revenuecat.com/docs/webhooks)
