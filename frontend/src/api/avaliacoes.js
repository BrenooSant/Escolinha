import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

export async function quesitos(escolinhaId) {
  return exec(
    supabase
      .from('quesitos_avaliacao')
      .select('*')
      .eq('escolinha_id', escolinhaId)
      .eq('ativo', true)
      .order('ordem')
      .order('nome')
  );
}

export async function criarQuesito(escolinhaId, nome, ordem) {
  return exec(
    supabase
      .from('quesitos_avaliacao')
      .insert({ escolinha_id: escolinhaId, nome, ordem })
      .select()
      .single()
  );
}

export async function apagarQuesito(id) {
  return exec(supabase.from('quesitos_avaliacao').delete().eq('id', id));
}

export async function doAluno(alunoId) {
  return exec(
    supabase
      .from('vw_avaliacoes')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('data', { ascending: false })
  );
}

/* notas: { [quesitoId]: 1..5 } — quesito sem nota fica de fora */
export async function salvar({ alunoId, data, notas, observacao, id }) {
  return rpc('salvar_avaliacao', {
    p_aluno: alunoId,
    p_data: data,
    p_notas: Object.entries(notas)
      .filter(([, nota]) => nota)
      .map(([quesito_id, nota]) => ({ quesito_id, nota: Number(nota) })),
    p_observacao: observacao || null,
    p_id: id ?? null,
  });
}

export async function apagar(id) {
  return exec(supabase.from('avaliacoes').delete().eq('id', id));
}
