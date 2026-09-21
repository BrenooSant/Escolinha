import { supabase } from '../lib/supabase.js';
import { exec } from './cliente.js';

/* A chave da escolinha nunca passa por aqui de volta: quem guarda e usa
   é o servidor. A tela só sabe se está conectada e o que deu errado. */

export async function conexao(escolinhaId) {
  return exec(
    supabase.from('asaas_conta').select('*').eq('escolinha_id', escolinhaId).maybeSingle()
  );
}

async function invocar(nome, corpo) {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo });
  // o erro da função vem no corpo; o error do cliente é só o status
  if (data?.erro) throw new Error(data.erro);
  if (error) {
    const detalhe = await error.context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro ?? error.message);
  }
  return data;
}

export async function conectar(escolinhaId, apiKey) {
  return invocar('asaas-conectar', { escolinha_id: escolinhaId, api_key: apiKey });
}

export async function desconectar(escolinhaId) {
  const linhas = await exec(
    supabase.from('asaas_conta').delete().eq('escolinha_id', escolinhaId).select('escolinha_id')
  );
  if (!linhas?.length) throw new Error('Só o gestor desconecta a conta.');
  return linhas[0];
}

/* Portal do responsável: gera (ou reaproveita) a cobrança da
   mensalidade. Quando ainda falta o CPF, devolve { precisa_cpf }. */
export async function cobrar(token, mensalidadeId, { cpf, nome } = {}) {
  return invocar('asaas-cobranca', { token, mensalidade_id: mensalidadeId, cpf, nome });
}
