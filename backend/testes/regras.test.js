/* Regras de cobrança por escolinha. Tudo nasce desligado; cada regra
   ligada precisa mudar o valor do jeito que o responsável vai ver — e
   do jeito que o Asaas vai calcular quando a integração chegar. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apagarEscolinha, clienteAnonimo, configurado, emDias, entrar, idDoUsuario,
  novaEscolinha, novoAluno, novoResponsavel,
} from './ajuda.js';

describe.skipIf(!configurado)('regras de cobrança', () => {
  let gestor, professor, idProfessor, esc, turma, preco;

  const config = (dados) =>
    gestor.from('config_cobranca').update(dados).eq('escolinha_id', esc.id).select().single();

  const cobrancas = async (alunoId) => {
    const { data } = await gestor
      .from('vw_mensalidades').select('*').eq('aluno_id', alunoId).order('competencia');
    return data;
  };

  // mensalidade avulsa no tempo: competência qualquer, vencimento escolhido
  const cobrar = async (alunoId, { competencia, vencimento, valor = 10000, tipo = 'mensalidade', descricao }) => {
    const { data, error } = await gestor
      .from('mensalidades')
      .insert({
        escolinha_id: esc.id, aluno_id: alunoId, competencia, vencimento,
        valor_centavos: valor, tipo, descricao,
      })
      .select('id')
      .single();
    if (error) throw new Error('cobrar: ' + error.message);
    return (await gestor.from('vw_mensalidades').select('*').eq('id', data.id).single()).data;
  };

  beforeAll(async () => {
    gestor = await entrar('dono');
    professor = await entrar('colega');
    idProfessor = await idDoUsuario(professor);
    esc = await novaEscolinha(gestor, 'regras');
    turma = esc.turmas[0];
    preco = turma.mensalidade_centavos;
    await gestor.from('membros').insert({ escolinha_id: esc.id, perfil_id: idProfessor, papel: 'professor' });
  });

  afterAll(async () => {
    await gestor.from('membros').delete().eq('escolinha_id', esc?.id).eq('perfil_id', idProfessor);
    await apagarEscolinha(gestor, esc?.id);
  });

  it('a escolinha nasce com tudo desligado', async () => {
    const { data } = await gestor.from('config_cobranca').select('*').eq('escolinha_id', esc.id).single();
    expect(Number(data.desconto_valor)).toBe(0);
    expect(Number(data.multa_percentual)).toBe(0);
    expect(Number(data.juros_mes_percentual)).toBe(0);
    expect(data.taxa_matricula_centavos).toBe(0);
    expect(Number(data.desconto_irmao_percentual)).toBe(0);
  });

  it('sem regra nenhuma, o valor não muda antes nem depois do vencimento', async () => {
    const a = await novoAluno(gestor, { escolinhaId: esc.id, turmaId: turma.id, nome: 'Sem Regra', numero: 1 });
    const antes = await cobrar(a.id, { competencia: '2031-01-01', vencimento: emDias(10) });
    const depois = await cobrar(a.id, { competencia: '2031-02-01', vencimento: emDias(-10) });
    expect(antes.valor_atualizado_centavos).toBe(10000);
    expect(depois.valor_atualizado_centavos).toBe(10000);
  });

  describe('pontualidade e atraso', () => {
    let aluno;
    beforeAll(async () => {
      aluno = await novoAluno(gestor, { escolinhaId: esc.id, turmaId: turma.id, nome: 'Regras Ligadas', numero: 2 });
    });

    it('desconto fixo até o vencimento', async () => {
      await config({ desconto_tipo: 'fixo', desconto_valor: 1500, desconto_dias: 0 });
      const m = await cobrar(aluno.id, { competencia: '2031-01-01', vencimento: emDias(3) });
      expect(m.desconto_centavos).toBe(1500);
      expect(m.valor_atualizado_centavos).toBe(8500);
    });

    it('desconto percentual, só até X dias antes do vencimento', async () => {
      await config({ desconto_tipo: 'percentual', desconto_valor: 10, desconto_dias: 5 });
      const valendo = await cobrar(aluno.id, { competencia: '2031-02-01', vencimento: emDias(8) });
      const passou = await cobrar(aluno.id, { competencia: '2031-03-01', vencimento: emDias(2) });
      expect(valendo.valor_atualizado_centavos).toBe(9000);
      expect(passou.desconto_centavos).toBe(1000);
      expect(passou.valor_atualizado_centavos).toBe(10000);
    });

    it('multa + juros ao mês, pro rata por dia', async () => {
      await config({ desconto_valor: 0, multa_percentual: 2, juros_mes_percentual: 1 });
      const m = await cobrar(aluno.id, { competencia: '2031-04-01', vencimento: emDias(-10) });
      // 100,00 + 2% (2,00) + 1% ao mês por 10 dias (0,33)
      expect(m.valor_atualizado_centavos).toBe(10233);
    });

    it('a regra fica gravada na cobrança: mudar a config não mexe no que já existe', async () => {
      const [velha] = (await cobrancas(aluno.id)).filter((m) => m.competencia === '2031-04-01');
      await config({ multa_percentual: 0, juros_mes_percentual: 0 });
      const { data } = await gestor.from('vw_mensalidades').select('valor_atualizado_centavos').eq('id', velha.id).single();
      expect(data.valor_atualizado_centavos).toBe(10233);
    });

    it('a baixa grava o valor atualizado e lança ele no caixa', async () => {
      const [m] = (await cobrancas(aluno.id)).filter((x) => x.competencia === '2031-04-01');
      const { data: valor } = await gestor.rpc('registrar_pagamento', { p_mensalidade: m.id, p_metodo: 'pix' });
      expect(valor).toBe(10233);

      const { data: l } = await gestor.from('lancamentos').select('valor_centavos').eq('mensalidade_id', m.id).single();
      expect(l.valor_centavos).toBe(10233);
    });

    it('o gestor pode informar outro valor recebido', async () => {
      const [m] = (await cobrancas(aluno.id)).filter((x) => x.competencia === '2031-03-01');
      const { data: valor } = await gestor.rpc('registrar_pagamento', {
        p_mensalidade: m.id, p_metodo: 'dinheiro', p_valor: 9500,
      });
      expect(valor).toBe(9500);
    });

    it('avulsa não tem desconto de pontualidade', async () => {
      await config({ desconto_tipo: 'fixo', desconto_valor: 1500 });
      const m = await cobrar(aluno.id, {
        competencia: '2031-05-01', vencimento: emDias(5), tipo: 'avulsa', descricao: 'Uniforme',
      });
      expect(m.desconto_centavos).toBe(0);
      expect(m.valor_atualizado_centavos).toBe(10000);
      await config({ desconto_valor: 0 });
    });
  });

  describe('planos', () => {
    let aluno, trimestral;
    beforeAll(async () => {
      aluno = await novoAluno(gestor, { escolinhaId: esc.id, turmaId: turma.id, nome: 'Plano Trimestral', numero: 3 });
      const { data } = await gestor
        .from('planos')
        .insert({ escolinha_id: esc.id, nome: 'Trimestral', meses: 3, desconto_percentual: 10 })
        .select()
        .single();
      trimestral = data;
      await gestor.from('alunos_cobranca').insert({ aluno_id: aluno.id, plano_id: trimestral.id });
    });

    it('cobra três meses de uma vez, com o desconto do plano', async () => {
      await gestor.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: '2032-01-01' });
      const [m] = await cobrancas(aluno.id);
      expect(m.meses).toBe(3);
      expect(m.valor_centavos).toBe(Math.round(preco * 3 * 0.9));
      expect(m.descricao).toMatch(/Trimestral \(3 meses\)/);
    });

    it('os dois meses seguintes já estão cobertos', async () => {
      for (const c of ['2032-02-01', '2032-03-01']) {
        await gestor.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: c });
      }
      expect(await cobrancas(aluno.id)).toHaveLength(1);
    });

    it('o quarto mês abre o próximo ciclo', async () => {
      await gestor.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: '2032-04-01' });
      const lista = await cobrancas(aluno.id);
      expect(lista.map((m) => m.competencia)).toEqual(['2032-01-01', '2032-04-01']);
    });

    it('o plano de outra escolinha é recusado', async () => {
      const outra = await novaEscolinha(gestor, 'outra');
      const { data: p } = await gestor
        .from('planos').insert({ escolinha_id: outra.id, nome: 'Anual', meses: 12 }).select().single();
      const { error } = await gestor.from('alunos_cobranca').update({ plano_id: p.id }).eq('aluno_id', aluno.id);
      expect(error).toBeTruthy();
      await apagarEscolinha(gestor, outra.id);
    });
  });

  describe('valor combinado com o atleta', () => {
    let bolsista;
    beforeAll(async () => {
      bolsista = await novoAluno(gestor, { escolinhaId: esc.id, turmaId: turma.id, nome: 'Bolsista', numero: 4 });
      await gestor.from('alunos_cobranca').insert({ aluno_id: bolsista.id, mensalidade_centavos: 5000 });
    });

    it('a geração usa o valor combinado', async () => {
      await gestor.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: '2033-01-01' });
      const [m] = await cobrancas(bolsista.id);
      expect(m.valor_centavos).toBe(5000);
    });

    it('o professor vê o preço da turma, não o combinado', async () => {
      const { data } = await professor.from('vw_alunos').select('valor_centavos, mensalidade_propria_centavos').eq('id', bolsista.id).single();
      expect(data.valor_centavos).toBe(preco);
      expect(data.mensalidade_propria_centavos).toBeNull();
    });

    it.each(['config_cobranca', 'planos', 'alunos_cobranca'])('o professor não lê %s', async (t) => {
      const { data } = await professor.from(t).select('*').eq('escolinha_id', esc.id);
      expect(data).toEqual([]);
    });
  });

  describe('irmãos', () => {
    let mae, velho, novo;
    beforeAll(async () => {
      await config({ desconto_irmao_percentual: 20 });
      mae = await novoResponsavel(gestor, { escolinhaId: esc.id, nome: 'Mãe dos Irmãos', telefone: '(62) 91111-2222' });
      velho = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Irmão Velho', numero: 5,
        responsavel_id: mae.id, matriculado_em: '2025-01-10',
      });
      novo = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Irmão Novo', numero: 6,
        responsavel_id: mae.id, matriculado_em: '2025-06-10',
      });
      await gestor.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: '2034-01-01' });
    });

    it('o mais antigo paga cheio', async () => {
      const [m] = await cobrancas(velho.id);
      expect(m.valor_centavos).toBe(preco);
    });

    it('o segundo tem o desconto, e a cobrança diz por quê', async () => {
      const [m] = await cobrancas(novo.id);
      expect(m.valor_centavos).toBe(Math.round(preco * 0.8));
      expect(m.descricao).toMatch(/20% de irmão/);
    });
  });

  describe('taxa de matrícula', () => {
    it('sem taxa configurada, entrar não gera cobrança', async () => {
      const a = await novoAluno(gestor, { escolinhaId: esc.id, turmaId: turma.id, nome: 'Sem Taxa', numero: 7 });
      expect(await cobrancas(a.id)).toEqual([]);
    });

    it('com taxa, o atleta novo já nasce com ela', async () => {
      await config({ taxa_matricula_centavos: 8000 });
      const a = await novoAluno(gestor, { escolinhaId: esc.id, turmaId: turma.id, nome: 'Com Taxa', numero: 8 });
      const [m] = await cobrancas(a.id);
      expect(m.tipo).toBe('avulsa');
      expect(m.descricao).toBe('Taxa de matrícula');
      expect(m.valor_centavos).toBe(8000);
    });

    it('a taxa aparece no link de matrícula', async () => {
      const { data } = await clienteAnonimo().rpc('escolinha_publica', { p_codigo: esc.escolinha.codigo_matricula });
      expect(data.taxa_matricula_centavos).toBe(8000);
    });

    it('e no portal do responsável, com o valor atualizado', async () => {
      const resp = await novoResponsavel(gestor, { escolinhaId: esc.id, nome: 'Pai da Taxa', telefone: '(62) 93333-4444' });
      await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Filho da Taxa', numero: 9, responsavel_id: resp.id,
      });
      const { data: token } = await gestor.rpc('token_responsavel', { p_responsavel: resp.id });
      const { data } = await clienteAnonimo().rpc('portal_responsavel', { p_token: token });
      const taxa = data.filhos[0].mensalidades.find((m) => m.tipo === 'avulsa');
      expect(taxa.descricao).toBe('Taxa de matrícula');
      expect(taxa.valor_atualizado_centavos).toBe(8000);
    });
  });

  describe('documento da escolinha', () => {
    it('aceita CPF ou CNPJ só com dígitos, e recusa o resto', async () => {
      const ruim = await gestor.from('escolinhas').update({ documento: '11.222.333/0001-81' }).eq('id', esc.id);
      expect(ruim.error).toBeTruthy();
      const bom = await gestor
        .from('escolinhas').update({ documento: '11222333000181', razao_social: 'Craque Esportes Ltda' }).eq('id', esc.id);
      expect(bom.error).toBeNull();
    });

    it('o portal entrega o que o recibo e o Pix precisam', async () => {
      const resp = await novoResponsavel(gestor, { escolinhaId: esc.id, nome: 'Mãe do Recibo', telefone: '(62) 95555-6666' });
      const a = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Filho do Recibo', numero: 11, responsavel_id: resp.id,
      });
      const [taxa] = await cobrancas(a.id);
      await gestor.rpc('registrar_pagamento', { p_mensalidade: taxa.id, p_metodo: 'pix' });

      const { data: token } = await gestor.rpc('token_responsavel', { p_responsavel: resp.id });
      const { data } = await clienteAnonimo().rpc('portal_responsavel', { p_token: token });
      expect(data.escolinha.documento).toBe('11222333000181');
      expect(data.escolinha.razao_social).toBe('Craque Esportes Ltda');
      const paga = data.filhos[0].mensalidades.find((m) => m.id === taxa.id);
      expect(paga.metodo).toBe('pix');
      expect(paga.valor_pago_centavos).toBe(8000);
    });
  });
});
