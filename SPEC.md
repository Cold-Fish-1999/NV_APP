# AI 健康监控 App MVP 规格说明

> 版本：1.0 | 状态：MVP | 更新日期：2025-02-21

---

## 1. 概述

### 1.1 产品定位
一款面向 iOS（首期）/ Android 的 AI 健康监控应用。用户通过**文字或语音**与 AI 对话，自然化描述每日症状、感受、工作生活状态等；AI 自动结构化生成 Daily Log 并持久化，亦可从对话中提取背景信息更新健康档案。支持健康档案管理（含**诊疗记录图片上传**）与历史回顾。

### 1.2 技术栈

| 层级 | 技术选型 | 说明 |
|------|----------|------|
| 前端 | Expo + React Native + TypeScript | 跨平台，优先 iOS，预留 Android |
| 语音 | expo-speech / @react-native-voice/voice | 客户端 STT，转文本后走 Chat API |
| 图片 | expo-image-picker + Supabase Storage | 诊疗记录等图片上传 |
| 认证 | Supabase Auth (Magic Link) | 无密码邮箱登录 |
| 后端 | Node.js (Express/Fastify) | REST API |
| 数据库 | PostgreSQL | 主数据存储 |
| LLM | 后端代理调用 | OpenAI / 国产兼容接口 |

---

## 2. 页面结构

```
App
├── (auth)
│   ├── LoginScreen           # Magic Link 邮箱登录
│   └── AuthCallbackScreen    # 回调处理（Supabase 重定向）
│
├── (main) - Tab Navigator
│   ├── ChatTab
│   │   └── ChatScreen        # AI 对话：文字/语音输入，可选图片；症状/感受/背景信息录入
│   │
│   ├── CalendarTab
│   │   └── CalendarScreen    # 日历视图，点击查看当日 Daily Log
│   │
│   └── ProfileTab
│       ├── ProfileScreen     # 健康档案入口 + 概览
│       └── ProfileEditScreen # 编辑健康档案：表单 + 诊疗记录图片上传
│
└── (modal)
    └── DailyLogDetailScreen  # 单日日志详情（Modal / Stack）
```

### 2.1 页面职责简述

| 页面 | 职责 |
|------|------|
| **LoginScreen** | 输入邮箱，发起 Magic Link，等待验证 |
| **AuthCallbackScreen** | 处理 Supabase 回调，完成登录 |
| **ChatScreen** | 文字/语音输入，可选附图片；AI 根据对话生成 Daily Log 或更新健康档案 |
| **CalendarScreen** | 按月日历，标记有日志的日期，点击进入详情 |
| **ProfileScreen** | 展示健康档案摘要，进入编辑 |
| **ProfileEditScreen** | 表单编辑：基本信息、工作、饮食、诊疗记录（含图片上传）、家族史 |
| **DailyLogDetailScreen** | 查看某一天的 Daily Log 详情 |

---

## 3. 数据模型

### 3.1 ER 关系（概念）

```
users (Supabase Auth，仅 id/email 等)
  │
  ├── health_profiles (1:1)
  │
  └── daily_logs (1:N)
```

### 3.2 DailyLog JSON Schema

DailyLog 按**五个时间段**组织：清晨、上午、中午、晚上、深夜。AI 根据用户描述中的时间词（如「早上」「下午」「睡前」）将内容归入对应时段。

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["userId", "date", "rawInput", "structuredContent", "createdAt"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "userId": { "type": "string", "format": "uuid" },
    "date": { "type": "string", "format": "date", "description": "YYYY-MM-DD" },
    "rawInput": {
      "type": "string",
      "description": "用户原始描述文本"
    },
    "structuredContent": {
      "type": "object",
      "description": "按五个时间段组织的 AI 半结构化提取结果",
      "properties": {
        "earlyMorning": {
          "type": "object",
          "description": "清晨（约 5:00–8:00）",
          "properties": {
            "symptoms": { "type": "array", "items": { "type": "string" } },
            "feelings": { "type": "array", "items": { "type": "string" } },
            "behaviors": { "type": "array", "items": { "type": "string" } },
            "notes": { "type": "string" }
          }
        },
        "morning": {
          "type": "object",
          "description": "上午（约 8:00–12:00）",
          "properties": {
            "symptoms": { "type": "array", "items": { "type": "string" } },
            "feelings": { "type": "array", "items": { "type": "string" } },
            "behaviors": { "type": "array", "items": { "type": "string" } },
            "notes": { "type": "string" }
          }
        },
        "noon": {
          "type": "object",
          "description": "中午（约 12:00–14:00）",
          "properties": {
            "symptoms": { "type": "array", "items": { "type": "string" } },
            "feelings": { "type": "array", "items": { "type": "string" } },
            "behaviors": { "type": "array", "items": { "type": "string" } },
            "notes": { "type": "string" }
          }
        },
        "evening": {
          "type": "object",
          "description": "晚上（约 18:00–22:00）",
          "properties": {
            "symptoms": { "type": "array", "items": { "type": "string" } },
            "feelings": { "type": "array", "items": { "type": "string" } },
            "behaviors": { "type": "array", "items": { "type": "string" } },
            "notes": { "type": "string" }
          }
        },
        "lateNight": {
          "type": "object",
          "description": "深夜（约 22:00–次日 2:00）",
          "properties": {
            "symptoms": { "type": "array", "items": { "type": "string" } },
            "feelings": { "type": "array", "items": { "type": "string" } },
            "behaviors": { "type": "array", "items": { "type": "string" } },
            "notes": { "type": "string" }
          }
        }
      }
    },
    "createdAt": { "type": "string", "format": "date-time" },
    "updatedAt": { "type": "string", "format": "date-time" }
  }
}
```

- **时间段 key**：`earlyMorning` | `morning` | `noon` | `evening` | `lateNight`；未提及的时段可为空对象。
- **同一天多次对话**：可合并为一条 DailyLog，或按策略覆盖/追加（MVP 建议：同一用户同一天仅一条，新对话按时段合并或覆盖对应时段）。

### 3.3 HealthProfile 简略结构

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | PK |
| userId | uuid | FK → users |
| basicInfo | jsonb | 姓名、生日、性别、身高、体重等 |
| work | jsonb | 职业、工作时长、压力等（可由 Chat 自然语言更新） |
| dietPreferences | jsonb | 饮食偏好、过敏、忌口 （可由 Chat 自然语言更新）|
| pastMedicalRecords | jsonb | 既往诊疗记录：`{ textDescriptions: string[], attachments: { url, fileName, uploadedAt }[] }` |
| familyHistory | jsonb | 家族史 （可由 Chat 自然语言更新）|
| lifestyle | jsonb | 工作生活状态等背景信息（可由 Chat 自然语言更新） |
| createdAt / updatedAt | timestamptz | |

- **pastMedicalRecords.attachments**：诊疗记录图片，上传至 Supabase Storage，仅存 URL 引用；不做 OCR 解析。
- **Chat 更新档案**：用户通过文字/语音描述工作、生活、饮食等，AI 提取后调用 ProfileService 更新对应字段。

---

## 4. API 设计

### 4.1 认证

- 登录：Supabase Auth Magic Link，前端直接调用，无需自定义后端。
- API 鉴权：所有业务 API 需携带 Supabase JWT，后端校验 `Authorization: Bearer <token>`。

### 4.2 业务 API（REST）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 发送用户消息（文字/语音转文字），可选附带图片；返回 AI 回复；可触发 DailyLog 或 HealthProfile 更新 |
| GET | `/api/daily-logs` | 按 `userId` + `startDate` / `endDate` 查询 |
| GET | `/api/daily-logs/:date` | 获取指定日期 DailyLog（YYYY-MM-DD） |
| PUT | `/api/daily-logs/:date` | 创建/更新 DailyLog（由 chat 或前端显式触发） |
| GET | `/api/health-profile` | 获取当前用户健康档案 |
| PUT | `/api/health-profile` | 创建/更新健康档案 |
| POST | `/api/upload` | 上传图片（诊疗记录等），返回 Storage URL；或使用 Supabase Storage 直传 + 后端仅记录引用 |

### 4.3 请求/响应示例

**POST /api/chat**
```json
// Request（支持 multipart/form-data 或 JSON + base64）
{
  "message": "今天有点头痛，下午睡了半小时好一些",
  "date": "2025-02-21",
  "imageUrls": ["https://storage.../xxx.jpg"]
}

// Response
{
  "reply": "已为您记录：有点头痛，下午休息后好转...",
  "dailyLogUpdated": true,
  "profileUpdated": false
}
```

- **语音**：客户端 STT 转文本后，`message` 等同文字输入。
- **图片**：可选，用于每日饮食/症状图或诊疗记录；上传后得到 `imageUrls` 随消息一并发送；AI 可描述图片但不做 OCR 解析。
- **Profile 更新**：当消息涉及工作、生活、饮食偏好等背景信息时，AI 提取后更新 HealthProfile，`profileUpdated: true`。

**GET /api/daily-logs?startDate=2025-02-01&endDate=2025-02-28**
```json
{
  "logs": [
    {
      "id": "...",
      "date": "2025-02-21",
      "structuredContent": {
        "earlyMorning": { "symptoms": [], "feelings": [], "behaviors": [], "notes": "" },
        "morning": { "symptoms": [], "feelings": [], "behaviors": [], "notes": "" },
        "noon": { "symptoms": [], "feelings": [], "behaviors": [], "notes": "" },
        "evening": { "symptoms": ["头痛"], "feelings": [], "behaviors": ["午睡半小时"], "notes": "午睡半小时后好转" },
        "lateNight": { "symptoms": [], "feelings": [], "behaviors": [], "notes": "" }
      },
      "rawInput": "..."
    }
  ]
}
```

---

## 5. 技术架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Expo / RN)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Login   │  │   Chat   │  │ Calendar │  │  Health Profile  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │             │             │                  │            │
│       └─────────────┴─────────────┴──────────────────┘            │
│                              │                                    │
│                    Supabase Auth (Magic Link)                      │
│                    REST API Client (JWT)                           │
└──────────────────────────────┬────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Backend (API Server)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │
│  │ Auth Middleware (JWT Verify) │  │   LLM Service (代理)     │   │
│  └─────────────┘  └──────┬──────┘  └───────────┬─────────────┘   │
│                          │                      │                 │
│  ┌──────────────────────┴──────────────────────┴───────────────┐  │
│  │  Routes: /api/chat | /api/daily-logs | /api/health-profile | /api/upload  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                          │                                        │
│  ┌──────────────────────┴──────────────────────────────────────┐  │
│  │  Services: ChatService | DailyLogService | ProfileService | UploadService  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌──────────┐    ┌─────────────┐   ┌──────────────────┐
       │PostgreSQL│    │  LLM API    │   │ Supabase         │
       │(主数据)   │    │(OpenAI/兼容)│   │ Auth + Storage   │
       └──────────┘    └─────────────┘   └──────────────────┘
```

---

## 6. 模块解耦原则

| 模块 | 边界 | 依赖方向 |
|------|------|----------|
| Auth | Supabase Auth | 其他模块依赖 Auth，Auth 不依赖业务 |
| Chat | 消息收发（文字/语音/图片）+ LLM 调用 | 可调用 DailyLog、HealthProfile 写入，但不直接依赖 Calendar |
| DailyLog | 读写日志 | 被 Chat、Calendar 依赖，自身无 UI |
| Calendar | 日历展示 + 详情 | 仅依赖 DailyLog API |
| HealthProfile | 档案 CRUD + 诊疗记录图片 | 可由 Chat 自然语言更新；可被报告分析只读 |

- LLM 调用封装为独立 Service，便于切换模型/厂商。
- DailyLog 写入由 Chat 或独立“保存日志”接口触发，前端不直接操作结构化字段。

---

## 7. 第一阶段范围

### 7.1 第一阶段不做的功能

| 类别 | 不做内容 |
|------|----------|
| 商业化 | 订阅、付费、会员 |
| 硬件 | 可穿戴设备、Apple Health、Google Fit 接入 |
| 分析 | 趋势分析、健康评分、复杂 AI 诊断建议 |
| 社交 | 分享、家庭账户、医生端 |
| 推送 | 定时提醒、通知 |
| 多端 | Web 端、平板适配 |
| 其他 | 多语言（MVP 先中文）|

### 7.2 第一阶段包含的功能

| 类别 | 内容 |
|------|------|
| **Chat** | 文字输入；语音输入（客户端 STT 转文字）；可选图片（每日饮食、症状照片） |
| **Chat → Profile** | 用户通过打字/语音自然化描述工作、生活、饮食偏好等背景信息，AI 提取后更新 HealthProfile |
| **Profile** | 诊疗记录图片上传；表单编辑；可通过 Chat 自然语言补充/更新 |
---

## 8. 简化原则

1. **数据**：DailyLog 同用户同日期单条；HealthProfile 单表 jsonb，不做过度规范化 只提取用户主要信息，时间症状分类的结构化同时保留一定的描述性质。
2. **对话**：支持文字/语音输入、可选图片；仅保留当前会话上下文，不实现长期记忆检索（RAG）；Chat 可触发 DailyLog 或 HealthProfile 更新。
3. **日历**：每一行一个日子+症状关键词，可以进行滚动以回看过去，点开显示具体dailylog。
4. **健康档案**：表单录入；诊疗记录支持图片上传（仅存 URL，不做 OCR）；可通过 Chat 自然语言描述工作/生活/饮食等，AI 提取后更新；报告生成时作为 context 输入。·
5. **部署**：单体 API，单库；容器化可选，不做微服务。
6. **平台**：先发 iOS，目录与配置预留 Android，避免平台硬编码。

---

## 9. 文件/目录建议（前端）

```
/app
  /(auth)
    login.tsx
    auth-callback.tsx
  /(tabs)
    chat.tsx
    calendar.tsx
    profile.tsx
  /profile
    edit.tsx
  /daily-log
    [date].tsx
/components
  ChatMessage, VoiceInputButton, ImagePickerButton, CalendarGrid, ProfileForm, MedicalRecordImageList, ...
/services
  api.ts, auth.ts
```

---

## 10. 附录：DailyLog 表 DDL 示例

```sql
CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  raw_input TEXT,
  structured_content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, date);
```

---

*文档结束*
