# 订阅权限 Mock 测试指南

在接入 RevenueCat 之前，用手动 DB 数据测试不同权限状态下的 UI 和限制。

---

## 1. 执行 Migration

在 Supabase Dashboard → SQL Editor 中执行：

```
supabase/migrations/008_user_entitlements.sql
```

---

## 2. 获取当前用户 ID

登录 App 后，在 Supabase Dashboard → **Authentication** → **Users** 中复制你的 `user_id`（UUID）。

或临时在 App 里打印：

```ts
const { data: { user } } = await supabase.auth.getUser();
console.log("user_id:", user?.id);
```

---

## 3. Mock 数据 SQL

### 场景 A：无权限（Free 用户）

```sql
-- 删除该用户的权限记录，或确保不存在
delete from user_entitlements where user_id = '你的-user-id';
```

或显式插入 Free 状态：

```sql
insert into user_entitlements (user_id, is_pro, plan_id, expires_at, updated_at)
values (
  '你的-user-id'::uuid,
  false,
  null,
  null,
  now()
)
on conflict (user_id) do update set
  is_pro = false,
  plan_id = null,
  expires_at = null,
  updated_at = now();
```

### 场景 B：有 Pro 权限（有效期内）

```sql
insert into user_entitlements (user_id, is_pro, plan_id, expires_at, updated_at)
values (
  '你的-user-id'::uuid,
  true,
  'annual',
  now() + interval '30 days',
  now()
)
on conflict (user_id) do update set
  is_pro = true,
  plan_id = 'annual',
  expires_at = now() + interval '30 days',
  updated_at = now();
```

### 场景 C：Pro 已过期

```sql
insert into user_entitlements (user_id, is_pro, plan_id, expires_at, updated_at)
values (
  '你的-user-id'::uuid,
  false,
  'annual',
  now() - interval '1 day',  -- 已过期
  now()
)
on conflict (user_id) do update set
  is_pro = false,
  plan_id = 'annual',
  expires_at = now() - interval '1 day',
  updated_at = now();
```

### 场景 D：Prime 用户（如后续区分 Prime/Pro）

当前表只有 `is_pro`，若需区分 Prime，可扩展字段或先用 `is_pro = false` + `plan_id = 'prime'` 表示 Prime（需改表结构）。  
**本阶段**：先测 `is_pro = true/false` 两种状态即可。

---

## 4. 权限测试检查清单

| 场景 | user_entitlements | 预期 UI/限制 |
|------|-------------------|--------------|
| 新用户 / Free | 无记录 或 `is_pro=false` | 显示 Paywall，Pro 功能受限 |
| Pro 有效 | `is_pro=true`，`expires_at` 在未来 | 无 Paywall，Pro 功能可用 |
| Pro 过期 | `is_pro=false` 或 `expires_at` 在过去 | 显示 Paywall，Pro 功能受限 |

---

## 5. 快速切换脚本（复制即用）

替换 `YOUR_USER_ID` 后执行：

```sql
-- 切换为 Pro（30 天有效）
insert into user_entitlements (user_id, is_pro, plan_id, expires_at, updated_at)
values (
  'YOUR_USER_ID'::uuid,
  true,
  'annual',
  now() + interval '30 days',
  now()
)
on conflict (user_id) do update set
  is_pro = excluded.is_pro,
  plan_id = excluded.plan_id,
  expires_at = excluded.expires_at,
  updated_at = excluded.updated_at;

-- 切换为 Free（无权限）
insert into user_entitlements (user_id, is_pro, plan_id, expires_at, updated_at)
values (
  'YOUR_USER_ID'::uuid,
  false,
  null,
  null,
  now()
)
on conflict (user_id) do update set
  is_pro = excluded.is_pro,
  plan_id = excluded.plan_id,
  expires_at = excluded.expires_at,
  updated_at = excluded.updated_at;
```

---

## 6. App 端读取逻辑

已实现：

- **`lib/subscriptionService.ts`**：从 `user_entitlements` 读取，并根据 `expires_at` 判断是否有效
- **`contexts/subscription.tsx`**：提供 `useSubscription()` hook

### 使用示例

```tsx
import { useSubscription } from "@/contexts/subscription";

function SomeScreen() {
  const { status, isLoading } = useSubscription();

  if (isLoading) return null;
  if (!status?.isPro) {
    // 显示 Paywall 或限制功能
    return <PaywallPrompt />;
  }
  // Pro 功能
  return <ProFeature />;
}
```

### 刷新权限

购买成功或恢复购买后，调用 `refetch()` 刷新：

```tsx
const { refetch } = useSubscription();
await refetch();
```
