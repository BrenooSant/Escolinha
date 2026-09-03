/* Dados de demonstração da escolinha. Nada aqui vai para um servidor. */

export const MENS = { 'Sub-9': 120, 'Sub-11': 130, 'Sub-13': 140, 'Sub-15': 150 };
export const CATEGORIAS = ['Sub-9', 'Sub-11', 'Sub-13', 'Sub-15'];
export const POSICOES = ['Goleiro', 'Zagueiro', 'Lateral', 'Volante', 'Meia', 'Ponta', 'Atacante'];
export const PARENTESCOS = ['Mãe', 'Pai', 'Avó / Avô', 'Tio / Tia', 'Responsável legal'];
export const MOTIVOS = [
  'Atestado médico',
  'Prova na escola',
  'Viagem em família',
  'Compromisso familiar',
  'Machucado',
];

export const ROTULO = { P: 'Presente', F: 'Falta', J: 'Justificada' };
export const CURTO = { P: 'Presente', F: 'Falta', J: 'Justif.' };
export const ICONE = { P: '✓', F: '✕', J: '!' };

export const ALUNOS = [
  { n: 'Arthur Nogueira', num: 10, cat: 'Sub-11', pos: 'Meia', resp: 'Marcela Nogueira', par: 'Mãe', tel: '(62) 99184-2210', st: 'atraso', dias: 12, freq: '11/12', nasc: '14/09/2014', h: 'PPPFPPPP', obs: 'Bombinha para asma na mochila.' },
  { n: 'Bernardo Lima', num: 9, cat: 'Sub-11', pos: 'Atacante', resp: 'Cláudio Lima', par: 'Pai', tel: '(62) 99623-8814', st: 'pago', dias: 0, freq: '12/12', nasc: '03/02/2015', h: 'PPPPPPPP', obs: '—' },
  { n: 'Nicolas Ferraz', num: 13, cat: 'Sub-11', pos: 'Volante', resp: 'Tatiana Ferraz', par: 'Mãe', tel: '(62) 99230-6654', st: 'pago', dias: 0, freq: '10/12', nasc: '22/07/2014', h: 'PPJPPFPP', obs: '—' },
  { n: 'Laura Mendes', num: 20, cat: 'Sub-11', pos: 'Lateral', resp: 'Kelly Mendes', par: 'Mãe', tel: '(62) 98456-7712', st: 'vence', dias: 0, freq: '12/12', nasc: '11/11/2014', h: 'PPPPPPPP', obs: '—' },
  { n: 'Manuela Reis', num: 11, cat: 'Sub-11', pos: 'Ponta', resp: 'Douglas Reis', par: 'Pai', tel: '(62) 99065-7788', st: 'pago', dias: 0, freq: '12/12', nasc: '05/05/2015', h: 'PPPPPPPP', obs: '—' },
  { n: 'Lívia Prado', num: 7, cat: 'Sub-13', pos: 'Ponta', resp: 'Renata Prado', par: 'Mãe', tel: '(62) 98110-4477', st: 'pago', dias: 0, freq: '10/12', nasc: '21/09/2013', h: 'PPFPPPJP', obs: '—' },
  { n: 'Heitor Camargo', num: 8, cat: 'Sub-13', pos: 'Volante', resp: 'Aline Camargo', par: 'Mãe', tel: '(62) 98274-6612', st: 'atraso', dias: 21, freq: '7/12', nasc: '30/01/2013', h: 'FFPPFPPF', obs: 'Sai mais cedo às quartas.' },
  { n: 'Isabela Moura', num: 2, cat: 'Sub-13', pos: 'Lateral', resp: 'Simone Moura', par: 'Mãe', tel: '(62) 99727-3390', st: 'vence', dias: 0, freq: '12/12', nasc: '17/06/2013', h: 'PPPPPPPP', obs: '—' },
  { n: 'Rafael Duarte', num: 16, cat: 'Sub-13', pos: 'Goleiro', resp: 'Vanessa Duarte', par: 'Mãe', tel: '(62) 99441-9083', st: 'atraso', dias: 9, freq: '10/12', nasc: '08/12/2012', h: 'PPPJPPPF', obs: 'Usa luva própria.' },
  { n: 'Gustavo Rocha', num: 15, cat: 'Sub-13', pos: 'Zagueiro', resp: 'Eliane Rocha', par: 'Avó / Avô', tel: '(62) 98891-3374', st: 'pago', dias: 0, freq: '11/12', nasc: '25/04/2013', h: 'PPPPFPPP', obs: '—' },
  { n: 'Enzo Batista', num: 4, cat: 'Sub-9', pos: 'Zagueiro', resp: 'Patrícia Batista', par: 'Mãe', tel: '(62) 99442-0193', st: 'atraso', dias: 7, freq: '9/12', nasc: '29/09/2016', h: 'PFPPJPPP', obs: 'Alergia a amendoim.' },
  { n: 'Théo Andrade', num: 6, cat: 'Sub-9', pos: 'Meia', resp: 'Fabiano Andrade', par: 'Pai', tel: '(62) 98899-1204', st: 'pago', dias: 0, freq: '8/12', nasc: '02/03/2017', h: 'PFFPPJPP', obs: '—' },
  { n: 'Pedro Vasques', num: 14, cat: 'Sub-9', pos: 'Atacante', resp: 'Camila Vasques', par: 'Mãe', tel: '(62) 98003-2266', st: 'pago', dias: 0, freq: '12/12', nasc: '19/08/2016', h: 'PPPPPPPP', obs: '—' },
  { n: 'Alice Barreto', num: 17, cat: 'Sub-9', pos: 'Ponta', resp: 'Marcos Barreto', par: 'Pai', tel: '(62) 99118-5540', st: 'pago', dias: 0, freq: '11/12', nasc: '07/01/2017', h: 'PPPPPFPP', obs: '—' },
  { n: 'Samuel Queiroz', num: 18, cat: 'Sub-9', pos: 'Goleiro', resp: 'Débora Queiroz', par: 'Mãe', tel: '(62) 98720-9931', st: 'vence', dias: 0, freq: '10/12', nasc: '13/10/2016', h: 'PPJPPPFP', obs: '—' },
  { n: 'Miguel Tavares', num: 1, cat: 'Sub-15', pos: 'Goleiro', resp: 'Sandro Tavares', par: 'Pai', tel: '(62) 99871-3025', st: 'vence', dias: 0, freq: '12/12', nasc: '26/02/2011', h: 'PPPPPPPP', obs: '—' },
  { n: 'Davi Fontes', num: 5, cat: 'Sub-15', pos: 'Zagueiro', resp: 'Juliana Fontes', par: 'Mãe', tel: '(62) 99310-5521', st: 'atraso', dias: 4, freq: '11/12', nasc: '09/07/2011', h: 'PPPPPPJP', obs: '—' },
  { n: 'Lucas Pereira', num: 3, cat: 'Sub-15', pos: 'Lateral', resp: 'Rogério Pereira', par: 'Pai', tel: '(62) 99558-1147', st: 'atraso', dias: 33, freq: '5/12', nasc: '31/03/2011', h: 'FFPFFPFP', obs: 'Conversar com o pai sobre as faltas.' },
  { n: 'Yuri Nascimento', num: 12, cat: 'Sub-15', pos: 'Meia', resp: 'Marcos Nascimento', par: 'Pai', tel: '(62) 99612-4470', st: 'pago', dias: 0, freq: '11/12', nasc: '15/05/2011', h: 'PPPPFPPP', obs: '—' },
  { n: 'Vitor Hugo Salles', num: 19, cat: 'Sub-15', pos: 'Atacante', resp: 'Paulo Salles', par: 'Pai', tel: '(62) 98330-2218', st: 'pago', dias: 0, freq: '12/12', nasc: '04/12/2010', h: 'PPPPPPPP', obs: '—' },
];

export const STATUS = {
  pago: ['ok', 'Em dia'],
  vence: ['warn', 'Vence em 05/10'],
  atraso: ['bad', 'Atrasada'],
};

export const SEMANA = [
  ['Sub-9', 'Segunda 17h', 4, 1],
  ['Sub-11', 'Terça 18h', 5, 0],
  ['Sub-13', 'Quarta 18h', 3, 2],
  ['Sub-15', 'Quinta 19h', 4, 1],
];

export const ANIVERSARIANTES = [
  { num: 10, n: 'Arthur Nogueira', quando: 'Sub-11 · 12 anos em 14/09' },
  { num: 7, n: 'Lívia Prado', quando: 'Sub-13 · 13 anos em 21/09' },
  { num: 4, n: 'Enzo Batista', quando: 'Sub-9 · 10 anos em 29/09' },
];

export const AGENDA = [
  { dia: 'Segunda', data: '31/08', itens: [
    { turma: 'Sub-9', info: '17h00 · Campo do Bosque · Prof. Ricardo' },
    { turma: 'Sub-11', info: '18h00 · Campo do Bosque · Prof. Ricardo' },
  ] },
  { dia: 'Terça', data: '01/09', itens: [
    { turma: 'Sub-11', info: '18h00 · Campo do Bosque · Prof. Ricardo' },
    { turma: 'Sub-13', info: '18h00 · Campo do Bosque · Prof. Ricardo' },
  ] },
  { dia: 'Quarta', data: '02/09', hoje: true, itens: [
    { turma: 'Sub-13', info: '18h00 · Campo do Bosque · Prof. Ricardo' },
    { turma: 'Sub-15', info: '19h00 · Society Vila Nova · Prof. Ana' },
  ] },
  { dia: 'Quinta', data: '03/09', itens: [
    { turma: 'Sub-15', info: '19h00 · Society Vila Nova · Prof. Ana' },
  ] },
  { dia: 'Sexta', data: '04/09', itens: [
    { turma: 'Sub-9', info: '17h00 · Campo do Bosque · Prof. Ana' },
  ] },
  { dia: 'Sábado', data: '05/09', itens: [
    { turma: 'Amistoso Sub-13', info: '09h00 · vs. Escolinha Bandeirante', jogo: true },
  ] },
];

export const TURMAS = [
  { cat: 'Sub-9', dias: 'Segunda e sexta, 17h', prof: 'Prof. Ricardo / Ana', capacidade: 8 },
  { cat: 'Sub-11', dias: 'Segunda e terça, 18h', prof: 'Prof. Ricardo', capacidade: 8 },
  { cat: 'Sub-13', dias: 'Terça e quarta, 18h', prof: 'Prof. Ricardo', capacidade: 8 },
  { cat: 'Sub-15', dias: 'Quarta e quinta, 19h', prof: 'Prof. Ana', capacidade: 8 },
];

export const HISTORICO = {
  'Sub-9': [['29/08', 4, 5], ['26/08', 5, 5], ['22/08', 4, 5], ['19/08', 3, 5], ['15/08', 5, 5]],
  'Sub-11': [['29/08', 5, 5], ['26/08', 4, 5], ['22/08', 5, 5], ['19/08', 4, 5], ['15/08', 5, 5]],
  'Sub-13': [['28/08', 4, 5], ['26/08', 3, 5], ['21/08', 5, 5], ['19/08', 4, 5], ['14/08', 4, 5]],
  'Sub-15': [['28/08', 4, 5], ['27/08', 5, 5], ['21/08', 3, 5], ['20/08', 5, 5], ['14/08', 4, 5]],
};

export const MESES = [
  ['Abr', 2.1, 1.42], ['Mai', 2.28, 1.51], ['Jun', 2.34, 1.38],
  ['Jul', 1.95, 1.6], ['Ago', 2.4, 1.44], ['Set', 1.97, 1.45],
];
export const TETO_GRAFICO = 4.0;

export const LANCAMENTOS = [
  ['Mensalidades Sub-11', '02/09', '+ R$ 390', true],
  ['Aluguel do campo', '01/09', '− R$ 900', false],
  ['Kit uniforme (8 un.)', '30/08', '+ R$ 640', true],
  ['Bolas e coletes', '28/08', '− R$ 320', false],
  ['Mensalidades Sub-15', '26/08', '+ R$ 300', true],
  ['Arbitragem amistoso', '24/08', '− R$ 230', false],
];

export const UNIFORMES = 640;
export const SAIDAS = 1450;

/* ---------- helpers ---------- */
export const pct = (a) => {
  const [feitos, total] = a.freq.split('/');
  return Math.round((Number(feitos) / Number(total)) * 100);
};

export const brl = (v) => 'R$ ' + v.toLocaleString('pt-BR');

export const corFreq = (f) => (f >= 85 ? 'text-ok' : f >= 70 ? 'text-warn' : 'text-bad');
export const tomFreq = (f) => (f >= 85 ? 'ok' : f >= 70 ? 'warn' : 'bad');

export const primeiroNome = (nome) => nome.split(' ')[0];
