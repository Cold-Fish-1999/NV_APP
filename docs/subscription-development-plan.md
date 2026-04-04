# 订阅系统开发计划（RevenueCat + Supabase）

## 架构概览

```
App → RevenueCat SDK → App Store
         ↓ (webhook)
      Supabase Edge Function
         ↓
      Supabase DB (user_entitlements)
         ↓
      App 读取权限
```

**设计原则**：Supabase 只存「用户当前是否有权限」，不镜像 RevenueCat 全部数据。

---

## 数据库设计

### user_entitlements 表

```sql
create table user_entitlements (
  user_id uuid references auth.users primary key,
  is_pro boolean default false,
  plan_id text,                    -- e.g. 'monthly', 'annual'
  expires_at timestamptz,
  rc_customer_id text,             -- RevenueCat customer ID
  updated_at timestamptz default now()
);

-- RLS: 用户只能读自己的
alter table user_entitlements enable row level security;
create policy "users read own" on user_entitlements
  for select using (auth.uid() = user_id);
```

---

## 开发阶段

### 第一阶段：RevenueCat 配置（不写代码）

- [ ] 注册 RevenueCat，创建 App（选 iOS）
- [ ] 在 App Store Connect 创建订阅产品（Sandbox 环境）
- [ ] 在 RevenueCat 配置 Entitlement（如 `pro`）→ Product → Offering
- [ ] 在 RevenueCat Dashboard 设置 Webhook → 指向 Supabase Edge Function URL

### 第二阶段：App 端集成

```bash
npx expo install react-native-purchases react-native-purchases-ui
```

**核心逻辑**：

```typescript
// 初始化（App 启动时）
await Purchases.configure({ apiKey: RC_API_KEY });
await Purchases.logIn(supabaseUserId); // 关联你的用户

// 检查权限
const { entitlements } = await Purchases.getCustomerInfo();
const isPro = entitlements.active['pro'] !== undefined;

// 购买
const offerings = await Purchases.getOfferings();
await Purchases.purchasePackage(offerings.current.monthly);
```

### 第三阶段：Supabase Webhook Edge Function

```typescript
// supabase/functions/revenuecat-webhook/index.ts
Deno.serve(async (req) => {
  const payload = await req.json();
  const { event } = payload;
  
  const userId = event.app_user_id; // 即 supabaseUserId
  const isActive = ['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION']
    .includes(event.type);

  await supabase.from('user_entitlements').upsert({
    user_id: userId,
    is_pro: isActive,
    plan_id: event.product_id,
    expires_at: event.expiration_at,
    rc_customer_id: event.id,
    updated_at: new Date().toISOString()
  });

  return new Response('ok');
});
```

### 第四阶段：Sandbox 端到端测试

### 第五阶段：提交 App Review

---

## 测试流程

### Sandbox 测试（不花真钱）

1. 在 App Store Connect 创建 **Sandbox 测试账号**（独立邮箱）
2. 在真机上退出 App Store 账号，用 Sandbox 账号登录
3. 走正常购买流程 → 不会扣钱，但走完整逻辑
4. Sandbox 订阅周期压缩：月订阅 = 5 分钟，年订阅 = 1 小时

### 权限测试检查清单

- [ ] 新用户 → 无权限 → UI 显示 paywall
- [ ] 购买成功 → webhook 触发 → DB 更新 → UI 刷新
- [ ] 订阅到期 → webhook 触发 → is_pro = false → UI 降级
- [ ] 恢复购买（reinstall 场景）

---

## 推荐开发顺序

1. **先开发权限 UI**（用手动 DB 数据 mock）← 当前阶段
   - 执行 `008_user_entitlements.sql` 创建表
   - 按 `docs/subscription-mock-testing.md` 手动插入/更新 mock 数据
   - 使用 `useSubscription()` 读取 `status.isPro`，控制 Paywall 与 Pro 功能展示
2. 配置 RevenueCat + App Store Connect（纯后台操作）
3. 集成 SDK，接 Paywall UI
4. 部署 Edge Function，测试 Webhook
5. Sandbox 端到端测试
6. 提交 App Review

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `supabase/migrations/008_user_entitlements.sql` | 表结构 |
| `docs/subscription-mock-testing.md` | Mock 数据与测试步骤 |
| `apps/mobile/lib/subscriptionService.ts` | 读取订阅状态 |
| `apps/mobile/contexts/subscription.tsx` | `useSubscription()` hook |
