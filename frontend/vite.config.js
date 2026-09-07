import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  /* O site é publicado na raiz do domínio (Netlify). Em subpasta — como
     era no GitHub Pages, em /Escolinha/ — isto precisa mudar junto, ou
     todo asset sai com caminho errado e a página abre em branco. */
  base: '/',
  plugins: [react(), tailwindcss()],

  // O Vitest herda esta configuração, então o JSX das telas já compila
  // nos testes de renderização.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testes/preparo.js'],
    css: false,
  },
});
