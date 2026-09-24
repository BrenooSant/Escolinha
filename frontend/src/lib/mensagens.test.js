import { describe, expect, it } from 'vitest';
import { textoFinal } from './mensagens.js';

const ORIGEM = 'https://craque.netlify.app/';

describe('textoFinal', () => {
  it('troca {{link}} pelo portal do responsável', () => {
    const t = textoFinal({ texto: 'Pague aqui: {{link}}', responsavel_token: 'abc123' }, ORIGEM);
    expect(t).toBe('Pague aqui: https://craque.netlify.app/#/portal/abc123');
  });

  it('troca todas as ocorrências', () => {
    const t = textoFinal({ texto: '{{link}} e {{link}}', responsavel_token: 'x' }, ORIGEM);
    expect(t).not.toContain('{{link}}');
  });

  it('sem responsável, a linha do link some inteira', () => {
    const t = textoFinal(
      { texto: 'Olá!\n\nVeja e pague por aqui: {{link}}\n\nObrigado!', responsavel_token: null },
      ORIGEM
    );
    expect(t).toBe('Olá!\n\nObrigado!');
    expect(t).not.toContain('pague por aqui');
  });

  it('texto sem marcador passa intacto', () => {
    expect(textoFinal({ texto: 'Parabéns, Igor!' }, ORIGEM)).toBe('Parabéns, Igor!');
  });

  it('mensagem vazia não quebra', () => {
    expect(textoFinal(null, ORIGEM)).toBe('');
  });
});
