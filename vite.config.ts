import { defineConfig, loadEnv } from 'vite';
import { stubApi } from './server/plugin';

export default defineConfig(({ mode }) => ({
  plugins: [stubApi({ env: { ...loadEnv(mode, process.cwd(), ''), ...process.env } })],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
}));
