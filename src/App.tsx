import { AdminPage } from './admin/AdminPage';
import { GameBoard } from './pages/GameBoard';
import { useCardLoader } from './hooks/useCardLoader';
import { useConfigHotReload } from './hooks/useConfigHotReload';

/** 仅挂载画布；可见 UI 全部由 Pixi 绘制 */
function App() {
  const isAdminRoute = window.location.pathname.startsWith('/admin');
  useConfigHotReload(!isAdminRoute);
  useCardLoader(!isAdminRoute);
  return isAdminRoute ? <AdminPage /> : <GameBoard />;
}

export default App;
