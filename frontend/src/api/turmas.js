import { supabase } from '../lib/supabase.js';
import { exec } from './cliente.js';

export async function listar(escolinhaId) {
  return exec(
    supabase
      .from('vw_turmas')
      .select('*')
      .eq('escolinha_id', escolinhaId)
      .order('ordem')
      .order('nome')
  );
}

export async function criar(escolinhaId, dados) {
  return exec(
    supabase.from('turmas').insert({ escolinha_id: escolinhaId, ...dados }).select().single()
  );
}

export async function salvar(id, dados) {
  return exec(supabase.from('turmas').update(dados).eq('id', id).select().single());
}

export async function apagar(id) {
  return exec(supabase.from('turmas').delete().eq('id', id));
}

/* A grade semanal é reescrita inteira: é menos código do que
   comparar horário a horário, e a lista nunca passa de meia dúzia. */
export async function definirHorarios(turmaId, horarios) {
  await exec(supabase.from('turma_horarios').delete().eq('turma_id', turmaId));
  if (!horarios.length) return [];
  return exec(
    supabase
      .from('turma_horarios')
      .insert(horarios.map((h) => ({ turma_id: turmaId, ...h })))
      .select()
  );
}
