import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // O site é publicado em brenoosant.github.io/Escolinha/
  base: '/Escolinha/',
  plugins: [react(), tailwindcss()],

  // O Vitest herda esta configuração, então o JSX das telas já compila
  // nos testes de renderização.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testes/preparo.js'],
    css: false,
  },
});
