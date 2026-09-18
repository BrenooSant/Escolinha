import { supabase } from '../lib/supabase.js';
import { exec } from './cliente.js';

/* Regras de cobrança da escolinha. Tudo só do gestor, pela RLS. */

export async function config(escolinhaId) {
  return exec(supabase.from('config_cobranca').select('*').eq('escolinha_id', escolinhaId).single());
}

export async function salvarConfig(escolinhaId, dados) {
  return exec(
    supabase
      .from('config_cobranca')
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq('escolinha_id', escolinhaId)
      .select()
      .single()
  );
}

export async function planos(escolinhaId) {
  return exec(
    supabase.from('planos').select('*').eq('escolinha_id', escolinhaId).order('meses').order('nome')
  );
}

export async function salvarPlano(escolinhaId, { id, ...dados }) {
  const q = id
    ? supabase.from('planos').update(dados).eq('id', id)
    : supabase.from('planos').insert({ escolinha_id: escolinhaId, ...dados });
  return exec(q.select().single());
}

export async function apagarPlano(id) {
  return exec(supabase.from('planos').delete().eq('id', id));
}

/* Valor combinado e plano do atleta. `null` em tudo = segue a turma,
   mês a mês — aí a linha nem precisa existir. */
export async function salvarDoAluno(alunoId, { mensalidade_centavos = null, plano_id = null }) {
  if (mensalidade_centavos == null && !plano_id) {
    return exec(supabase.from('alunos_cobranca').delete().eq('aluno_id', alunoId));
  }
  return exec(
    supabase
      .from('alunos_cobranca')
      // escolinha_id é preenchido pelo gatilho a partir do atleta
      .upsert({ aluno_id: alunoId, mensalidade_centavos, plano_id })
  );
}

/* Uniforme, campeonato, taxa cobrada à mão. A competência é o mês do
   vencimento, para a cobrança aparecer no mês certo do financeiro. */
export async function criarAvulsa(escolinhaId, alunoId, { descricao, valor_centavos, vencimento }) {
  return exec(
    supabase
      .from('mensalidades')
      .insert({
        escolinha_id: escolinhaId,
        aluno_id: alunoId,
        tipo: 'avulsa',
        descricao,
        valor_centavos,
        vencimento,
        competencia: vencimento.slice(0, 8) + '01',
      })
      .select('id')
      .single()
  );
}

export async function cancelar(mensalidadeId) {
  return exec(
    supabase.from('mensalidades').update({ status: 'cancelada' }).eq('id', mensalidadeId).select('id').single()
  );
}
