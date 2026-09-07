/* Mensalidade e caixa. Dinheiro é sempre inteiro em centavos — se algum
   dia virar float aqui, é neste arquivo que vai aparecer. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apagarEscolinha, configurado, entrar, novaEscolinha, novoAluno, novoResponsavel } from './ajuda.js';

describe.skipIf(!configurado)('financeiro', () => {
  let sb, esc, turma, aluno, mensalidade;

  beforeAll(async () => {
    sb = await entrar('dono');
    esc = await novaEscolinha(sb, 'financeiro');
    turma = esc.turmas.find((t) => t.nome === 'Sub-11');
    const resp = await novoResponsavel(sb, {
      escolinhaId: esc.id, nome: 'Mãe Pagadora', telefone: '(62) 90000-1111',
    });
    aluno = await novoAluno(sb, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Atleta Pagante', numero: 11,
      responsavel_id: resp.id,
    });
  });

  afterAll(async () => { await apagarEscolinha(sb, esc?.id); });

  it('gera uma mensalidade por atleta ativo, e não duplica ao repetir', async () => {
    const { data: primeira } = await sb.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: null });
    expect(primeira).toBe(1);

    const { data: segunda } = await sb.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: null });
    expect(segunda).toBe(0);
  });

  it('a mensalidade herda o valor da turma', async () => {
    const { data } = await sb.from('vw_mensalidades').select('*').eq('aluno_id', aluno.id).single();
    mensalidade = data;
    expect(data.valor_centavos).toBe(turma.mensalidade_centavos);
    expect(data.valor_centavos).toBe(13000);
    expect(data.status).toBe('aberta');
  });

  it('a baixa do pagamento lança a entrada no caixa', async () => {
    await sb.rpc('registrar_pagamento', { p_mensalidade: mensalidade.id, p_metodo: 'pix' });

    const { data: m } = await sb.from('vw_mensalidades').select('*').eq('id', mensalidade.id).single();
    expect(m.status).toBe('paga');
    expect(m.pago_em).toBeTruthy();

    const { data: lanc } = await sb.from('lancamentos').select('*').eq('mensalidade_id', mensalidade.id);
    expect(lanc).toHaveLength(1);
    expect(lanc[0]).toMatchObject({ tipo: 'entrada', valor_centavos: 13000 });
  });

  it('registrar o pagamento duas vezes não duplica a entrada', async () => {
    await sb.rpc('registrar_pagamento', { p_mensalidade: mensalidade.id, p_metodo: 'dinheiro' });
    const { data } = await sb.from('lancamentos').select('*').eq('mensalidade_id', mensalidade.id);
    expect(data).toHaveLength(1);
  });

  it('o estorno apaga o lançamento e reabre a mensalidade', async () => {
    await sb.rpc('estornar_pagamento', { p_mensalidade: mensalidade.id });

    const { data: m } = await sb.from('vw_mensalidades').select('*').eq('id', mensalidade.id).single();
    expect(m.status).toBe('aberta');
    expect(m.pago_em).toBeNull();

    const { data: lanc } = await sb.from('lancamentos').select('*').eq('mensalidade_id', mensalidade.id);
    expect(lanc).toEqual([]);
  });

  it('o painel soma o que foi recebido e o que está em atraso', async () => {
    await sb.rpc('registrar_pagamento', { p_mensalidade: mensalidade.id, p_metodo: 'pix' });

    const { data } = await sb.rpc('painel_resumo', { p_escolinha: esc.id });
    expect(data.atletas).toBe(1);
    expect(data.recebido).toBe(13000);
    expect(data.pagas).toBe(1);
    expect(data.devedores).toBe(0);
    expect(data.entradas_mes).toBe(13000);
  });

  it('mensalidade vencida entra como atraso', async () => {
    const outro = await novoAluno(sb, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Atleta Atrasado', numero: 12,
    });
    await sb.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: null });

    const ontem = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    await sb.from('mensalidades').update({ vencimento: ontem }).eq('aluno_id', outro.id);

    const { data } = await sb.rpc('painel_resumo', { p_escolinha: esc.id });
    expect(data.devedores).toBe(1);
    expect(data.atrasado).toBe(13000);
  });

  it('atleta arquivado não ganha mensalidade nova', async () => {
    const saindo = await novoAluno(sb, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Arquivado', numero: 13,
    });
    await sb.from('alunos').update({ ativo: false }).eq('id', saindo.id);

    const { data } = await sb.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: null });
    expect(data).toBe(0);
  });

  it('lançamento avulso entra e sai do caixa', async () => {
    const { data: novo } = await sb
      .from('lancamentos')
      .insert({
        escolinha_id: esc.id, descricao: 'Aluguel do campo', tipo: 'saida',
        valor_centavos: 90000, categoria: 'Estrutura',
      })
      .select()
      .single();

    const { data: painel } = await sb.rpc('painel_resumo', { p_escolinha: esc.id });
    expect(painel.saidas_mes).toBe(90000);

    await sb.from('lancamentos').delete().eq('id', novo.id);
    const { data: depois } = await sb.rpc('painel_resumo', { p_escolinha: esc.id });
    expect(depois.saidas_mes).toBe(0);
  });
});
