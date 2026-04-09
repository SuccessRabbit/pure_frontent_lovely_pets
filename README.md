# 萌宠直播公司 🐱🐶

一款融合 Roguelike 卡牌、自走棋经济和网格策略的萌宠主题游戏。

## 🎮 游戏简介

在这个游戏中，你是一家萌宠直播公司的老板。你需要：
- 在 3x6 的网格上部署萌宠和牛马
- 通过卡牌指令管理公司运营
- 平衡收益与压力，防止萌宠拆家
- 利用经济系统（小罐头、利息、连胜/连败）实现利益最大化

**目标：** 存活 30 天，累积 1000 小红心

## ✨ 核心特色

### 🎨 动态卡牌系统
卡牌不是整张图片，而是**代码动态组装**：
- 费用标识（右上角）
- 稀有度标签（左上角）
- 角色插画（4:3比例）
- 属性图标（收益、压力）
- 效果描述
- 悬停动画

### 🖼️ 智能资源加载
```
PNG优先 → PNG不存在 → 自动使用SVG → 无缝显示
```
- 开发时无需等待图片
- 随时替换为高质量PNG
- 零配置，自动fallback

### 📊 策划友好
- Excel编辑卡牌数值
- 自动生成TypeScript类型
- 配置文件热更新

## 🚀 快速开始

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 查看效果
浏览器访问 `http://localhost:3000`

你会看到：
- 顶部资源栏（小罐头、小红心、天数、生命值）
- 6张萌宠卡牌（完整展示）
- 5张牛马卡牌（占位符）
- 8张指令卡牌（占位符）
- 点击卡牌查看详情

### 构建生产版本
```bash
npm run build
```

### 预览生产构建
```bash
npm run preview
```

## 📊 配置卡牌数据

### 方式一：使用 Excel 编辑（推荐）

1. 打开 `excel/cards.xlsx`
2. 按照表格格式填写卡牌数据
3. 运行转换脚本：
```bash
npm run convert:cards
```

详细说明请查看 [excel/README.md](./excel/README.md)

### 方式二：直接编辑 JSON

直接修改 `config/` 目录下的 JSON 文件：
- `pets.json` - 萌宠卡牌
- `workers.json` - 牛马卡牌
- `actions.json` - 指令卡牌
- `synergies.json` - 羁绊配置

## 🎨 添加图片资源

### 插画资源（角色图片）

将图片放置在对应目录：

```
public/assets/illustrations/
├── pets/          # 萌宠插画（如 pet_001.png）
├── workers/       # 牛马插画（如 worker_001.png）
└── actions/       # 指令图标（如 action_001.png）
```

### UI 图标

```
public/assets/ui/icons/
├── can.png        # 小罐头
├── heart.png      # 小红心
├── star.png       # 星星
└── ...
```

**图片命名规则：**
- 与卡牌 ID 一致（如 `pet_001.png`）
- 推荐尺寸：插画 400×300px（4:3），图标 64×64px
- 格式：PNG（支持透明）或 WebP

**无需担心图片缺失：**
- 系统会自动使用SVG占位符
- 随时可以替换为PNG
- 无缝切换，用户无感知

## 📁 项目结构

```
LovelyPets/
├── config/              # 游戏配置文件
│   ├── cards.json      # 完整卡牌数据库
│   ├── pets.json       # 萌宠卡牌（6张）
│   ├── workers.json    # 牛马卡牌（5张）
│   ├── actions.json    # 指令卡牌（8张）
│   └── synergies.json  # 羁绊配置（8个）
├── docs/               # 设计文档
│   ├── 技术选型文档.md
│   ├── 游戏架构及玩法设计文档.md
│   └── 资源素材系统说明.md
├── excel/              # Excel 配置源文件
│   ├── cards.xlsx      # 卡牌配置表
│   └── README.md       # Excel 使用说明
├── public/
│   └── assets/         # 游戏资源
│       ├── illustrations/  # 角色插画（4:3比例）
│       │   ├── pets/      # 萌宠插画（6个SVG）
│       │   ├── workers/   # 牛马插画（待添加）
│       │   └── actions/   # 指令图标（待添加）
│       └── ui/
│           └── icons/     # UI图标（5个SVG）
├── scripts/
│   └── excel-to-json.js # Excel 转换脚本
├── src/
│   ├── components/     # React 组件
│   │   ├── Card.tsx           # 卡牌组件（动态组装）
│   │   ├── ImageWithFallback.tsx
│   │   └── ResourceDisplay.tsx
│   ├── utils/          # 工具函数
│   │   └── assetLoader.ts
│   ├── App.tsx         # 示例展示页面
│   └── main.tsx        # 入口文件
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vercel.json         # Vercel 部署配置
```

## 🎯 核心玩法

### 网格系统
- 3 行 × 6 列 = 18 个格子
- 前排：高风险高收益
- 后排：安全区，适合理财型单位

### 经济系统
- **小罐头**：游戏货币，用于打牌和购买
- **利息**：每 5 罐头产生 1 利息（上限 2）
- **连胜奖励**：3 连胜开始，每回合 +1 罐头
- **连败补偿**：2 连败开始，每回合 +2 罐头

### 压力与拆家
- 萌宠每回合累积压力
- 压力达到上限触发轮盘赌：
  - 50% 黑红暴走：收益 ×5
  - 50% 彻底拆家：摧毁工位，扣血

### 羁绊系统
- 猫咖氛围：3 只猫科，全场猫压力 -1
- 狗狗军团：2 只狗科，狗收益 +50%
- 996 福报：4 个牛马，解锁献祭能力

## 🛠️ 技术栈

- **框架**：React 18 + TypeScript
- **构建工具**：Vite
- **状态管理**：Zustand
- **样式**：Tailwind CSS
- **部署**：Vercel

## 📖 文档

- [技术选型文档](./docs/技术选型文档.md)
- [游戏架构及玩法设计文档](./docs/游戏架构及玩法设计文档.md)
- [资源素材系统说明](./docs/资源素材系统说明.md)
- [Excel 配置说明](./excel/README.md)
- [项目完成总结](./PROJECT_SUMMARY.md)
- [更新日志](./CHANGELOG.md)

## 🚢 部署到 Vercel

### 方式一：通过 Vercel CLI
```bash
npm install -g vercel
vercel
```

### 方式二：通过 GitHub
1. 将代码推送到 GitHub
2. 在 Vercel 中导入项目
3. 自动部署

## 📝 开发计划

- [x] 项目架构搭建
- [x] 配置文件系统
- [x] Excel 转换脚本
- [x] 动态卡牌系统
- [x] 智能资源加载
- [x] 示例展示页面
- [ ] 核心游戏逻辑
- [ ] UI 组件开发
- [ ] 动画特效
- [ ] 音效系统
- [ ] 数值平衡

## 🎨 资源状态

```
插画完成度：32% (6/19)
- 萌宠：6/6 ✅
- 牛马：0/5 ⏳
- 指令：0/8 ⏳
- UI图标：5/5 ✅
```

## 💡 使用提示

### 卡牌组件
```tsx
import { Card } from '@/components/Card';

<Card
  card={cardData}
  onClick={() => console.log('clicked')}
  disabled={false}
/>
```

### 资源显示
```tsx
import { ResourceDisplay } from '@/components/ResourceDisplay';

<ResourceDisplay
  cans={7}
  hearts={245}
  day={5}
  health={80}
/>
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

**Made with ❤️ for pet lovers and card game enthusiasts**
