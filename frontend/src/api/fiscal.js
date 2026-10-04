import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

/* Nota fiscal. A configuração fiscal de verdade mora no Asaas; aqui
   fica só o que a emissão precisa consultar depois. Tudo do gestor,
   pela RLS. */

async function invocar(nome, corpo) {
  const { data, error } = await supabase.functions.invoke(nome, { body: corpo });
  if (data?.erro) throw new Error(data.erro);
  if (error) {
    const detalhe = await error.context?.json?.().catch(() => null);
    throw new Error(detalhe?.erro ?? error.message);
  }
  return data;
}

/* Por que não dá para emitir, quando não dá: a tela usa isso para
   explicar o que falta em vez de só esconder o botão. */
export async function situacao(escolinhaId) {
  return rpc('situacao_fiscal', { p_escolinha: escolinhaId });
}

export async function config(escolinhaId) {
  return exec(
    supabase.from('config_fiscal').select('*').eq('escolinha_id', escolinhaId).maybeSingle()
  );
}

/* O que ESTE município exige, perguntado ao Asaas na hora. É isso que
   deixa o formulário se montar sozinho em vez de supor um padrão que
   serviria para 5 570 prefeituras. */
export async function opcoes(escolinhaId) {
  return invocar('nf-configurar', { escolinha_id: escolinhaId, acao: 'opcoes' });
}

export async function salvar(escolinhaId, fiscal) {
  return invocar('nf-configurar', { escolinha_id: escolinhaId, acao: 'salvar', fiscal });
}

export async function emitir(mensalidadeId) {
  return invocar('nf-emitir', { mensalidade_id: mensalidadeId });
}

/* As notas de uma escolinha, para a tela de Cobranças mostrar a
   situação ao lado da mensalidade. */
export async function notas(escolinhaId) {
  return exec(
    supabase
      .from('vw_notas_fiscais')
      .select('*')
      .eq('escolinha_id', escolinhaId)
      .order('criada_em', { ascending: false })
  );
}
