import { GameBoard } from './pages/GameBoard';
import { useCardLoader } from './hooks/useCardLoader';

/** 仅挂载画布；可见 UI 全部由 Pixi 绘制 */
function App() {
  useCardLoader();
  return <GameBoard />;
}

export default App;
