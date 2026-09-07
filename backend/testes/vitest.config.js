import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // cada arquivo fala com o Supabase pela rede; o padrão de 5s não dá
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // arquivos em paralelo criariam escolinhas ao mesmo tempo na mesma
    // conta de teste — funciona, mas embaralha o diagnóstico quando falha
    fileParallelism: false,
    reporters: 'verbose',
  },
});
