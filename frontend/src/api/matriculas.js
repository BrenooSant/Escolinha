import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

/* ---------- lado público: sem login, só as duas RPC liberadas ---------- */

export async function escolinhaPorCodigo(codigo) {
  return rpc('escolinha_publica', { p_codigo: codigo });
}

export async function enviarFicha(codigo, dados) {
  return rpc('enviar_pre_matricula', { p_codigo: codigo, p_dados: dados });
}

/* ---------- lado do professor ---------- */

export async function pendentes(escolinhaId) {
  return exec(
    supabase
      .from('pre_matriculas')
      .select('*, turma:turmas(id, nome)')
      .eq('escolinha_id', escolinhaId)
      .eq('status', 'pendente')
      .order('enviada_em', { ascending: false })
  );
}

export async function decididas(escolinhaId, limite = 30) {
  return exec(
    supabase
      .from('pre_matriculas')
      .select('*, turma:turmas(id, nome)')
      .eq('escolinha_id', escolinhaId)
      .neq('status', 'pendente')
      .order('decidida_em', { ascending: false })
      .limit(limite)
  );
}

export async function aprovar(id, { turmaId, numero } = {}) {
  return rpc('aprovar_pre_matricula', {
    p_id: id,
    p_turma_id: turmaId ?? null,
    p_numero: numero ?? null,
  });
}

export async function recusar(id, motivo) {
  return rpc('recusar_pre_matricula', { p_id: id, p_motivo: motivo || null });
}
