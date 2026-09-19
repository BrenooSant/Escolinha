/* Contas a pagar e a receber. O que importa: conta pendente não mexe no
   caixa até ser paga, a recorrente se renova sozinha, e o painel avisa
   do que venceu. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apagarEscolinha, configurado, emDias, entrar, hoje, idDoUsuario, novaEscolinha } from './ajuda.js';

describe.skipIf(!configurado)('contas a pagar e a receber', () => {
  let gestor, professor, idProfessor, esc, aluguel;

  const conta = async (dados) => {
    const { data, error } = await gestor
      .from('lancamentos')
      .insert({ escolinha_id: esc.id, tipo: 'saida', categoria: 'Estrutura', pago: false, ...dados })
      .select()
      .single();
    if (error) throw new Error('conta: ' + error.message);
    return data;
  };
  const painel = async () => (await gestor.rpc('painel_resumo', { p_escolinha: esc.id })).data;

  beforeAll(async () => {
    gestor = await entrar('dono');
    professor = await entrar('colega');
    idProfessor = await idDoUsuario(professor);
    esc = await novaEscolinha(gestor, 'contas');
    await gestor.from('membros').insert({ escolinha_id: esc.id, perfil_id: idProfessor, papel: 'professor' });
  });

  afterAll(async () => {
    await gestor.from('membros').delete().eq('escolinha_id', esc?.id).eq('perfil_id', idProfessor);
    await apagarEscolinha(gestor, esc?.id);
  });

  it('conta pendente precisa de vencimento', async () => {
    const { error } = await gestor
      .from('lancamentos')
      .insert({ escolinha_id: esc.id, tipo: 'saida', descricao: 'Sem data', valor_centavos: 100, pago: false });
    expect(error).toBeTruthy();
  });

  it('pendente não entra no caixa, mas aparece no aviso do painel', async () => {
    aluguel = await conta({
      descricao: 'Aluguel do campo', valor_centavos: 90000, vencimento: emDias(-2), data: emDias(-2), recorrente: true,
    });
    await conta({ descricao: 'Arbitragem', valor_centavos: 15000, vencimento: emDias(3), data: emDias(3) });

    const r = await painel();
    expect(r.saidas_mes).toBe(0);
    expect(r.contas_vencidas).toBe(1);
    expect(r.contas_semana).toBe(1);
  });

  it('pagar põe no caixa com a data e o valor do pagamento', async () => {
    const { error } = await gestor.rpc('pagar_conta', { p_lancamento: aluguel.id, p_valor: 95000 });
    expect(error).toBeNull();

    const { data } = await gestor.from('lancamentos').select('*').eq('id', aluguel.id).single();
    expect(data.pago).toBe(true);
    expect(data.data).toBe(hoje());
    expect(data.valor_centavos).toBe(95000);
  });

  it('a recorrente já deixa a do mês seguinte pendente, com o valor combinado', async () => {
    const { data } = await gestor
      .from('lancamentos').select('*').eq('escolinha_id', esc.id).eq('descricao', 'Aluguel do campo').eq('pago', false);
    expect(data).toHaveLength(1);
    expect(data[0].valor_centavos).toBe(90000);
    expect(data[0].recorrente).toBe(true);

    const esperado = new Date(aluguel.vencimento + 'T12:00:00');
    esperado.setMonth(esperado.getMonth() + 1);
    expect(data[0].vencimento).toBe(esperado.toISOString().slice(0, 10));
  });

  it('não paga duas vezes', async () => {
    const { error } = await gestor.rpc('pagar_conta', { p_lancamento: aluguel.id });
    expect(error?.message ?? '').toMatch(/já foi paga/i);
  });

  it('o professor não vê nem paga conta', async () => {
    const { data } = await professor.from('lancamentos').select('id').eq('escolinha_id', esc.id);
    expect(data).toEqual([]);

    const { data: pendente } = await gestor
      .from('lancamentos').select('id').eq('escolinha_id', esc.id).eq('descricao', 'Arbitragem').single();
    const { error } = await professor.rpc('pagar_conta', { p_lancamento: pendente.id });
    expect(error).toBeTruthy();
  });
});
