# Canvas 游戏架构现状与后续重构方向

## 一、文档目的

这份文档原本是“从 React 组件界面迁移到 Canvas 游戏架构”的重构提案。当前仓库已经完成了大部分关键迁移，因此本文档不再描述一个纯理论方案，而是记录：

- 当前已经落地的 Canvas / Pixi / Three 架构
- 这套架构仍然存在的问题
- 后续真正值得继续做的重构方向

一句话概括当前状态：

> “从 DOM 卡牌界面迁移到 Canvas” 这件事基本已经完成，接下来更需要做的是拆分场景职责、补规则系统、收敛资源与渲染桥接复杂度。

---

## 二、当前已落地的架构

### 2.1 总体结构

```text
React
└── GameBoard.tsx
    └── PixiJS canvas
        ├── GameEngine
        ├── SceneManager
        └── GameScene
            ├── 2D 网格格子
            ├── 手牌卡牌
            ├── HUD / 按钮 / 阶段文案
            ├── 拖拽与飘字特效
            └── Three.js bridge

额外透明 canvas
└── Three.js
    ├── GridCell3D
    └── IsometricPetRenderer
```

### 2.2 当前事实

- React 侧当前只挂载画布和初始化数据。
- PixiJS 已经是主要的 2D 渲染层。
- `GameScene` 会在运行时创建第二个透明 canvas，并挂载 Three.js 渲染器。
- Three.js 当前负责 3D 宠物和 3D 格子底板。
- Zustand 仍然是游戏状态唯一来源。

### 2.3 当前不是的样子

以下旧提法已经不符合仓库现状：

- “仍然是 React 组件堆砌的 DOM 游戏界面”
- “只打算使用 Canvas 做特效层”
- “PixiJS 只是待评估方案”
- “还未决定是否接入 Three.js”

---

## 三、当前模块落地情况

### 3.1 已存在的核心模块

```text
src/game/
├── bootstrap.ts
├── core/
│   ├── GameEngine.ts
│   ├── InputManager.ts
│   ├── Scene.ts
│   └── SceneManager.ts
├── scenes/
│   └── GameScene.ts
├── entities/
│   ├── CardSprite.ts
│   └── GridCell.ts
├── systems/
│   ├── DragSystem.ts
│   └── VfxQueue.ts
├── renderers/
│   ├── GridCell3D.ts
│   └── IsometricPetRenderer.ts
├── factories/
│   └── LowPolyPetFactory.ts
└── utils/
    ├── Tween.ts
    ├── illustrationTextures.ts
    ├── placeVfx.ts
    ├── cardFx.ts
    ├── fxTextStyles.ts
    └── spriteFit.ts
```

### 3.2 当前职责划分

- `GameEngine`：初始化 Pixi `Application`，处理缩放、ticker 和输入管理。
- `SceneManager`：管理场景切换，当前主场景为 `GameScene`。
- `GameScene`：主流程控制器，负责创建网格、手牌、HUD、回合同步、拖拽响应、Three 桥接。
- `CardSprite`：手牌卡牌对象，负责动态绘制卡面和播放交互动效。
- `GridCell`：2D 格子对象，负责压力条与格子同步。
- `DragSystem`：拖拽、选格、落点判断、行动牌目标处理。
- `IsometricPetRenderer`：Three.js 侧的 3D 萌宠、格子、命中辅助与状态切换。

---

## 四、已完成与未完成的迁移项

### 4.1 已基本完成

- 画布化主界面
- Pixi 游戏主循环
- 手牌卡牌对象化
- 网格对象化
- 拖拽交互迁移到画布层
- HUD 与飘字迁移到 Pixi
- 3D 萌宠层接入
- Zustand 与画布层联动

### 4.2 尚未完成或尚未理顺

- 场景拆分仍不充分，主逻辑集中在 `GameScene.ts`
- 规则系统没有与表现层完全解耦
- 行动牌和实体被动没有通用技能管线
- Three.js 与 Pixi 的双层桥接仍偏手工
- 菜单、商店、独立场景没有完整落地
- 自动化测试仍缺失

---

## 五、当前架构的主要问题

### 5.1 `GameScene` 过于庞大

当前 `GameScene.ts` 同时负责：

- HUD 创建与更新
- 手牌重建
- 网格同步
- 拖拽联动
- 阶段推进
- 收益和压力的表现层节奏控制
- Three.js canvas 管理
- 游戏结束界面

这会带来两个问题：

- 文件过大，后续功能改动容易互相影响
- 很多逻辑既像“规则”，又像“表现”，边界不清晰

### 5.2 双 canvas 同步复杂

当前通过 Pixi + Three 双层 canvas 叠加实现：

- Pixi canvas：绝对定位，`z-index: 3`
- Three canvas：由 `GameScene` 动态创建，绝对定位，`z-index: 2`

这样做能快速达成目标，但也带来复杂度：

- 需要同步设计分辨率缩放
- 需要同步视口位置
- 需要同步格子状态和高亮状态
- 需要桥接压力条锚点和 3D 命中

### 5.3 规则仍然主要在 store 中硬编码

当前规则落在：

- `src/store/gameStore.ts`
- `src/store/actionEffects.ts`

这在 MVP 阶段是高效的，但继续扩卡会遇到问题：

- 新增卡牌时要写更多 ID 分支
- 配置里的 `effects[]` 不能直接成为可执行规则
- 文档、配置、实现容易不同步

### 5.4 资源路径仍在兼容期

当前同时支持：

- `public/assets/cards/*`
- `public/assets/illustrations/*`

优点是兼容性高，但也让渲染层承担了额外路径推断成本。

---

## 六、为什么当前不需要“再次大迁移”

如果现在重新按旧文档再做一轮“从 React 迁到 Pixi”的重构，收益已经不大，因为这一步事实上已经完成了。

当前更实际的目标应该是：

1. 拆分大场景文件
2. 抽离规则层
3. 规范资源层
4. 为羁绊、被动、事件等系统留扩展接口

也就是说，下一阶段不是“换渲染方案”，而是“清理已经落地的混合架构”。

---

## 七、推荐的下一步重构方向

### 7.1 把 `GameScene` 拆成更明确的子模块

建议拆分为：

```text
GameScene
├── HudLayer
├── HandLayer
├── BoardLayer
├── PhaseFlowController
├── GameOverOverlay
└── ThreeBridge
```

这样可以减少：

- 单文件体积
- UI 更新与规则推进耦合
- Three 桥接逻辑污染主场景

### 7.2 抽离规则服务层

当前推荐方向不是立刻上复杂 DSL，而是先做一层轻量规则服务：

```text
src/rules/
├── economy.ts
├── stress.ts
├── meltdown.ts
├── actions.ts
└── targets.ts
```

收益：

- 让 store 负责状态写入，不直接承担全部规则计算
- 让文档、规则常量和单元测试更容易对齐

### 7.3 为数据驱动效果留接口

当前 `effects[]` 主要是展示文本。下一步建议不是一次性做全 DSL，而是先把高频结构化效果标准化，例如：

- 收益倍率
- 压力增减
- 抽牌
- 回手
- 交换位置
- 范围效果

### 7.4 收敛资源目录职责

建议明确：

- `cards/` 是否继续作为运行时主资源
- `illustrations/` 是否只保留独立插画语义
- `image` 字段是否仍默认指向 `cards/`

如果不收敛，后续工具链和文档会持续偏离。

### 7.5 增加自动化验证

当前最值得补的不是渲染测试，而是规则层测试：

- 收入结算测试
- 压力增长与拆家测试
- 行动牌目标测试
- 牌库/弃牌/回手流程测试

---

## 八、建议的后续阶段划分

### Phase A：结构整理

- 拆 `GameScene`
- 拆 HUD、Hand、Board 子层
- 抽出 Three bridge

### Phase B：规则整理

- 提取经济、压力、拆家、行动牌规则服务
- 明确 store 只做状态源和状态提交
- 补基础单元测试

### Phase C：内容系统补完

- 羁绊接入运行时
- 实体被动效果接入运行时
- 随机事件与商店场景落地

### Phase D：表现层优化

- 更稳定的拖拽反馈
- 更完整的 3D / 2D 联动
- 更统一的资源加载与缓存

---

## 九、结论

当前项目的 Canvas 架构已经从“重构提案”进入“可运行的混合引擎阶段”。

准确描述当前状态，应当是：

- React 只负责挂载和启动
- Pixi 是主 2D 表现层
- Three.js 是 3D 宠物与格子层
- Zustand 是规则状态源
- 大迁移基本完成，小重构才是当前重点

因此，后续文档和开发判断都不应再把项目视为“DOM 卡牌界面等待迁移”的阶段。

---

**文档版本：** v1.1  
**最后更新：** 2026-04-13  
**维护者：** LovelyPets 开发组
