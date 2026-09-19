import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

/* ---------- gestor ---------- */

export async function vigente(escolinhaId) {
  const linhas = await exec(
    supabase
      .from('contratos_modelo')
      .select('*')
      .eq('escolinha_id', escolinhaId)
      .order('versao', { ascending: false })
      .limit(1)
  );
  return linhas?.[0] ?? null;
}

/* Salvar é sempre versão nova: quem já aceitou continua com o texto que leu. */
export async function publicar(escolinhaId, texto) {
  return exec(
    supabase.from('contratos_modelo').insert({ escolinha_id: escolinhaId, texto }).select().single()
  );
}

export async function previa(escolinhaId, texto) {
  return rpc('previa_contrato', { p_escolinha: escolinhaId, p_texto: texto });
}

export async function aceiteDoAluno(alunoId) {
  const linhas = await exec(
    supabase
      .from('contratos_aceites')
      .select('*, modelo:contratos_modelo(versao)')
      .eq('aluno_id', alunoId)
      .order('aceito_em', { ascending: false })
      .limit(1)
  );
  return linhas?.[0] ?? null;
}

/* ---------- link de matrícula (anônimo) ---------- */

export async function previaMatricula(codigo, dados) {
  return rpc('contrato_publico', { p_codigo: codigo, p_dados: dados });
}

/* ---------- portal do responsável (anônimo, pelo token) ---------- */

export async function previaPortal(token, alunoId, nome, cpf) {
  return rpc('contrato_portal', { p_token: token, p_aluno: alunoId, p_nome: nome, p_cpf: cpf });
}

export async function aceitarPortal(token, alunoId, nome, cpf, hash) {
  return rpc('aceitar_contrato_portal', {
    p_token: token, p_aluno: alunoId, p_nome: nome, p_cpf: cpf, p_hash: hash,
  });
}
