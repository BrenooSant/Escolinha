import { describe, expect, it } from 'vitest';
import { conversao, emAberto, etapa, origem, paraRetornar } from './leads.js';

describe('funil de leads', () => {
  it('conversão conta só a janela, com os abertos no total', () => {
    const hoje = new Date('2026-09-20T12:00:00Z');
    const leads = [
      { etapa: 'matriculado', criado_em: '2026-09-01T00:00:00Z' },
      { etapa: 'perdido', criado_em: '2026-08-15T00:00:00Z' },
      { etapa: 'novo', criado_em: '2026-09-10T00:00:00Z' },
      { etapa: 'matriculado', criado_em: '2026-01-01T00:00:00Z' }, // fora dos 90 dias
    ];
    expect(conversao(leads, 90, hoje)).toEqual({ total: 3, matriculados: 1, pct: 33 });
    expect(conversao([], 90, hoje).pct).toBeNull();
  });

  it('retornar: data vencida ou de hoje, só em aberto', () => {
    expect(paraRetornar({ etapa: 'contato', proximo_contato: '2026-09-19' }, '2026-09-20')).toBe(true);
    expect(paraRetornar({ etapa: 'contato', proximo_contato: '2026-09-20' }, '2026-09-20')).toBe(true);
    expect(paraRetornar({ etapa: 'contato', proximo_contato: '2026-09-21' }, '2026-09-20')).toBe(false);
    expect(paraRetornar({ etapa: 'perdido', proximo_contato: '2026-09-01' }, '2026-09-20')).toBe(false);
  });

  it('rótulos', () => {
    expect(etapa('experimental').rotulo).toBe('Aula experimental');
    expect(origem('passou_na_frente')).toBe('Passou na frente');
    expect(emAberto({ etapa: 'ficha' })).toBe(true);
    expect(emAberto({ etapa: 'matriculado' })).toBe(false);
  });
});
