import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

/* 画布应用避免 StrictMode 双挂载对 WebGL 上下文的干扰 */
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
