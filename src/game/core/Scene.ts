import * as PIXI from 'pixi.js';

export abstract class Scene {
  protected container: PIXI.Container;

  constructor() {
    this.container = new PIXI.Container();
  }

  public getContainer(): PIXI.Container {
    return this.container;
  }

  // 场景进入时调用
  public abstract onEnter(): void;

  // 场景退出时调用
  public abstract onExit(): void;

  // 每帧更新
  public abstract update(deltaTime: number): void;

  // 清理资源
  public destroy() {
    this.container.destroy({ children: true });
  }
}
