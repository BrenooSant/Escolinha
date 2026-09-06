import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

export async function periodo(escolinhaId, de, ate) {
  return exec(
    supabase
      .from('vw_treinos')
      .select('*')
      .eq('escolinha_id', escolinhaId)
      .gte('data', de)
      .lte('data', ate)
      .order('data')
      .order('hora')
  );
}

export async function daTurma(turmaId, { limite = 8, ate } = {}) {
  let q = supabase.from('vw_treinos').select('*').eq('turma_id', turmaId);
  if (ate) q = q.lte('data', ate);
  return exec(q.order('data', { ascending: false }).limit(limite));
}

export async function obter(id) {
  return exec(supabase.from('vw_treinos').select('*').eq('id', id).single());
}

export async function criar(escolinhaId, dados) {
  return exec(
    supabase.from('treinos').insert({ escolinha_id: escolinhaId, ...dados }).select().single()
  );
}

export async function salvar(id, dados) {
  return exec(supabase.from('treinos').update(dados).eq('id', id).select().single());
}

export async function cancelar(id) {
  return salvar(id, { status: 'cancelado' });
}

export async function apagar(id) {
  return exec(supabase.from('treinos').delete().eq('id', id));
}

/* Materializa a grade semanal das turmas em treinos de verdade.
   Rodar de novo é seguro: o índice único evita duplicata. */
export async function gerarDaGrade(escolinhaId, de, ate) {
  return rpc('gerar_treinos', { p_escolinha: escolinhaId, p_de: de, p_ate: ate });
}
