import { GameEngine } from './core/GameEngine';
import { GameScene } from './scenes/GameScene';

export const GAME_SCENE_ID = 'game';

/**
 * 在指定 canvas 上初始化 Pixi 引擎、注册主场景并启动 ticker。
 */
export async function bootstrapPixiGame(canvas: HTMLCanvasElement): Promise<GameEngine> {
  const engine = new GameEngine();
  await engine.init(canvas);
  const scene = new GameScene(engine.getInputManager());
  const scenes = engine.getSceneManager();
  scenes.addScene(GAME_SCENE_ID, scene);
  scenes.switchTo(GAME_SCENE_ID);
  engine.start();
  return engine;
}
