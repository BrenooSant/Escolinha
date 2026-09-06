import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

export async function minhasEscolinhas() {
  const linhas = await exec(
    supabase
      .from('membros')
      .select('papel, escolinha:escolinhas(id, nome, cidade, local_padrao, chave_pix, dia_vencimento, codigo_matricula, matriculas_abertas)')
      .order('criado_em', { ascending: true })
  );
  return (linhas ?? [])
    .filter((l) => l.escolinha)
    .map((l) => ({ ...l.escolinha, papel: l.papel }));
}

export async function salvarEscolinha(id, dados) {
  return exec(supabase.from('escolinhas').update(dados).eq('id', id).select().single());
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
