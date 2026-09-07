import { describe, expect, it } from 'vitest';
import { situacaoMensalidade } from './constantes.js';

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
