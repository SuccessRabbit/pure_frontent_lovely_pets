# Canvas 游戏架构重构方案

## 一、当前问题分析

### 现有架构的缺陷
1. **React 组件堆砌**：每个卡牌、网格单元都是 DOM 节点，性能差
2. **CSS 动画局限**：无法实现复杂的粒子效果、拖拽轨迹、缓动曲线
3. **布局问题**：响应式布局导致滚动条，不符合游戏体验
4. **交互延迟**：DOM 事件处理比 Canvas 慢
5. **无法精确控制**：卡牌拖拽、碰撞检测、层级管理都依赖浏览器

### 游戏需要的能力
- 全屏固定画布（1920×1080 或自适应缩放）
- 流畅的卡牌拖拽（60fps）
- 粒子特效（拆家爆炸、金币飞溅）
- 缓动动画（卡牌翻转、弹出、抖动）
- 精确的碰撞检测（卡牌放置到网格）
- 多层渲染（背景层、实体层、UI层、特效层）

---

## 二、技术选型对比

### 方案 1：PixiJS（推荐）

**优势**：
- WebGL 渲染，性能极佳（可处理数千个精灵）
- 完善的精灵系统、纹理管理、滤镜效果
- 轻量级（~500KB），专注 2D 渲染
- 丰富的插件生态（粒子系统、Spine 动画、TweenJS）
- 与 React 集成简单（只需一个 Canvas 容器）

**劣势**：
- 需要学习 PixiJS API
- 物理引擎需要额外集成（Matter.js）

**适用场景**：卡牌游戏、2D 策略游戏

### 方案 2：Phaser 3

**优势**：
- 完整的游戏框架（场景管理、物理引擎、音频系统）
- 内置 Tween 动画、粒子系统
- 丰富的示例和教程

**劣势**：
- 体积较大（~1.2MB）
- 框架约束较多，不够灵活
- 与 React 状态管理冲突（需要桥接）

**适用场景**：复杂的动作游戏、平台跳跃游戏

### 方案 3：原生 Canvas + 自研

**优势**：
- 完全控制，无依赖
- 包体积最小

**劣势**：
- 需要自己实现精灵系统、动画系统、事件系统
- 开发周期长，容易出 bug
- 性能优化需要大量经验

**适用场景**：极简游戏、学习目的

---

## 三、推荐架构：PixiJS + Zustand

### 3.1 整体架构

```
┌─────────────────────────────────────────┐
│  React Layer（UI 控制层）                │
│  - 设置面板、暂停菜单                    │
│  - Zustand 状态管理                      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Game Engine（游戏引擎层）               │
│  - GameLoop（游戏循环）                  │
│  - InputManager（输入管理）              │
│  - SceneManager（场景管理）              │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  PixiJS Renderer（渲染层）               │
│  - Stage（舞台）                         │
│  - Layers（多层渲染）                    │
│  - Sprites（精灵对象）                   │
└─────────────────────────────────────────┘
```

### 3.2 目录结构

```
src/
├── game/                    # 游戏引擎核心
│   ├── core/
│   │   ├── GameEngine.ts   # 游戏引擎主类
│   │   ├── GameLoop.ts     # 游戏循环（requestAnimationFrame）
│   │   ├── InputManager.ts # 输入管理（鼠标、触摸）
│   │   └── SceneManager.ts # 场景管理
│   ├── scenes/
│   │   ├── GameScene.ts    # 主游戏场景
│   │   ├── MenuScene.ts    # 菜单场景
│   │   └── ShopScene.ts    # 商店场景
│   ├── entities/
│   │   ├── Card.ts         # 卡牌实体
│   │   ├── GridCell.ts     # 网格单元
│   │   ├── Pet.ts          # 萌宠实体
│   │   └── Worker.ts       # 牛马实体
│   ├── systems/
│   │   ├── DragSystem.ts   # 拖拽系统
│   │   ├── AnimationSystem.ts # 动画系统
│   │   ├── ParticleSystem.ts  # 粒子系统
│   │   └── CollisionSystem.ts # 碰撞检测
│   ├── ui/
│   │   ├── ResourceBar.ts  # 资源栏（Canvas 绘制）
│   │   ├── HandArea.ts     # 手牌区域
│   │   └── Button.ts       # 按钮组件
│   └── utils/
│       ├── Tween.ts        # 缓动动画
│       ├── AssetLoader.ts  # 资源加载器
│       └── MathUtils.ts    # 数学工具
├── components/
│   └── GameCanvas.tsx      # React 容器组件
├── store/
│   └── gameStore.ts        # Zustand 状态（保持不变）
└── main.tsx
```

### 3.3 核心代码示例

#### GameEngine.ts（游戏引擎）

```typescript
import * as PIXI from 'pixi.js';
import { GameLoop } from './GameLoop';
import { InputManager } from './InputManager';
import { SceneManager } from './SceneManager';

export class GameEngine {
  private app: PIXI.Application;
  private gameLoop: GameLoop;
  private inputManager: InputManager;
  private sceneManager: SceneManager;

  constructor(canvas: HTMLCanvasElement) {
    // 初始化 PixiJS
    this.app = new PIXI.Application({
      view: canvas,
      width: 1920,
      height: 1080,
      backgroundColor: 0x1a1a2e,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // 自适应缩放
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // 初始化子系统
    this.inputManager = new InputManager(this.app.view);
    this.sceneManager = new SceneManager(this.app.stage);
    this.gameLoop = new GameLoop((deltaTime) => this.update(deltaTime));
  }

  private resizeCanvas() {
    const scale = Math.min(
      window.innerWidth / 1920,
      window.innerHeight / 1080
    );
    this.app.stage.scale.set(scale);
  }

  private update(deltaTime: number) {
    this.sceneManager.update(deltaTime);
  }

  public start() {
    this.gameLoop.start();
  }

  public destroy() {
    this.gameLoop.stop();
    this.app.destroy(true);
  }
}
```

#### Card.ts（卡牌实体）

```typescript
import * as PIXI from 'pixi.js';
import { Tween } from '../utils/Tween';

export class CardSprite extends PIXI.Container {
  private background: PIXI.Graphics;
  private illustration: PIXI.Sprite;
  private costText: PIXI.Text;
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };

  constructor(private cardData: Card) {
    super();
    this.interactive = true;
    this.buttonMode = true;

    this.createBackground();
    this.createIllustration();
    this.createCostBadge();
    this.setupInteraction();
  }

  private createBackground() {
    this.background = new PIXI.Graphics();
    this.background.beginFill(0xffffff);
    this.background.drawRoundedRect(0, 0, 200, 280, 10);
    this.background.endFill();
    this.addChild(this.background);
  }

  private createIllustration() {
    const texture = PIXI.Texture.from(this.cardData.image);
    this.illustration = new PIXI.Sprite(texture);
    this.illustration.width = 180;
    this.illustration.height = 135;
    this.illustration.x = 10;
    this.illustration.y = 10;
    this.addChild(this.illustration);
  }

  private createCostBadge() {
    const badge = new PIXI.Graphics();
    badge.beginFill(0xff6b9d);
    badge.drawCircle(0, 0, 20);
    badge.endFill();
    badge.x = 180;
    badge.y = 20;
    this.addChild(badge);

    this.costText = new PIXI.Text(this.cardData.cost.toString(), {
      fontSize: 24,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    this.costText.anchor.set(0.5);
    badge.addChild(this.costText);
  }

  private setupInteraction() {
    this.on('pointerdown', this.onDragStart.bind(this));
    this.on('pointerup', this.onDragEnd.bind(this));
    this.on('pointerupoutside', this.onDragEnd.bind(this));
    this.on('pointermove', this.onDragMove.bind(this));
    this.on('pointerover', this.onHover.bind(this));
    this.on('pointerout', this.onHoverEnd.bind(this));
  }

  private onDragStart(event: PIXI.InteractionEvent) {
    this.isDragging = true;
    const pos = event.data.global;
    this.dragOffset.x = pos.x - this.x;
    this.dragOffset.y = pos.y - this.y;
    this.zIndex = 1000; // 提升到最上层
    this.scale.set(1.1); // 放大
  }

  private onDragMove(event: PIXI.InteractionEvent) {
    if (this.isDragging) {
      const pos = event.data.global;
      this.x = pos.x - this.dragOffset.x;
      this.y = pos.y - this.dragOffset.y;
    }
  }

  private onDragEnd(event: PIXI.InteractionEvent) {
    if (this.isDragging) {
      this.isDragging = false;
      this.scale.set(1);
      // 检测是否放置到网格
      this.emit('cardDropped', { card: this.cardData, position: { x: this.x, y: this.y } });
    }
  }

  private onHover() {
    if (!this.isDragging) {
      Tween.to(this, { y: this.y - 20, scale: 1.05 }, 200);
    }
  }

  private onHoverEnd() {
    if (!this.isDragging) {
      Tween.to(this, { y: this.y + 20, scale: 1 }, 200);
    }
  }
}
```

#### DragSystem.ts（拖拽系统）

```typescript
export class DragSystem {
  private draggingCard: CardSprite | null = null;
  private gridCells: GridCell[] = [];

  public startDrag(card: CardSprite) {
    this.draggingCard = card;
    this.highlightValidCells();
  }

  public updateDrag(position: { x: number; y: number }) {
    if (!this.draggingCard) return;

    // 检测悬停的网格
    const hoveredCell = this.findHoveredCell(position);
    if (hoveredCell) {
      hoveredCell.setHighlight(true);
    }
  }

  public endDrag(position: { x: number; y: number }) {
    if (!this.draggingCard) return;

    const targetCell = this.findHoveredCell(position);
    if (targetCell && targetCell.isEmpty()) {
      // 放置卡牌到网格
      this.placeCard(this.draggingCard, targetCell);
    } else {
      // 返回手牌区
      this.returnToHand(this.draggingCard);
    }

    this.clearHighlights();
    this.draggingCard = null;
  }

  private findHoveredCell(position: { x: number; y: number }): GridCell | null {
    return this.gridCells.find(cell => cell.containsPoint(position)) || null;
  }

  private highlightValidCells() {
    this.gridCells.forEach(cell => {
      if (cell.isEmpty()) {
        cell.setHighlight(true);
      }
    });
  }

  private clearHighlights() {
    this.gridCells.forEach(cell => cell.setHighlight(false));
  }

  private placeCard(card: CardSprite, cell: GridCell) {
    // 播放放置动画
    Tween.to(card, {
      x: cell.x + cell.width / 2,
      y: cell.y + cell.height / 2,
      scale: 0.8,
    }, 300, 'easeOutBack');

    // 更新游戏状态
    useGameStore.getState().placeEntity(card.cardData, cell.row, cell.col);
  }

  private returnToHand(card: CardSprite) {
    // 返回原位置
    Tween.to(card, {
      x: card.originalX,
      y: card.originalY,
      scale: 1,
    }, 300, 'easeOutElastic');
  }
}
```

---

## 四、迁移步骤

### Phase 1：搭建 Canvas 基础（1-2天）
1. 安装 PixiJS：`npm install pixi.js`
2. 创建 `GameEngine` 和 `GameLoop`
3. 实现全屏 Canvas 容器
4. 测试基础渲染（显示一张卡牌）

### Phase 2：实现核心系统（3-4天）
1. 拖拽系统（DragSystem）
2. 网格系统（GridCell 渲染）
3. 手牌区域（HandArea）
4. 资源栏（ResourceBar）

### Phase 3：动画与特效（2-3天）
1. Tween 动画系统
2. 粒子系统（拆家爆炸）
3. 卡牌翻转、弹出动画
4. 过渡效果

### Phase 4：整合游戏逻辑（2天）
1. 连接 Zustand 状态
2. 实现回合流程
3. 测试完整游戏循环

---

## 五、性能优化

### 渲染优化
- 使用 Sprite Sheet（精灵图集）减少纹理切换
- 对象池（Object Pool）复用卡牌对象
- 脏矩形（Dirty Rectangle）只重绘变化区域
- 离屏渲染（OffscreenCanvas）处理复杂特效

### 内存优化
- 及时销毁不用的纹理
- 使用 WebP 格式压缩图片
- 懒加载非关键资源

---

## 六、与现有代码的兼容

### 保留的部分
- `src/store/gameStore.ts`：状态管理逻辑不变
- `config/*.json`：配置文件不变
- `src/types/card.ts`：类型定义不变

### 替换的部分
- `src/components/Card.tsx` → `src/game/entities/Card.ts`
- `src/components/GameGrid.tsx` → `src/game/entities/GridCell.ts`
- `src/components/Hand.tsx` → `src/game/ui/HandArea.ts`
- `src/pages/GameBoard.tsx` → `src/game/scenes/GameScene.ts`

### 新增的部分
- `src/game/core/`：游戏引擎核心
- `src/game/systems/`：各种游戏系统
- `src/game/utils/Tween.ts`：动画工具

---

## 七、示例：完整的 GameCanvas 组件

```tsx
import { useEffect, useRef } from 'react';
import { GameEngine } from '../game/core/GameEngine';

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // 初始化游戏引擎
    engineRef.current = new GameEngine(canvasRef.current);
    engineRef.current.start();

    // 清理
    return () => {
      engineRef.current?.destroy();
    };
  }, []);

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#000',
    }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
```

---

## 八、总结

### 优势
- 性能提升 10 倍以上（WebGL 渲染）
- 流畅的 60fps 动画
- 完全控制的拖拽体验
- 丰富的视觉特效
- 无滚动条，真正的游戏体验

### 工作量
- 预计 10-15 个工作日
- 可以逐步迁移，不影响现有功能

### 风险
- 学习曲线（PixiJS API）
- 调试难度增加（Canvas 无法用浏览器审查元素）
- 需要重写所有 UI 组件

**建议**：先用当前架构验证游戏逻辑，确认玩法无误后再迁移到 Canvas。
