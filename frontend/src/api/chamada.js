import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

/* Tudo que a tela de chamada precisa: o treino, o elenco da turma e as
   marcas já gravadas (se a chamada estiver sendo refeita). */
export async function abrir(treinoId) {
  const treino = await exec(supabase.from('vw_treinos').select('*').eq('id', treinoId).single());

  const [elenco, marcadas, atrasados, bloqueados, liberados, escolinha] = await Promise.all([
    exec(
      supabase
        .from('vw_alunos')
        .select('id, nome, numero, posicao, frequencia, foto_path')
        .eq('turma_id', treino.turma_id)
        .eq('ativo', true)
        .order('nome')
    ),
    exec(supabase.from('presencas').select('aluno_id, marca, motivo').eq('treino_id', treinoId)),
    // só os ids: o professor vê o aviso, não o valor nem a data
    rpc('alunos_em_atraso', { p_escolinha: treino.escolinha_id }),
    // vazio enquanto a escolinha estiver só avisando — a função decide
    rpc('alunos_bloqueados', { p_escolinha: treino.escolinha_id }),
    exec(
      supabase
        .from('liberacoes')
        .select('aluno_id, motivo, criado_em')
        .eq('treino_id', treinoId)
    ),
    // o professor lê a escolinha (só não edita); o modo escolhe o texto
    exec(
      supabase
        .from('escolinhas')
        .select('bloqueio_inadimplencia')
        .eq('id', treino.escolinha_id)
        .single()
    ),
  ]);

  const emAtraso = new Set(atrasados ?? []);
  const travados = new Set(bloqueados ?? []);
  const liberacoes = Object.fromEntries((liberados ?? []).map((l) => [l.aluno_id, l]));

  const marcas = {};
  const motivos = {};
  for (const p of marcadas ?? []) {
    marcas[p.aluno_id] = p.marca;
    if (p.motivo) motivos[p.aluno_id] = p.motivo;
  }

  return {
    treino,
    modoBloqueio: escolinha?.bloqueio_inadimplencia ?? 'avisar',
    elenco: (elenco ?? []).map((a) => ({
      ...a,
      em_atraso: emAtraso.has(a.id),
      bloqueado: travados.has(a.id),
      liberacao: liberacoes[a.id] ?? null,
    })),
    marcas,
    motivos,
  };
}

/* marcas: { [alunoId]: 'P' | 'F' | 'J' }  ·  motivos: { [alunoId]: texto } */
export async function salvar(treinoId, marcas, motivos = {}) {
  const lista = Object.entries(marcas)
    .filter(([, marca]) => marca)
    .map(([aluno_id, marca]) => ({
      aluno_id,
      marca,
      motivo: marca === 'J' ? motivos[aluno_id] || null : null,
    }));

  return rpc('salvar_chamada', { p_treino: treinoId, p_marcas: lista });
}

/* Abre a exceção para um treino só. Do professor a função recusa — a
   RLS também recusaria, mas com uma mensagem que não diz o porquê. */
export async function liberar(treinoId, alunoId, motivo) {
  return rpc('liberar_atleta', { p_treino: treinoId, p_aluno: alunoId, p_motivo: motivo });
}

export async function desfazerLiberacao(treinoId, alunoId) {
  const linhas = await exec(
    supabase.from('liberacoes').delete().eq('treino_id', treinoId).eq('aluno_id', alunoId).select('id')
  );
  if (!linhas?.length) {
    throw new Error('Só o gestor pode desfazer a liberação.');
  }
  return linhas[0];
}

/* Histórico da ficha do atleta: quando ele treinou devendo, e por quê. */
export async function liberacoesDoAluno(alunoId) {
  return exec(
    supabase
      .from('liberacoes')
      .select('id, motivo, criado_em, treino:treinos(data, turma_id)')
      .eq('aluno_id', alunoId)
      .order('criado_em', { ascending: false })
  );
}
