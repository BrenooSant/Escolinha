import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

/* ---------- gestor ---------- */

export async function listar(escolinhaId) {
  return exec(
    supabase
      .from('leads')
      .select('*, turma:turmas(id, nome)')
      .eq('escolinha_id', escolinhaId)
      .order('criado_em', { ascending: false })
      .limit(500)
  );
}

export async function criar(escolinhaId, dados) {
  return exec(supabase.from('leads').insert({ escolinha_id: escolinhaId, ...dados }).select().single());
}

export async function salvar(id, dados) {
  return exec(supabase.from('leads').update(dados).eq('id', id).select().single());
}

export async function apagar(id) {
  return exec(supabase.from('leads').delete().eq('id', id));
}

export async function notas(leadId) {
  return exec(
    supabase.from('leads_notas').select('*').eq('lead_id', leadId).order('criado_em', { ascending: false })
  );
}

export async function anotar(leadId, texto) {
  return exec(supabase.from('leads_notas').insert({ lead_id: leadId, texto }).select().single());
}

/* ---------- formulário público de aula experimental ---------- */

export async function registrarInteresse(codigo, dados) {
  return rpc('registrar_interesse', { p_codigo: codigo, p_dados: dados });
}
