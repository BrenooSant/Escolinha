import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

/* A RLS deixa ver todos os membros das escolinhas em que você está —
   sem o filtro pelo seu id, a linha do gestor vinha junto e o professor
   herdava o papel dele na tela. */
export async function minhasEscolinhas() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const linhas = await exec(
    supabase
      .from('membros')
      .select('papel, escolinha:escolinhas(id, nome, cidade, local_padrao, chave_pix, razao_social, documento, dia_vencimento, tolerancia_atraso, codigo_matricula, matriculas_abertas, exige_contrato)')
      .eq('perfil_id', session.user.id)
      .order('criado_em', { ascending: true })
  );
  return (linhas ?? [])
    .filter((l) => l.escolinha)
    .map((l) => ({ ...l.escolinha, papel: l.papel }));
}

export async function salvarEscolinha(id, dados) {
  return exec(supabase.from('escolinhas').update(dados).eq('id', id).select().single());
}

/* Só o dono consegue, pela RLS. O `select` no fim é essencial: sem ele,
   um delete barrado pela política volta sem erro e sem ter apagado nada. */
export async function apagar(id) {
  const linhas = await exec(supabase.from('escolinhas').delete().eq('id', id).select('id'));
  if (!linhas?.length) {
    throw new Error('Só o gestor pode apagar a escolinha.');
  }
  return linhas[0];
}

export async function trocarCodigoMatricula(id) {
  return rpc('trocar_codigo_matricula', { p_escolinha: id });
}

export async function equipe(escolinhaId) {
  return exec(
    supabase
      .from('membros')
      .select('papel, criado_em, perfil:perfis(id, nome, telefone)')
      .eq('escolinha_id', escolinhaId)
      .order('criado_em')
  );
}

export async function painelResumo(escolinhaId) {
  return rpc('painel_resumo', { p_escolinha: escolinhaId });
}
