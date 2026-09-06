/* Formatação e conversões. Dinheiro trafega sempre em centavos;
   datas trafegam sempre como 'AAAA-MM-DD' (o `date` do Postgres). */

export const brl = (centavos) =>
  ((centavos ?? 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  });

/* Versão curta para os cartões do painel: R$ 2.340 em vez de R$ 2.340,00 */
export const brlCurto = (centavos) =>
  'R$ ' + Math.round((centavos ?? 0) / 100).toLocaleString('pt-BR');

export const paraCentavos = (texto) => {
  const limpo = String(texto ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export const deCentavos = (centavos) => ((centavos ?? 0) / 100).toFixed(2).replace('.', ',');

/* new Date('2026-09-05') é meia-noite em UTC e vira dia 4 no Brasil.
   Por isso as datas do banco são quebradas na mão. */
export function paraData(iso) {
  if (!iso) return null;
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}

export const hojeISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const paraISO = (data) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
};

export const dataCurta = (iso) => {
  const d = paraData(iso);
  if (!d) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
};

export const dataBR = (iso) => {
  const d = paraData(iso);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR');
};

const MESES_EXT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const mesExtenso = (iso) => {
  const d = paraData(iso);
  return d ? `${MESES_EXT[d.getMonth()]} de ${d.getFullYear()}` : '—';
};

export const mesCurto = (iso) => {
  const d = paraData(iso);
  return d ? MESES_EXT[d.getMonth()].slice(0, 3) : '—';
};

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const diaDaSemana = (iso) => {
  const d = paraData(iso);
  return d ? DIAS_SEMANA[d.getDay()] : '—';
};

/* 18:00:00 → 18h00 */
export const hora = (h) => (h ? h.slice(0, 5).replace(':', 'h') : '');

export const idade = (nascimento) => {
  const d = paraData(nascimento);
  if (!d) return null;
  const hoje = new Date();
  let anos = hoje.getFullYear() - d.getFullYear();
  const passouAniversario =
    hoje.getMonth() > d.getMonth() ||
    (hoje.getMonth() === d.getMonth() && hoje.getDate() >= d.getDate());
  if (!passouAniversario) anos -= 1;
  return anos;
};

export const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';

export const iniciais = (nome) => {
  const partes = String(nome || '').trim().split(/\s+/);
  return ((partes[0]?.[0] || '') + (partes.length > 1 ? partes.at(-1)[0] : '')).toUpperCase() || '?';
};

/* (62) 99184-2210 conforme o responsável digita */
export function mascaraTelefone(valor) {
  const d = String(valor || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/* wa.me exige só dígitos, com o 55 na frente */
export const linkWhatsApp = (telefone, mensagem) => {
  const d = String(telefone || '').replace(/\D/g, '');
  const numero = d.startsWith('55') ? d : `55${d}`;
  return `https://wa.me/${numero}${mensagem ? `?text=${encodeURIComponent(mensagem)}` : ''}`;
};

export const corFreq = (f) =>
  f == null ? 'text-ink3' : f >= 85 ? 'text-ok' : f >= 70 ? 'text-warn' : 'text-bad';

export const tomFreq = (f) => (f == null ? 'neutro' : f >= 85 ? 'ok' : f >= 70 ? 'warn' : 'bad');
