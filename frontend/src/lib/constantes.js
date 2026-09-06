/* Listas fixas de interface. O que varia por escolinha (turmas,
   valores, horários) mora no banco, não aqui. */

export const POSICOES = ['Goleiro', 'Zagueiro', 'Lateral', 'Volante', 'Meia', 'Ponta', 'Atacante'];

export const PARENTESCOS = ['Mãe', 'Pai', 'Avó / Avô', 'Tio / Tia', 'Responsável legal'];

export const MOTIVOS = [
  'Atestado médico',
  'Prova na escola',
  'Viagem em família',
  'Compromisso familiar',
  'Machucado',
];

export const ROTULO_MARCA = { P: 'Presente', F: 'Falta', J: 'Justificada' };
export const MARCA_CURTA = { P: 'Presente', F: 'Falta', J: 'Justif.' };
export const ICONE_MARCA = { P: '✓', F: '✕', J: '!' };

/* Como cada situação de mensalidade aparece na interface. */
export function situacaoMensalidade({ mensalidade_status, mensalidade_vencimento, dias_atraso }) {
  if (!mensalidade_status) return { tom: 'neutro', rotulo: 'Sem mensalidade' };
  if (mensalidade_status === 'paga') return { tom: 'ok', rotulo: 'Em dia' };
  if (mensalidade_status === 'isenta') return { tom: 'neutro', rotulo: 'Isento' };
  if (mensalidade_status === 'cancelada') return { tom: 'neutro', rotulo: 'Cancelada' };
  if (dias_atraso > 0) return { tom: 'bad', rotulo: 'Atrasada', dias: dias_atraso };
  const [, m, d] = String(mensalidade_vencimento || '').split('-');
  return { tom: 'warn', rotulo: d ? `Vence ${d}/${m}` : 'Em aberto' };
}
