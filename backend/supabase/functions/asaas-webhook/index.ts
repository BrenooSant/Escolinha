/* Webhook do Asaas: é aqui que a baixa acontece sozinha.

   O Asaas reenvia o mesmo evento até receber uma resposta 2xx, então o
   evento é gravado por id antes de qualquer coisa — repetido não dá
   baixa duas vezes.

   O endereço é o mesmo para todas as escolinhas; quem diz de qual
   escolinha é o token no cabeçalho `asaas-access-token`, que foi
   sorteado na conexão. */
import { emCentavos, erro, json, servidor } from '../_compartilhado/asaas.ts';

const RECEBEU = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'];
const DESFEZ = [
  'PAYMENT_REFUNDED',
  'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_REVERSED',
  'PAYMENT_DELETED',
];

Deno.serve(async (req) => {
  if (req.method !== 'POST') return erro('Método não suportado.', 405);

  const token = req.headers.get('asaas-access-token');
  if (!token) return erro('Sem token.', 401);

  const sb = servidor();
  const { data: conta } = await sb
    .from('asaas_conta').select('escolinha_id').eq('webhook_token', token).maybeSingle();
  if (!conta) return erro('Token não confere.', 401);

  const evento = await req.json().catch(() => null);
  if (!evento?.event) return erro('Evento inválido.', 400);

  const pagamento = evento.payment ?? {};
  const idEvento = evento.id ?? `${evento.event}:${pagamento.id}:${pagamento.status}`;

  const { error: erroEvento } = await sb.from('asaas_eventos').insert({
    escolinha_id: conta.escolinha_id,
    evento_id: idEvento,
    tipo: evento.event,
    payload: evento,
  });
  // já recebido antes: responde ok e não processa de novo
  if (erroEvento?.code === '23505') return json({ ok: true, repetido: true });
  if (erroEvento) return erro('Não deu para registrar o evento.', 500);

  let resultado: unknown = null;
  let falha: string | null = null;

  try {
    if (RECEBEU.includes(evento.event)) {
      // o que entrou de fato: o Asaas já somou multa e juros ou tirou o desconto
      const valor = emCentavos(pagamento.netValue ?? pagamento.value ?? 0);
      const { data } = await sb.rpc('asaas_dar_baixa', {
        p_asaas_id: pagamento.id,
        p_valor_centavos: emCentavos(pagamento.value ?? 0) || valor,
        p_data: (pagamento.paymentDate ?? pagamento.confirmedDate ?? new Date().toISOString()).slice(0, 10),
        p_metodo: (pagamento.billingType ?? 'asaas').toLowerCase(),
      });
      resultado = data;
    } else if (DESFEZ.includes(evento.event)) {
      const { data } = await sb.rpc('asaas_desfazer_baixa', {
        p_asaas_id: pagamento.id,
        p_status: pagamento.status ?? evento.event,
      });
      resultado = data;
    } else if (pagamento.id) {
      await sb
        .from('asaas_cobrancas')
        .update({ status: pagamento.status ?? evento.event, atualizada_em: new Date().toISOString() })
        .eq('asaas_id', pagamento.id);
    }
  } catch (e) {
    falha = (e as Error).message;
  }

  await sb
    .from('asaas_eventos')
    .update({ processado_em: new Date().toISOString(), erro: falha })
    .eq('evento_id', idEvento);
  await sb
    .from('asaas_conta')
    .update({ ultimo_evento_em: new Date().toISOString() })
    .eq('escolinha_id', conta.escolinha_id);

  // erro aqui é problema nosso: 200 evita o Asaas reenviar em laço
  return json({ ok: true, mensalidade: resultado, erro: falha });
});
