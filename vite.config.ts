import { defineConfig } from 'vite';
import { stubApi } from './server/plugin';

export default defineConfig({
  plugins: [stubApi()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
