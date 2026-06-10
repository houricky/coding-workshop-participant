import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The predefined structure ships `src/App.js` containing JSX. Vite/esbuild does
// not treat `.js` as JSX by default, so we widen the loader to cover it. All
// other component files use the conventional `.jsx` extension.
export default defineConfig({
  plugins: [react()],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    open: true,
  },
});
