# 导盲犬 (IamDog) - 技术方案设计

> 桌面AI助手的详细技术实现方案

**文档版本**：v3.0  
**最后更新**：2026-01-12  
**负责人**：哈雅（263321）  
**状态**：✅ 智能上下文管理已完成

---

## 📐 整体架构

### 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│                  导盲犬 (IamDog) 桌面应用                  │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  宠物窗口层   │  │  对话窗口层   │  │  配置管理层   │  │
│  │              │  │              │  │              │  │
│  │ • 小狗图标    │  │ • 输入框      │  │ • API密钥     │  │
│  │ • 点击/长按   │  │ • 消息展示    │  │ • 快捷键      │  │
│  │ • 拖拽移动    │  │ • Markdown    │  │ • 持久化      │  │
│  │ • 右下角定位  │  │ • 智能定位    │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
├─────────────────────────────────────────────────────────┤
│                      核心功能层                            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 屏幕截图模块  │  │ 粘贴板模块    │  │  AI对话模块   │  │
│  │              │  │              │  │              │  │
│  │ • 全屏截图    │  │ • 读取截图    │  │ • 千问API     │  │
│  │ • Base64编码  │  │ • Base64转换  │  │ • 上下文管理  │  │
│  │ • 内存存储    │  │ • 格式识别    │  │ • 流式响应    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
├─────────────────────────────────────────────────────────┤
│                      系统接口层                            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Electron    │  │  macOS API   │  │   网络层      │  │
│  │              │  │              │  │              │  │
│  │ • 窗口管理    │  │ • 截图权限    │  │ • OpenAI SDK  │  │
│  │ • 快捷键      │  │ • 粘贴板API   │  │ • 流式响应    │  │
│  │ • IPC通信     │  │ • 多桌面支持  │  │ • 错误处理    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 核心模块设计

### 1. 宠物窗口模块

#### 1.1 窗口属性
- **尺寸**：120x120 像素
- **初始位置**：屏幕右下角（距边缘20px）
- **特性**：
  - 始终置顶（alwaysOnTop: true）
  - 透明背景（transparent: true）
  - 无边框（frame: false）
  - 多桌面显示（visibleOnAllWorkspaces: true）

#### 1.2 交互逻辑（基于时间判断）

**点击检测**：
```javascript
const LONG_PRESS_THRESHOLD = 200; // 200ms

mousedown → 记录时间和位置
mousemove → 如果超过200ms，标记为拖动
mouseup → 判断：
  - 如果拖动中 → 停止拖动
  - 如果时间 < 200ms → 打开对话框
  - 否则 → 无操作

contextmenu → 显示右键菜单（退出按钮）
```

**调试日志**：
- 🖱️ 鼠标按下
- 🔄 开始拖动
- ✅ 拖动结束
- 👆 点击操作 - 打开对话框

#### 1.3 拖动实现
- 完全移除 `-webkit-app-region`
- JavaScript 手动实现拖动
- 通过 IPC 通知主进程移动窗口
- 阻止图片默认拖拽行为

#### 1.4 位置计算
```javascript
// 右下角位置
const x = screenWidth - windowWidth - margin;
const y = screenHeight - windowHeight - margin;
```

---

### 2. 对话窗口模块

#### 2.1 窗口设计
- **尺寸**：400x600 像素（可调整）
- **位置**：智能定位在宠物图标上方
- **特性**：
  - 普通窗口（非置顶）
  - 可最小化、关闭
  - 不可最大化
  - 自动聚焦输入框

#### 2.2 智能定位算法
```javascript
// 基本位置：图标上方，水平居中
x = petX + (petWidth - chatWidth) / 2;
y = petY - chatHeight - margin;

// 边界检查
if (x < 0) x = 10;
if (x + chatWidth > screenWidth) x = screenWidth - chatWidth - 10;

// 如果上方空间不够，放在下方
if (y < 0) {
  y = petY + petHeight + margin;
}
```

#### 2.3 UI组件结构
```
对话窗口
├── 标题栏
│   ├── 图标 + 标题
│   ├── 设置按钮
│   └── 关闭按钮
├── 消息列表区域（可滚动）
│   ├── 用户消息
│   │   ├── 文本内容
│   │   └── 图片预览（支持多张）
│   └── AI消息
│       ├── Markdown内容
│       └── 复制按钮
└── 输入区域
    ├── 文本输入框（自动聚焦）
    ├── 选项复选框
    │   ├── 📷 包含当前截图
    │   └── 📋 粘贴板截图
    └── 发送按钮
```

#### 2.4 自动聚焦实现
```typescript
const textareaRef = React.useRef<HTMLTextAreaElement>(null);

React.useEffect(() => {
  textareaRef.current?.focus();
}, []);
```

---

### 3. 屏幕截图模块

#### 3.1 智能窗口识别
```typescript
// 1. 获取所有窗口和屏幕源
const sources = await desktopCapturer.getSources({
  types: ['window', 'screen'],
  thumbnailSize: { width: 3840, height: 2160 },  // 4K分辨率
});

// 2. 过滤掉导盲犬自己的窗口
const windowSources = sources.filter(source => {
  const name = source.name.toLowerCase();
  return !name.includes('iamdog') && 
         !name.includes('导盲犬') &&
         source.id.startsWith('window:');
});

// 3. 选择第一个非导盲犬窗口（通常是用户正在使用的窗口）
const targetWindow = windowSources[0];
```

#### 3.2 图片压缩优化
```typescript
// 1. 获取原始截图
const screenshot = targetWindow.thumbnail;

// 2. 缩放到50%
const originalSize = screenshot.getSize();
const newWidth = Math.floor(originalSize.width * 0.5);
const newHeight = Math.floor(originalSize.height * 0.5);
const resized = screenshot.resize({ width: newWidth, height: newHeight });

// 3. 转换为JPEG格式，质量80%
const jpeg = resized.toJPEG(80);
const base64 = jpeg.toString('base64');

// 压缩效果：6-8MB → 300-500KB（约95%压缩率）
return `data:image/jpeg;base64,${base64}`;
```

#### 3.3 图片处理
- **格式**：JPEG（原PNG）
- **质量**：80%
- **分辨率**：缩放到50%（4K → 1080p）
- **编码**：Base64
- **存储**：内存中临时保存
- **清理**：发送后立即释放
- **优势**：避免API限制（6MB），提升传输速度

---

### 4. 粘贴板模块

#### 4.1 读取实现
使用 Electron 的 `clipboard` API：
```typescript
const image = clipboard.readImage();
if (image.isEmpty()) return null;

const png = image.toPNG();
const base64 = png.toString('base64');
return `data:image/png;base64,${base64}`;
```

---

### 5. AI对话模块

#### 5.1 IdeaLab API集成

**使用 OpenAI TypeScript SDK**：
```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: userConfig.apiKey,
  baseURL: 'https://idealab.alibaba-inc.com/api/openai/v1'
});

// 流式响应
const stream = await client.chat.completions.create({
  model: "qwen-vl-max-latest",
  messages: chatMessages,
  stream: true
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  yield content;
}
```

#### 5.2 多图片支持
```typescript
// 用户消息可以包含多张图片
{
  role: "user",
  content: [
    { type: "text", text: "用户问题" },
    { type: "image_url", image_url: { url: "data:image/png;base64,..." } },
    { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
  ]
}
```

#### 5.3 智能上下文管理（v3.0新增）⭐

**核心方案**：组合方案 = 动态计算 + 85%目标窗口 + 基于Token裁剪

##### 5.3.1 千问max模型参数
```typescript
const QWEN_MAX_CONFIG = {
  contextWindow: 131072,  // 上下文窗口
  maxInput: 129024,       // 最大输入tokens
  maxOutput: 8192,        // 最大输出tokens
  targetRatio: 0.85,      // 目标窗口比例（85%）
};
```

##### 5.3.2 Token估算器 (`tokenEstimator.ts`)

**功能**：
- 估算文本tokens（1.5字符/token）
- 估算图片tokens（1500 tokens/张）
- 支持窗口截图和粘贴板截图
- 计算消息列表总tokens

**实现**：
```typescript
export function estimateMessageTokens(message: Message): TokenEstimate {
  let textTokens = 0;
  let imageTokens = 0;
  
  // 文字token估算
  if (message.content) {
    textTokens = Math.ceil(message.content.length / 1.5);
  }
  
  // 图片token估算（qwen-vl-max约1500 tokens/张）
  if (message.imageUrls && message.imageUrls.length > 0) {
    imageTokens = message.imageUrls.length * 1500;
  }
  
  return {
    text: textTokens,
    images: imageTokens,
    total: textTokens + imageTokens,
  };
}
```

##### 5.3.3 上下文管理器 (`contextManager.ts`)

**智能裁剪流程**：

```typescript
1. 动态计算可用空间
   可用 = 129,024 - 8,192(输出) - 500(系统) - 知识 - 当前消息

2. 设置目标窗口（85%）
   目标 = 可用空间 × 0.85

3. 计算历史tokens
   遍历所有历史消息，累加tokens

4. 判断是否需要裁剪
   if (历史 > 目标) → 裁剪
   else → 保留全部

5. 基于token裁剪
   从后往前累加，直到达到目标窗口
```

**核心特点**：
- ✅ 完全基于token大小，不是消息数量
- ✅ 动态适应各种场景（纯文字/图片/混合）
- ✅ 没有硬性的最小消息数限制
- ✅ 静默处理，用户无感知
- ✅ 仅日志输出，便于调试

**实际效果示例**：

| 场景 | 历史tokens | 目标窗口 | 结果 |
|------|-----------|---------|------|
| 纯文字对话 | 20,000 | 100,000 | 保留全部 ✅ |
| 少量图片 | 60,000 | 100,000 | 保留全部 ✅ |
| 大量图片 | 150,000 | 100,000 | 裁剪到100K ✅ |
| 当前消息大 | 80,000 | 30,000 | 裁剪到30K ✅ |
| 背景知识大 | 100,000 | 90,000 | 裁剪到90K ✅ |

**日志示例**：
```
📊 Token分配计算：
   最大输入：129,024 tokens
   输出预留：8,192 tokens
   系统提示：500 tokens
   当前消息：3,200 tokens
   历史可用：117,132 tokens
   目标窗口：99,562 tokens (85%)
   当前历史：150,000 tokens (80 条消息)
⚠️ 历史超出目标窗口，开始裁剪
   超出：50,438 tokens
   停止在第 27 条消息（再加会超过目标窗口）
✅ 裁剪完成
   保留：53 / 80 条消息
   移除：27 条消息
   使用：98,500 / 99,562 tokens
   使用率：98.9%
```

##### 5.3.4 方案优势

1. **完全动态** ⭐⭐⭐⭐⭐
   - 根据实际情况自动调整
   - 适应各种场景

2. **基于Token** ⭐⭐⭐⭐⭐
   - 精确控制，不浪费空间
   - 图片和文字统一管理

3. **用户无感** ⭐⭐⭐⭐⭐
   - 静默裁剪，不打断对话
   - 体验丝滑

4. **安全可靠** ⭐⭐⭐⭐⭐
   - 85%留有余量
   - 预留输出空间
   - 不会超限

---

### 6. 配置管理模块

#### 6.1 配置项
```typescript
interface Config {
  apiKey: string;           // IdeaLab API密钥
  model: string;            // 模型（默认：qwen-vl-max-latest）
  shortcut: string;         // 快捷键（默认：Cmd+Shift+0）
}
```

#### 6.2 存储方式
- 使用 `electron-store`
- 本地 JSON 文件
- 位置：`~/Library/Application Support/IamDog/config.json`

---

## 🔄 数据流设计

### 完整交互流程

```
1. 用户唤醒
   左键快速点击（< 200ms）/ 按 Cmd+Shift+0
        ↓
   对话窗口出现在图标上方
        ↓
   输入框自动聚焦

2. 用户输入
   输入问题文本
        ↓
   选择截图选项
   - [x] 包含当前截图
   - [x] 粘贴板截图（可同时选择）
        ↓
   点击发送 / 按 Enter

3. 数据收集
   ├─ 用户输入文本
   ├─ 当前屏幕截图（如勾选）
   └─ 粘贴板截图（如勾选）
        ↓
   图片处理
   - Base64编码
   - 添加到消息数组

4. API调用
   构建请求
   - 系统提示词
   - 历史上下文（最近10轮）
   - 当前消息（文本+多张图片）
        ↓
   发送到千问API（流式）
        ↓
   接收流式响应

5. 结果展示
   逐字显示AI回答
        ↓
   Markdown渲染（Marked）
        ↓
   代码高亮（Highlight.js）
        ↓
   显示完成，提供复制按钮

6. 后续操作
   - 用户可继续提问（多轮对话）
   - 用户可复制回答
   - 用户可关闭窗口（清空历史）
```

---

## 🎨 技术栈详解

### 前端技术

#### Electron 28+
- **窗口管理**：BrowserWindow
- **屏幕截图**：desktopCapturer
- **粘贴板**：clipboard
- **全局快捷键**：globalShortcut
- **IPC通信**：ipcMain / ipcRenderer
- **多桌面支持**：setVisibleOnAllWorkspaces

#### React 18
- **UI框架**：函数组件 + Hooks
- **状态管理**：Zustand
- **关键组件**：
  - App：主应用
  - MessageList：消息列表
  - MessageItem：单条消息
  - InputArea：输入区域

#### TypeScript 5
- **类型安全**：严格模式
- **接口定义**：完整的类型声明

#### Tailwind CSS 3
- **样式框架**：实用优先
- **响应式设计**：移动端适配

#### 其他UI库
- **Marked**：Markdown渲染
- **Highlight.js**：代码高亮

### 后端/系统

#### Node.js 18+
- **运行环境**：JavaScript运行时

#### 工具库
- **OpenAI SDK**：API调用
- **electron-store**：配置存储
- **electron-log**：日志记录

---

## 🔒 安全与隐私

### 数据安全

#### API密钥保护
- 本地加密存储（electron-store）
- 不在日志中输出
- 不上传到服务器

#### 截图数据
- 仅内存存储
- 发送后立即清除
- 不保存到磁盘

#### 对话历史
- 仅会话期间保存
- 关闭窗口清空
- 不持久化存储

---

## ⚡ 性能优化

### 内存管理
- 对话历史限制10轮
- 图片用完即释放
- 定期垃圾回收

### 网络优化
- 流式响应减少等待
- 错误自动重试
- 超时控制

### UI优化
- 自动聚焦输入框
- 流式显示AI回答
- 防抖节流

---

## 🧪 测试策略

### 功能测试
- ✅ 点击/长按区分
- ✅ 拖动功能
- ✅ 对话窗口定位
- ✅ 截图功能
- ✅ 多图片发送
- ✅ AI对话
- ✅ 配置管理

### 用户体验测试
- ✅ 交互流畅性
- ✅ 错误提示友好性
- ✅ 边界情况处理

---

## 📦 构建与发布

### 开发环境
```bash
# 一键启动
./start.sh

# 或手动启动
npm install
npm run dev          # 终端1
npm run electron:dev # 终端2
```

### 构建打包
```bash
npm run build
npm run package:mac
```

---

## 🔧 开发规范

### 代码规范
- ESLint + Prettier
- TypeScript 严格模式
- 组件化开发

### Git规范
- 语义化提交信息
- 功能分支开发

---

## 📊 监控与日志

### 日志记录
- 使用 electron-log
- 分级记录（info/warn/error）
- 位置：`~/Library/Logs/IamDog/`

### 调试信息
- 控制台输出交互状态
- 便于问题排查

---

## 🚀 已实现功能

### ✅ 核心功能
- [x] 宠物窗口（右下角初始位置）
- [x] 点击/长按交互（200ms阈值）
- [x] 手动拖动实现（IPC通信）
- [x] 对话窗口（智能定位）
- [x] 全局快捷键（Cmd+Shift+0）
- [x] 屏幕截图
- [x] 粘贴板读取
- [x] 多图片发送
- [x] AI对话（流式响应）
- [x] Markdown渲染
- [x] 代码高亮
- [x] 配置管理
- [x] 自动聚焦
- [x] 多桌面显示

### ✅ 用户体验
- [x] 一键启动脚本
- [x] 调试日志
- [x] 错误提示
- [x] 图片拖拽禁用
- [x] 边界智能处理

---

## 🔮 未来扩展

### 短期计划
- 支持更多AI模型
- 优化截图质量
- 增加快捷指令

### 长期计划
- Windows平台支持
- 宠物动画效果
- 插件系统
- 云端同步

---

**文档版本**：v3.0  
**最后更新**：2026-01-12  
**负责人**：哈雅（263321）
