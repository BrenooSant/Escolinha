import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';
import { salvarDoAluno } from './cobranca.js';

export async function listar(escolinhaId, { ativos = true } = {}) {
  let q = supabase.from('vw_alunos').select('*').eq('escolinha_id', escolinhaId);
  if (ativos !== null) q = q.eq('ativo', ativos);
  return exec(q.order('nome'));
}

export async function obter(id) {
  return exec(supabase.from('vw_alunos').select('*').eq('id', id).single());
}

/* Últimos treinos do atleta, para a fita de presença da ficha. */
export async function historico(alunoId, limite = 10) {
  const linhas = await exec(
    supabase
      .from('presencas')
      .select('marca, motivo, treino:treinos(id, data, hora, tipo, turma_id)')
      .eq('aluno_id', alunoId)
      .order('registrado_em', { ascending: false })
      .limit(limite)
  );
  return (linhas ?? [])
    .filter((l) => l.treino)
    .map((l) => ({ ...l.treino, marca: l.marca, motivo: l.motivo }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

export async function proximoNumero(escolinhaId) {
  return rpc('proximo_numero', { p_escolinha: escolinhaId });
}

/* Matricular cria (ou reaproveita) o responsável e depois o atleta.
   O telefone é a chave: irmãos entram sob o mesmo responsável. */
export async function matricular(escolinhaId, { responsavel, cobranca, ...aluno }) {
  const responsavelId = await garantirResponsavel(escolinhaId, responsavel);

  const novo = await exec(
    supabase
      .from('alunos')
      .insert({ escolinha_id: escolinhaId, responsavel_id: responsavelId, ...aluno })
      .select()
      .single()
  );
  // antes de gerar a mensalidade, para ela já sair com o valor e o plano certos
  if (cobranca) await salvarDoAluno(novo.id, cobranca);

  // já deixa a mensalidade do mês criada, para o atleta aparecer no financeiro
  await rpc('gerar_mensalidades', { p_escolinha: escolinhaId, p_competencia: null });
  return novo;
}

export async function salvar(escolinhaId, id, { responsavel, cobranca, ...aluno }) {
  const dados = { ...aluno };
  if (responsavel) dados.responsavel_id = await garantirResponsavel(escolinhaId, responsavel);
  const salvo = await exec(supabase.from('alunos').update(dados).eq('id', id).select().single());
  if (cobranca) await salvarDoAluno(id, cobranca);
  return salvo;
}

export async function arquivar(id) {
  return exec(supabase.from('alunos').update({ ativo: false }).eq('id', id).select().single());
}

export async function reativar(id) {
  return exec(supabase.from('alunos').update({ ativo: true }).eq('id', id).select().single());
}

export async function apagar(id) {
  return exec(supabase.from('alunos').delete().eq('id', id));
}

/* Colunas explícitas: o banco não entrega `token` no select direto — ele
   abre o portal, que mostra as mensalidades. Quem monta o link é o
   gestor, e o token vem de uma função que só responde a ele. */
const COLUNAS_RESPONSAVEL = 'id, escolinha_id, nome, parentesco, telefone, email, criado_em';

export async function responsavel(id) {
  if (!id) return null;
  const [dados, token] = await Promise.all([
    exec(supabase.from('responsaveis').select(COLUNAS_RESPONSAVEL).eq('id', id).maybeSingle()),
    rpc('token_responsavel', { p_responsavel: id }),
  ]);
  return dados && { ...dados, token };
}

export async function trocarTokenResponsavel(id) {
  return rpc('trocar_token_responsavel', { p_responsavel: id });
}

export async function listarResponsaveis(escolinhaId) {
  return exec(
    supabase.from('responsaveis').select(COLUNAS_RESPONSAVEL).eq('escolinha_id', escolinhaId).order('nome')
  );
}

async function garantirResponsavel(escolinhaId, responsavel) {
  if (responsavel.id) {
    await exec(
      supabase
        .from('responsaveis')
        .update({
          nome: responsavel.nome,
          parentesco: responsavel.parentesco,
          telefone: responsavel.telefone,
          email: responsavel.email || null,
        })
        .eq('id', responsavel.id)
    );
    return responsavel.id;
  }

  if (responsavel.telefone) {
    const existente = await exec(
      supabase
        .from('responsaveis')
        .select('id')
        .eq('escolinha_id', escolinhaId)
        .eq('telefone', responsavel.telefone)
        .maybeSingle()
    );
    if (existente) return existente.id;
  }

  const criado = await exec(
    supabase
      .from('responsaveis')
      .insert({
        escolinha_id: escolinhaId,
        nome: responsavel.nome,
        parentesco: responsavel.parentesco,
        telefone: responsavel.telefone,
        email: responsavel.email || null,
      })
      .select('id')
      .single()
  );
  return criado.id;
}
