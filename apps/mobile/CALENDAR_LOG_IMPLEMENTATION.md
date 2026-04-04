# Calendar Log 实现说明

## 新增/修改文件

### 新增
- `types/calendar.ts` - 类型定义
- `lib/dateUtils.ts` - 日期格式化、标签聚合、时间分区
- `lib/calendarService.ts` - 数据拉取与按日期聚合
- `lib/__tests__/dateUtils.test.ts` - dateUtils 单元测试
- `lib/__tests__/calendarService.test.ts` - calendarService 单元测试
- `components/calendar/TagPills.tsx` - 标签展示
- `components/calendar/CalendarRow.tsx` - 日历行
- `components/calendar/CalendarRowSkeleton.tsx` - 加载骨架
- `components/calendar/EmptyState.tsx` - 空态
- `components/calendar/DateSidebar.tsx` - 单日详情左侧日期列表
- `components/calendar/DayDetailView.tsx` - 单日详情右侧内容
- `components/calendar/TimeSlotSection.tsx` - 时间分区区块
- `app/(tabs)/calendar/_layout.tsx` - 日历 Stack 布局
- `app/(tabs)/calendar/index.tsx` - 日历聚合列表
- `app/(tabs)/calendar/[date].tsx` - 单日详情
- `jest.config.js` - Jest 配置

### 修改
- `app/(tabs)/calendar.tsx` → 删除，由 `calendar/index.tsx` 替代
- `package.json` - 新增 jest、jest-expo、@types/jest，新增 test 脚本

## 如何运行

```bash
# 安装依赖（含新加的 jest）
pnpm install

# 启动 App
pnpm dev:mobile

# 运行单元测试
cd apps/mobile && pnpm test
```

## 关键实现说明

### 1. 数据流
- 从 Supabase `symptom_summaries` 表拉取数据（RLS 保证用户只能看自己的）
- `fetchSymptomSummaries(userId, fromDate, toDate)` 按日期范围查询
- `groupByDateAndAggregate(entries)` 按 `local_date` 分组，并调用 `aggregateTags` 聚合标签

### 2. 标签聚合逻辑
- 来源：`meta.symptom_keywords`
- 规则：去重；count = 出现次数；按 count 降序；取前 N 个（默认 5）
- 实现：`lib/dateUtils.ts` 的 `aggregateTags()`

### 3. 时间分区
- Early Morning: 6:00–9:00
- Late Morning: 9:00–12:00
- Afternoon: 12:00–18:00
- Evening: 18:00–22:00
- Night: 22:00–6:00（跨日）
- 根据 `created_at` 的 hour 分配到对应分区

### 4. 无限滚动
- 列表按日期倒序，每次加载 30 天
- 滚动到底部时 `onEndReached` 加载更早的日期
- 首次加载后尝试将「今天」滚动到视图中部（`scrollToIndex`）

### 5. 路由
- `/(tabs)/calendar` → 日历列表
- `/(tabs)/calendar/[date]` → 单日详情（左侧日期栏 + 右侧详情）
