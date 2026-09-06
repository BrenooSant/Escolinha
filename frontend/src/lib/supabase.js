import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* Sem chave o app não sobe. Falhar aqui, alto e claro, é melhor do que
   deixar cada tela quebrar com "failed to fetch". */
export const configurado = Boolean(url && chave);

export const supabase = configurado
  ? createClient(url, chave, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // o app roda em hash router (GitHub Pages), então o Supabase
        // não deve tentar reescrever a URL depois do login
        detectSessionInUrl: false,
      },
    })
  : null;

/* Traduz o erro do Postgres para algo que o professor entenda.
   As mensagens que nós mesmos levantamos no banco já vêm em português. */
export function mensagemDeErro(erro) {
  if (!erro) return null;
  const bruto = erro.message || String(erro);

  const conhecidos = {
    'Invalid login credentials': 'E-mail ou senha incorretos.',
    'Email not confirmed': 'Confirme o e-mail antes de entrar.',
    'User already registered': 'Já existe uma conta com esse e-mail.',
    'Password should be at least 6 characters': 'A senha precisa ter ao menos 6 caracteres.',
    'Failed to fetch': 'Sem conexão com o servidor. Confira a internet.',
  };
  for (const [chave, texto] of Object.entries(conhecidos)) {
    if (bruto.includes(chave)) return texto;
  }

  if (erro.code === '23505') return bruto.includes('numero') ? 'Já existe um atleta com esse número.' : bruto;
  if (erro.code === '42501') return 'Você não tem permissão para essa ação.';

  return bruto;
}
