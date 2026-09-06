import { supabase, mensagemDeErro } from '../lib/supabase.js';

/* Todo acesso ao banco passa por aqui. O resto do app só vê dados ou
   uma exceção com mensagem pronta para mostrar na tela. */
export async function exec(consulta) {
  const { data, error } = await consulta;
  if (error) {
    const e = new Error(mensagemDeErro(error));
    e.original = error;
    throw e;
  }
  return data;
}

export async function rpc(nome, args) {
  return exec(supabase.rpc(nome, args));
}

export { supabase };
