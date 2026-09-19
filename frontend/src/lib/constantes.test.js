import { describe, expect, it } from 'vitest';
import { situacaoMensalidade, tituloCobranca, valorCobranca } from './constantes.js';

describe('situação da mensalidade', () => {
  it('paga é "em dia"', () => {
    expect(situacaoMensalidade({ mensalidade_status: 'paga' }))
      .toMatchObject({ tom: 'ok', rotulo: 'Em dia' });
  });

  it('em aberto e no prazo mostra a data de vencimento', () => {
    expect(situacaoMensalidade({
      mensalidade_status: 'aberta',
      mensalidade_vencimento: '2026-10-05',
      dias_atraso: 0,
    })).toMatchObject({ tom: 'warn', rotulo: 'Vence 05/10' });
  });

  it('vencida é atraso, e carrega quantos dias', () => {
    expect(situacaoMensalidade({
      mensalidade_status: 'aberta',
      mensalidade_vencimento: '2026-09-05',
      dias_atraso: 12,
    })).toMatchObject({ tom: 'bad', rotulo: 'Atrasada', dias: 12 });
  });

  it('atleta sem mensalidade não vira alerta', () => {
    expect(situacaoMensalidade({}))
      .toMatchObject({ tom: 'neutro', rotulo: 'Sem mensalidade' });
  });

  it('isento e cancelada ficam neutros', () => {
    expect(situacaoMensalidade({ mensalidade_status: 'isenta' }).tom).toBe('neutro');
    expect(situacaoMensalidade({ mensalidade_status: 'cancelada' }).tom).toBe('neutro');
  });
});

describe('cobrança', () => {
  const moeda = (v) => v?.replace(/\u00a0/g, ' ');

  it('a avulsa aparece pelo que é, e o plano diz quantos meses cobre', () => {
    expect(tituloCobranca({ tipo: 'avulsa', descricao: 'Uniforme' })).toBe('Uniforme');
    expect(tituloCobranca({ tipo: 'mensalidade', competencia: '2026-09-01', meses: 3 })).toBe('setembro de 2026 · 3 meses');
    expect(tituloCobranca({ tipo: 'mensalidade', competencia: '2026-09-01', meses: 1 })).toBe('setembro de 2026');
  });

  it('em dia com desconto: mostra o valor menor e até quando vale', () => {
    const v = valorCobranca({
      status: 'aberta', valor_centavos: 15000, valor_atualizado_centavos: 13500, desconto_ate: '2026-09-05',
    });
    expect(v.valor).toBe(13500);
    expect(v.nota).toBe('com desconto até 05/09/2026');
  });

  it('atrasada: mostra o valor com multa e juros e o valor original', () => {
    const v = valorCobranca({ status: 'aberta', valor_centavos: 15000, valor_atualizado_centavos: 15350 });
    expect(v.valor).toBe(15350);
    expect(moeda(v.nota)).toBe('R$ 150,00 + multa e juros');
  });

  it('paga: vale o que entrou, com o valor cobrado quando diferente', () => {
    expect(valorCobranca({ status: 'paga', valor_centavos: 15000, valor_pago_centavos: 15000 }).nota).toBeNull();
    const v = valorCobranca({ status: 'paga', valor_centavos: 15000, valor_pago_centavos: 13500 });
    expect(v.valor).toBe(13500);
    expect(moeda(v.nota)).toBe('cobrado R$ 150,00');
  });

  it('sem regra nenhuma, não inventa nota', () => {
    expect(valorCobranca({ status: 'aberta', valor_centavos: 15000, valor_atualizado_centavos: 15000 }).nota).toBeNull();
  });
});
