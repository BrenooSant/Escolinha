import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

/* Tudo que a tela de chamada precisa: o treino, o elenco da turma e as
   marcas já gravadas (se a chamada estiver sendo refeita). */
export async function abrir(treinoId) {
  const treino = await exec(supabase.from('vw_treinos').select('*').eq('id', treinoId).single());

  const [elenco, marcadas, atrasados] = await Promise.all([
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
  ]);
  const emAtraso = new Set(atrasados ?? []);

  const marcas = {};
  const motivos = {};
  for (const p of marcadas ?? []) {
    marcas[p.aluno_id] = p.marca;
    if (p.motivo) motivos[p.aluno_id] = p.motivo;
  }

  return {
    treino,
    elenco: (elenco ?? []).map((a) => ({ ...a, em_atraso: emAtraso.has(a.id) })),
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
