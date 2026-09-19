/* As funções puras que toda tela usa. Rodam sem rede e sem banco —
   é o teste que dá para pendurar num hook de commit. */
import { describe, expect, it } from 'vitest';
import {
  brl, brlCurto, corFreq, dataBR, dataCurta, deCentavos, dePercentual, diaDaSemana, hora, idade,
  iniciais, linkWhatsApp, mascaraTelefone, mesExtenso, paraCentavos, paraData, paraPercentual,
  primeiroNome, tomFreq,
} from './format.js';

/* Intl.NumberFormat separa "R$" do valor com espaço não separável
   (U+00A0). Normalizar deixa a expectativa legível no código. */
const moeda = (v) => v.replace(/\u00a0/g, ' ');

describe('dinheiro', () => {
  it('formata centavos como real', () => {
    expect(moeda(brl(13000))).toBe('R$ 130,00');
    expect(moeda(brl(5))).toBe('R$ 0,05');
    expect(moeda(brl(0))).toBe('R$ 0,00');
  });

  it('trata ausência de valor como zero, em vez de NaN', () => {
    expect(moeda(brl(null))).toBe('R$ 0,00');
    expect(moeda(brl(undefined))).toBe('R$ 0,00');
  });

  it('a versão curta arredonda e some com os centavos', () => {
    expect(moeda(brlCurto(234000))).toBe('R$ 2.340');
    expect(moeda(brlCurto(13050))).toBe('R$ 131');
  });

  it('lê o que o professor digita, com ou sem separador', () => {
    expect(paraCentavos('130,00')).toBe(13000);
    expect(paraCentavos('1.250,50')).toBe(125050);
    expect(paraCentavos('R$ 130')).toBe(13000);
    expect(paraCentavos('130.5')).toBe(13050);
  });

  it('devolve zero para texto que não é número', () => {
    expect(paraCentavos('')).toBe(0);
    expect(paraCentavos('abc')).toBe(0);
    expect(paraCentavos(null)).toBe(0);
  });

  it('ida e volta preserva o valor', () => {
    for (const centavos of [0, 5, 990, 13000, 125050]) {
      expect(paraCentavos(deCentavos(centavos))).toBe(centavos);
    }
  });
});

describe('datas', () => {
  it('não escorrega um dia por causa do fuso', () => {
    // new Date('2026-09-05') é meia-noite em UTC e viraria dia 4 aqui
    const d = paraData('2026-09-05');
    expect(d.getDate()).toBe(5);
    expect(d.getMonth()).toBe(8);
    expect(dataBR('2026-09-05')).toBe('05/09/2026');
    expect(dataCurta('2026-09-05')).toBe('05/09');
  });

  it('aceita timestamp completo, não só data', () => {
    expect(dataBR('2026-09-05T23:30:00.000Z')).toBe('05/09/2026');
  });

  it('mostra travessão quando não há data', () => {
    expect(dataBR(null)).toBe('—');
    expect(dataCurta(undefined)).toBe('—');
  });

  it('nomeia o mês e o dia da semana em português', () => {
    expect(mesExtenso('2026-09-01')).toBe('setembro de 2026');
    expect(mesExtenso('2026-03-01')).toBe('março de 2026');
    expect(diaDaSemana('2026-09-05')).toBe('Sábado');
  });

  it('encurta o horário do banco', () => {
    expect(hora('18:00:00')).toBe('18h00');
    expect(hora('09:30:00')).toBe('09h30');
    expect(hora(null)).toBe('');
  });
});

describe('idade', () => {
  it('só conta o ano depois do aniversário', () => {
    const hoje = new Date();
    const p = (n) => String(n).padStart(2, '0');

    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    const jaFez = `${hoje.getFullYear() - 10}-${p(ontem.getMonth() + 1)}-${p(ontem.getDate())}`;
    expect(idade(jaFez)).toBe(10);

    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 2);
    const vaiFazer = `${hoje.getFullYear() - 10}-${p(amanha.getMonth() + 1)}-${p(amanha.getDate())}`;
    expect(idade(vaiFazer)).toBe(9);
  });

  it('devolve nulo sem data de nascimento', () => {
    expect(idade(null)).toBeNull();
  });
});

describe('nomes', () => {
  it('pega o primeiro nome', () => {
    expect(primeiroNome('Vitor Hugo Salles')).toBe('Vitor');
    expect(primeiroNome('  Ana  ')).toBe('Ana');
    expect(primeiroNome('')).toBe('');
    expect(primeiroNome(null)).toBe('');
  });

  it('monta as iniciais com o primeiro e o último nome', () => {
    expect(iniciais('Ricardo Menezes')).toBe('RM');
    expect(iniciais('Vitor Hugo Salles')).toBe('VS');
    expect(iniciais('Ana')).toBe('A');
    expect(iniciais('')).toBe('?');
  });
});

describe('telefone', () => {
  it('aplica a máscara conforme se digita', () => {
    expect(mascaraTelefone('62')).toBe('62');
    expect(mascaraTelefone('6299')).toBe('(62) 99');
    expect(mascaraTelefone('6299184')).toBe('(62) 9918-4');
    expect(mascaraTelefone('62991842210')).toBe('(62) 99184-2210');
  });

  it('ignora o que não é dígito e não passa de 11', () => {
    expect(mascaraTelefone('(62) 99184-2210')).toBe('(62) 99184-2210');
    expect(mascaraTelefone('629918422109999')).toBe('(62) 99184-2210');
  });

  it('monta o link do WhatsApp com o 55 na frente', () => {
    expect(linkWhatsApp('(62) 99184-2210')).toBe('https://wa.me/5562991842210');
    expect(linkWhatsApp('5562991842210')).toBe('https://wa.me/5562991842210');
  });

  it('escapa a mensagem no link', () => {
    const url = linkWhatsApp('62991842210', 'Olá, tudo bem?');
    expect(url).toContain('?text=Ol%C3%A1%2C%20tudo%20bem%3F');
  });
});

describe('cor da frequência', () => {
  it('vira alerta abaixo de 70%', () => {
    expect(tomFreq(90)).toBe('ok');
    expect(tomFreq(85)).toBe('ok');
    expect(tomFreq(84)).toBe('warn');
    expect(tomFreq(70)).toBe('warn');
    expect(tomFreq(69)).toBe('bad');
  });

  it('fica neutra quando ainda não há treino', () => {
    expect(tomFreq(null)).toBe('neutro');
    expect(corFreq(null)).toBe('text-ink3');
  });
});

describe('percentual', () => {
  it('aceita vírgula, ponto e o sinal de %', () => {
    expect(paraPercentual('2,5')).toBe(2.5);
    expect(paraPercentual('1.25')).toBe(1.25);
    expect(paraPercentual('10%')).toBe(10);
  });

  it('vazio, texto ou negativo viram zero (regra desligada)', () => {
    expect(paraPercentual('')).toBe(0);
    expect(paraPercentual('abc')).toBe(0);
    expect(paraPercentual('-3')).toBe(0);
  });

  it('volta para o campo com vírgula, e zero vira campo vazio', () => {
    expect(dePercentual(2.5)).toBe('2,5');
    expect(dePercentual('10.00')).toBe('10');
    expect(dePercentual(0)).toBe('');
  });
});
