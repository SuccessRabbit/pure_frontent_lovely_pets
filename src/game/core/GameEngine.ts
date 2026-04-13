import * as PIXI from 'pixi.js';
import { InputManager } from './InputManager';
import { SceneManager } from './SceneManager';

export class GameEngine {
  private app: PIXI.Application | null = null;
  private inputManager: InputManager | null = null;
  private sceneManager: SceneManager | null = null;

  private readonly boundResize = () => this.resizeCanvas();

  private readonly tickHandler = (ticker: PIXI.Ticker) => {
    if (!this.sceneManager || !this.inputManager) return;
    const dt = Math.min(ticker.deltaMS / 1000, 0.1);
    this.sceneManager.update(dt);
    this.inputManager.update();
  };

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const app = new PIXI.Application();
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);

    await app.init({
      canvas,
      width: w,
      height: h,
      backgroundAlpha: 0,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
    });

    this.app = app;
    this.inputManager = new InputManager(app.canvas);
    this.sceneManager = new SceneManager(app.stage);

    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '3'; // 透明 Pixi 前景层，覆盖在 Three.js 之上

    window.addEventListener('resize', this.boundResize);
    this.resizeCanvas();
    console.log('GameEngine initialized');
  }

  /** 设计坐标系 1920×1080，缩放并居中到当前视口 */
  private resizeCanvas() {
    const app = this.app;
    if (!app) return;

    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    app.renderer.resize(w, h);

    const scale = Math.min(w / 1920, h / 1080);
    app.stage.scale.set(scale);
    app.stage.position.set((w - 1920 * scale) / 2, (h - 1080 * scale) / 2);
  }

  /** 获取舞台缩放比例（供外部同步 Three.js canvas） */
  public getStageScale(): number {
    return Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  }

  /** 获取舞台偏移（供外部同步 Three.js canvas） */
  public getStageOffset(): { x: number; y: number } {
    const scale = this.getStageScale();
    return {
      x: (window.innerWidth - 1920 * scale) / 2,
      y: (window.innerHeight - 1080 * scale) / 2,
    };
  }

  start() {
    this.app?.ticker.add(this.tickHandler);
    console.log('Game started');
  }

  stop() {
    this.app?.ticker.remove(this.tickHandler);
  }

  destroy() {
    this.stop();
    const current = this.sceneManager?.getCurrentScene() as { detachFromStore?: () => void } | null;
    current?.detachFromStore?.();
    window.removeEventListener('resize', this.boundResize);
    // false：保留 canvas 节点，避免 React Strict Mode 卸载时从 DOM 摘除导致二次挂载黑屏
    this.app?.destroy(false);
    this.app = null;
    this.inputManager = null;
    this.sceneManager = null;
    console.log('GameEngine destroyed');
  }

  getApp(): PIXI.Application {
    if (!this.app) throw new Error('GameEngine not initialized');
    return this.app;
  }

  getSceneManager(): SceneManager {
    if (!this.sceneManager) throw new Error('GameEngine not initialized');
    return this.sceneManager;
  }

  getInputManager(): InputManager {
    if (!this.inputManager) throw new Error('GameEngine not initialized');
    return this.inputManager;
  }
}
