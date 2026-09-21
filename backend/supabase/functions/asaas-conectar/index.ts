/* Conectar a conta Asaas da escolinha.

   A escolinha cria a conta dela no Asaas, gera a chave de API e cola
   aqui. Esta função confere a chave, guarda e registra o webhook — a
   partir daí o pagamento do responsável dá baixa sozinho.

   Quem chama é o gestor, com o login dele: a função confere isso antes
   de qualquer coisa. */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Asaas, CORS, ErroAsaas, ambienteDaChave, erro, json, servidor } from '../_compartilhado/asaas.ts';

const EVENTOS = [
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_REFUNDED',
  'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_REVERSED',
  'PAYMENT_DELETED',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro('Método não suportado.', 405);

  const autorizacao = req.headers.get('Authorization') ?? '';
  if (!autorizacao) return erro('Entre na sua conta.', 401);

  const { escolinha_id: escolinhaId, api_key: chaveBruta } = await req.json().catch(() => ({}));
  const chave = (chaveBruta ?? '').trim();
  if (!escolinhaId || !chave) return erro('Informe a escolinha e a chave de API.');

  // o gestor precisa ser dono desta escolinha — quem responde é a RLS
  const comoUsuario = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: autorizacao } }, auth: { persistSession: false } }
  );
  const { data: ehDono } = await comoUsuario.rpc('e_dono', { p_escolinha: escolinhaId });
  if (!ehDono) return erro('Só o gestor conecta a conta.', 403);

  const ambiente = ambienteDaChave(chave);
  if (!ambiente) {
    return erro('Isso não parece uma chave de API do Asaas. Ela começa com $aact_.');
  }

  const asaas = new Asaas(chave, ambiente);
  const sb = servidor();

  try {
    const conta = await asaas.chamar('/myAccount');

    // a linha nasce antes do webhook: é dela que sai o token que
    // identifica a escolinha nas notificações
    const { data: linha, error: erroLinha } = await sb
      .from('asaas_conta')
      .upsert({
        escolinha_id: escolinhaId,
        ambiente,
        chave_final: chave.slice(-4),
        conta_nome: conta?.name ?? null,
        conta_email: conta?.email ?? null,
        wallet_id: conta?.walletId ?? null,
        ultimo_erro: null,
        ultimo_erro_em: null,
      })
      .select()
      .single();
    if (erroLinha) throw new Error(erroLinha.message);

    const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/asaas-webhook`;
    let webhookId = linha.webhook_id;
    try {
      const webhook = await asaas.chamar('/webhooks', {
        metodo: 'POST',
        corpo: {
          name: 'Escolinha — baixa automática',
          url,
          email: conta?.email ?? undefined,
          enabled: true,
          interrupted: false,
          authToken: linha.webhook_token,
          sendType: 'SEQUENTIALLY',
          events: EVENTOS,
        },
      });
      webhookId = webhook?.id ?? null;
    } catch (e) {
      // webhook repetido não é motivo para desfazer a conexão
      if (!(e instanceof ErroAsaas) || e.status !== 400) throw e;
    }

    await sb
      .from('asaas_segredo')
      .upsert({ escolinha_id: escolinhaId, api_key: chave, atualizada_em: new Date().toISOString() });
    if (webhookId && webhookId !== linha.webhook_id) {
      await sb.from('asaas_conta').update({ webhook_id: webhookId }).eq('escolinha_id', escolinhaId);
    }

    return json({
      ok: true,
      ambiente,
      conta: { nome: conta?.name ?? null, email: conta?.email ?? null },
    });
  } catch (e) {
    const mensagem = e instanceof ErroAsaas
      ? (e.status === 401 ? 'O Asaas recusou a chave. Confira se copiou inteira e do ambiente certo.' : e.message)
      : (e as Error).message;
    // conexão que não completou não fica de pé pela metade
    await sb.from('asaas_conta').delete().eq('escolinha_id', escolinhaId);
    await sb.from('asaas_segredo').delete().eq('escolinha_id', escolinhaId);
    return erro(mensagem, 400);
  }
});
