# index.tsx 功能说明

## 一、状态变量 (约 46-57 行)

| 变量 | 作用 |
|------|------|
| `messages` | 聊天消息列表 |
| `input` | 输入框当前文字 |
| `loading` | 是否正在发送/等待 AI 回复 |
| `loadingHistory` | 是否正在加载历史消息 |
| `recording` | 当前录音对象（null 表示未录音） |
| `transcribing` | 是否正在语音转文字 |
| `recordingStartAt` | 录音开始时间戳 |
| `pendingImages` | 待发送的图片列表 |
| `inputHeight` | 输入框高度（36~160），用于多行时自动增高 |
| `isInputFocused` | 输入框是否聚焦 |
| `showSplitButtons` | 是否显示「麦克风+发送」两个按钮（否则显示「按住说话」） |

---

## 二、核心逻辑函数

| 函数 | 作用 |
|------|------|
| `dedupeMessages` | 消息去重，避免 DB 与缓存重复 |
| `pickImage` | 打开相册选图，加入 pendingImages |
| `removePendingImage` | 移除某张待发图片 |
| `sendText` | 发送文字+图片到 API，更新 messages |
| `sendMessage` | 点击发送时调用，清空 input、重置 inputHeight 为 36 |
| `stopRecordingAndTranscribe` | 松开录音后转文字，结果填入 input |
| `startRecording` | 按下开始录音 |
| `buildContextMessages` | 取最近 12 条消息作为对话上下文 |
| `renderItem` | 渲染单条消息气泡 |

---

## 三、输入区域布局结构

```
inputRow (整行)
├── imgBtn (上传图片 +)
└── inputBox (输入框容器)
    ├── inputBoxImages (有图片时：横向滚动预览)
    └── inputBoxBottom (输入+按钮行)
        ├── inputWrapper
        │   ├── TextInput (实际输入框)
        │   └── Text (隐藏测量用，仅在有内容时渲染，用于 iOS 高度计算)
        ├── 有内容/聚焦时：micBtnInBox + sendBtnInBox
        └── 无内容时：holdToTalkBtn (按住说话)
```

---

## 四、输入框相关样式 (styles)

| 样式名 | 作用 |
|--------|------|
| `inputRow` | 整行容器，`alignItems: "flex-end"` 让输入变高时按钮贴底 |
| `inputBox` | 输入框外层，圆角背景 |
| `inputBoxBottom` | 输入+按钮同一行，`alignItems: "flex-end"` |
| `inputWrapper` | 包住 TextInput 和测量 Text，`flex: 1` |
| `input` | TextInput 样式，`paddingVertical: 7` 控制文字垂直位置 |
| `inputMeasure` | 隐藏的 Text，与 input 同字体/padding，用于测量内容高度 |
| `imgBtn` | 上传图片按钮，36×36 |
| `holdToTalkBtn` | 按住说话按钮 |
| `micBtnInBox` | 输入框内麦克风按钮 |
| `sendBtnInBox` | 输入框内发送按钮 |

---

## 五、输入框高度逻辑

1. **初始**：`inputHeight = 36`
2. **清空**：`onChangeText` 里 `setInputHeight(36)`
3. **发送**：`sendMessage` 里 `setInputHeight(36)`
4. **有内容时增高**：
   - `onContentSizeChange`：Android 用，`h + 14` 是内容高 + padding
   - `Text onLayout`：iOS 用（onContentSizeChange 在 iOS 输入时不触发）
5. **范围**：`Math.min(Math.max(h, 36), 160)`

---

## 六、对齐相关

- `inputRow` / `inputBoxBottom` 的 `alignItems: "flex-end"`：输入变高时，按钮保持在底部
- `input` 的 `paddingVertical: 7`：单行时文字垂直居中（36 高，行高 22，(36-22)/2=7）
- `textAlignVertical`：单行用 `"center"`，多行用 `"top"`
- `includeFontPadding: false`（仅 Android）：去掉系统额外字体 padding

---

## 七、消息列表相关样式

| 样式名 | 作用 |
|--------|------|
| `bubbleWrap` | 单条消息外层 |
| `messageRow` | 消息行布局 |
| `userRow` / `assistantRow` | 用户右对齐 / AI 左对齐 |
| `aiAvatar` | AI 头像小圆 |
| `bubble` | 气泡容器 |
| `userBubble` / `assistantBubble` | 用户蓝气泡 / AI 白气泡 |
| `bubbleText` | 气泡内文字 |
| `msgImage` | 消息中的图片 |

---

## 八、可调参数速查

| 需求 | 修改位置 |
|------|----------|
| 输入框初始/最小高度 | `useState(36)`、`Math.max(..., 36)` |
| 输入框最大高度 | `Math.min(..., 160)` |
| 文字与按钮垂直对齐 | `input` 的 `paddingVertical` |
| 按钮尺寸 | `imgBtn`、`holdToTalkBtn`、`micBtnInBox`、`sendBtnInBox` 的 `height`/`width` |
| 输入变高时按钮是否贴底 | `inputRow`、`inputBoxBottom` 的 `alignItems` |
| placeholder 文案 | TextInput 的 `placeholder` |
