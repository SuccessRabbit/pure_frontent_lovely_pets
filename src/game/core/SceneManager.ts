import * as PIXI from 'pixi.js';
import { Scene } from './Scene';

export class SceneManager {
  private stage: PIXI.Container;
  private currentScene: Scene | null = null;
  private scenes: Map<string, Scene> = new Map();

  constructor(stage: PIXI.Container) {
    this.stage = stage;
  }

  public addScene(name: string, scene: Scene) {
    this.scenes.set(name, scene);
    console.log(`Scene added: ${name}`);
  }

  public switchTo(name: string) {
    const scene = this.scenes.get(name);
    if (!scene) {
      console.error(`Scene not found: ${name}`);
      return;
    }

    // 退出当前场景
    if (this.currentScene) {
      this.currentScene.onExit();
      this.stage.removeChild(this.currentScene.getContainer());
    }

    // 进入新场景
    this.currentScene = scene;
    this.stage.addChild(scene.getContainer());
    scene.onEnter();

    console.log(`Switched to scene: ${name}`);
  }

  public update(deltaTime: number) {
    if (this.currentScene) {
      this.currentScene.update(deltaTime);
    }
  }

  public getCurrentScene(): Scene | null {
    return this.currentScene;
  }
}
