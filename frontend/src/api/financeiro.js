import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

export async function mensalidades(escolinhaId, { competencia, status } = {}) {
  let q = supabase.from('vw_mensalidades').select('*').eq('escolinha_id', escolinhaId);
  if (competencia) q = q.eq('competencia', competencia);
  if (status) q = q.eq('status', status);
  return exec(q.order('vencimento'));
}

/* Vencidas de qualquer mês — é o que a tela de cobrança mostra. */
export async function emAtraso(escolinhaId) {
  const linhas = await exec(
    supabase
      .from('vw_mensalidades')
      .select('*')
      .eq('escolinha_id', escolinhaId)
      .eq('status', 'aberta')
      .lt('vencimento', new Date().toISOString().slice(0, 10))
      .order('vencimento')
  );
  return linhas ?? [];
}

export async function gerarDoMes(escolinhaId, competencia = null) {
  return rpc('gerar_mensalidades', { p_escolinha: escolinhaId, p_competencia: competencia });
}

export async function registrarPagamento(mensalidadeId, metodo = 'pix') {
  return rpc('registrar_pagamento', { p_mensalidade: mensalidadeId, p_metodo: metodo });
}

export async function estornarPagamento(mensalidadeId) {
  return rpc('estornar_pagamento', { p_mensalidade: mensalidadeId });
}

export async function registrarLembrete(escolinhaId, mensalidadeId, mensagem) {
  return exec(
    supabase
      .from('lembretes')
      .insert({ escolinha_id: escolinhaId, mensalidade_id: mensalidadeId, mensagem })
      .select()
      .single()
  );
}

export async function lancamentos(escolinhaId, { de, ate, limite = 200 } = {}) {
  let q = supabase.from('lancamentos').select('*').eq('escolinha_id', escolinhaId);
  if (de) q = q.gte('data', de);
  if (ate) q = q.lte('data', ate);
  return exec(q.order('data', { ascending: false }).limit(limite));
}

export async function criarLancamento(escolinhaId, dados) {
  return exec(
    supabase.from('lancamentos').insert({ escolinha_id: escolinhaId, ...dados }).select().single()
  );
}

export async function apagarLancamento(id) {
  return exec(supabase.from('lancamentos').delete().eq('id', id));
}
