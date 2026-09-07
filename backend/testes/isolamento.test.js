/* A regra que sustenta todo o resto: uma escolinha não enxerga a outra,
   e o visitante sem login não enxerga nada. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apagarEscolinha, clienteAnonimo, configurado, entrar, novaEscolinha, novoAluno } from './ajuda.js';

describe.skipIf(!configurado)('isolamento entre escolinhas', () => {
  let dono, colega, anon, esc, aluno;

  beforeAll(async () => {
    dono = await entrar('dono');
    colega = await entrar('colega');
    anon = clienteAnonimo();
    esc = await novaEscolinha(dono, 'isolamento');
    aluno = await novoAluno(dono, {
      escolinhaId: esc.id,
      turmaId: esc.turmas[0].id,
      nome: 'Atleta Reservado',
      numero: 3,
    });
  });

  afterAll(async () => { await apagarEscolinha(dono, esc?.id); });

  it('o dono enxerga o próprio atleta', async () => {
    const { data } = await dono.from('vw_alunos').select('*').eq('id', aluno.id);
    expect(data).toHaveLength(1);
  });

  it.each([
    'alunos', 'escolinhas', 'membros', 'turmas', 'responsaveis', 'treinos',
    'presencas', 'mensalidades', 'lancamentos', 'lembretes', 'pre_matriculas',
    'convites', 'avaliacoes', 'quesitos_avaliacao',
  ])('o anônimo não lê %s', async (tabela) => {
    const { error } = await anon.from(tabela).select('*').limit(1);
    expect(error?.message ?? '').toMatch(/permission denied/i);
  });

  it.each([
    ['painel_resumo', { p_escolinha: '00000000-0000-0000-0000-000000000000' }],
    ['criar_escolinha', { p_nome: 'Invasão' }],
    ['proximo_numero', { p_escolinha: '00000000-0000-0000-0000-000000000000' }],
    ['gerar_treinos', { p_escolinha: '00000000-0000-0000-0000-000000000000', p_de: '2026-01-01', p_ate: '2026-01-02' }],
    ['salvar_chamada', { p_treino: '00000000-0000-0000-0000-000000000000', p_marcas: [] }],
    ['registrar_pagamento', { p_mensalidade: '00000000-0000-0000-0000-000000000000' }],
    ['aprovar_pre_matricula', { p_id: '00000000-0000-0000-0000-000000000000' }],
    ['gerar_mensalidades_todas', {}],
  ])('o anônimo não executa %s', async (fn, args) => {
    const { error } = await anon.rpc(fn, args);
    expect(error?.message ?? '').toMatch(/permission denied|find the function|schema cache/i);
  });

  it('outro professor não lê os atletas', async () => {
    const { data } = await colega.from('vw_alunos').select('id').eq('escolinha_id', esc.id);
    expect(data).toEqual([]);
  });

  it('outro professor não escreve no atleta alheio', async () => {
    const { data } = await colega.from('alunos').update({ nome: 'Invadido' }).eq('id', aluno.id).select();
    expect(data).toEqual([]);

    const { data: intacto } = await dono.from('alunos').select('nome').eq('id', aluno.id).single();
    expect(intacto.nome).toBe('Atleta Reservado');
  });

  it('outro professor não apaga o atleta alheio', async () => {
    const { data } = await colega.from('alunos').delete().eq('id', aluno.id).select();
    expect(data).toEqual([]);
  });

  it('painel_resumo de escolinha alheia volta zerado', async () => {
    const { data } = await colega.rpc('painel_resumo', { p_escolinha: esc.id });
    expect(data.atletas).toBe(0);
    expect(data.recebido).toBe(0);
  });

  it('outro professor não se inscreve na equipe por conta própria', async () => {
    const { data: eu } = await colega.auth.getUser();
    const { error } = await colega
      .from('membros')
      .insert({ escolinha_id: esc.id, perfil_id: eu.user.id, papel: 'dono' })
      .select()
      .single();
    expect(error).toBeTruthy();
  });
});
