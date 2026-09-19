/* Funil de leads: as etapas na ordem em que acontecem, e de onde a
   pessoa veio. Os ids são os do banco (leads.etapa, leads.origem). */
export const ETAPAS = [
  { id: 'novo', rotulo: 'Novo', tom: 'neutro' },
  { id: 'contato', rotulo: 'Em contato', tom: 'neutro' },
  { id: 'experimental', rotulo: 'Aula experimental', tom: 'warn' },
  { id: 'ficha', rotulo: 'Ficha enviada', tom: 'warn' },
  { id: 'matriculado', rotulo: 'Matriculado', tom: 'ok' },
  { id: 'perdido', rotulo: 'Perdido', tom: 'bad' },
];

export const etapa = (id) => ETAPAS.find((e) => e.id === id) ?? ETAPAS[0];
export const emAberto = (l) => l.etapa !== 'matriculado' && l.etapa !== 'perdido';

export const ORIGENS = [
  ['instagram', 'Instagram'],
  ['whatsapp', 'WhatsApp'],
  ['indicacao', 'Indicação'],
  ['formulario', 'Formulário de aula'],
  ['link_matricula', 'Link de matrícula'],
  ['evento', 'Evento / peneira'],
  ['passou_na_frente', 'Passou na frente'],
  ['outro', 'Outro'],
];
export const origem = (id) => ORIGENS.find(([o]) => o === id)?.[1] ?? 'Outro';

export const MOTIVOS_PERDA = [
  'Achou caro',
  'Horário não serve',
  'Longe de casa',
  'Foi para outra escolinha',
  'Criança desistiu',
  'Não respondeu mais',
];

/* Conversão: dos leads que chegaram na janela, quantos viraram aluno.
   Os ainda em aberto contam no total — é o retrato honesto do funil. */
export function conversao(leads, dias = 90, hoje = new Date()) {
  const desde = new Date(hoje.getTime() - dias * 864e5);
  const janela = leads.filter((l) => new Date(l.criado_em) >= desde);
  const matriculados = janela.filter((l) => l.etapa === 'matriculado').length;
  return {
    total: janela.length,
    matriculados,
    pct: janela.length ? Math.round((matriculados / janela.length) * 100) : null,
  };
}

/* Retornar: data vencida ou de hoje, só para quem está em aberto. */
export const paraRetornar = (l, hojeISO) =>
  emAberto(l) && l.proximo_contato && l.proximo_contato <= hojeISO;
