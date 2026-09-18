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

/* O responsável avisou, mas o dinheiro não apareceu no extrato: tira a
   marca e a mensalidade volta para a fila normal de cobrança. */
export async function limparAviso(mensalidadeId) {
  return exec(
    supabase
      .from('mensalidades')
      .update({ avisado_em: null, aviso_obs: null })
      .eq('id', mensalidadeId)
      .select()
      .single()
  );
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

/* O caixa: só o que foi pago ou recebido. Conta pendente mora em contas(). */
export async function lancamentos(escolinhaId, { de, ate, limite = 200 } = {}) {
  let q = supabase.from('lancamentos').select('*').eq('escolinha_id', escolinhaId).eq('pago', true);
  if (de) q = q.gte('data', de);
  if (ate) q = q.lte('data', ate);
  return exec(q.order('data', { ascending: false }).limit(limite));
}

/* Contas a pagar e a receber ainda pendentes, da que vence antes. */
export async function contas(escolinhaId) {
  return exec(
    supabase
      .from('lancamentos')
      .select('*')
      .eq('escolinha_id', escolinhaId)
      .eq('pago', false)
      .order('vencimento')
  );
}

/* Devolve o id da próxima, quando a conta é recorrente. */
export async function pagarConta(id, { data = null, valor = null } = {}) {
  return rpc('pagar_conta', { p_lancamento: id, p_data: data, p_valor: valor });
}

export async function criarLancamento(escolinhaId, dados) {
  return exec(
    supabase.from('lancamentos').insert({ escolinha_id: escolinhaId, ...dados }).select().single()
  );
}

export async function salvarLancamento(id, dados) {
  return exec(supabase.from('lancamentos').update(dados).eq('id', id).select().single());
}

export async function obter(mensalidadeId) {
  return exec(supabase.from('vw_mensalidades').select('*').eq('id', mensalidadeId).single());
}

/* Mensalidades de um atleta, da mais nova para a mais antiga —
   alimenta o histórico da ficha. */
export async function doAluno(alunoId, limite = 12) {
  return exec(
    supabase
      .from('vw_mensalidades')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('competencia', { ascending: false })
      .limit(limite)
  );
}

/* O responsável avisou que pagou e ainda não foi confirmado. */
export async function avisados(escolinhaId) {
  return exec(
    supabase
      .from('vw_mensalidades')
      .select('*')
      .eq('escolinha_id', escolinhaId)
      .eq('status', 'aberta')
      .not('avisado_em', 'is', null)
      .order('avisado_em', { ascending: false })
  );
}

export async function apagarLancamento(id) {
  return exec(supabase.from('lancamentos').delete().eq('id', id));
}
