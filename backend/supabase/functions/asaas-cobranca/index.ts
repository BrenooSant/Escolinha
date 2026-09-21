/* A cobrança do link do responsável.

   O pai abre o link do filho, toca em "Pagar" e esta função devolve
   boleto, Pix e cartão da mensalidade daquele mês. A cobrança nasce na
   conta Asaas da escolinha — o dinheiro é dela desde o começo.

   Nada é criado antes da hora: só existe boleto para quem quis pagar.
   A cobrança já criada é reaproveitada, para não gerar duas para a
   mesma mensalidade.

   Quem chama é o responsável, sem login, com o token do link dele. */
import {
  Asaas, CORS, ErroAsaas, anotarErro, contaDaEscolinha, emCentavos, emReais, erro, json, servidor,
  soDigitos,
} from '../_compartilhado/asaas.ts';

const cpfValido = (bruto: string) => {
  const d = soDigitos(bruto);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro('Método não suportado.', 405);

  const { token, mensalidade_id: mensalidadeId, cpf, nome } = await req.json().catch(() => ({}));
  if (!token || !mensalidadeId) return erro('Link inválido.', 400);

  const sb = servidor();

  // o token do link diz quem é o responsável; daí em diante só se mexe
  // no que for dos filhos dele
  const { data: responsavel } = await sb
    .from('responsaveis').select('*').eq('token', String(token).trim()).maybeSingle();
  if (!responsavel) return erro('Link inválido.', 404);

  const { data: mensalidade } = await sb
    .from('mensalidades')
    .select('*, aluno:alunos!inner(id, nome, responsavel_id)')
    .eq('id', mensalidadeId)
    .eq('aluno.responsavel_id', responsavel.id)
    .maybeSingle();
  if (!mensalidade) return erro('Cobrança não encontrada.', 404);
  if (mensalidade.status !== 'aberta') return erro('Esta cobrança não está em aberto.', 409);

  const conexao = await contaDaEscolinha(sb, responsavel.escolinha_id);
  if (!conexao) return erro('A escolinha ainda não ativou o pagamento online.', 409);
  const { asaas } = conexao;

  // cobrança já criada e ainda válida: devolve a mesma
  const { data: existente } = await sb
    .from('asaas_cobrancas').select('*').eq('mensalidade_id', mensalidadeId).maybeSingle();
  if (existente && ['PENDING', 'AWAITING_RISK_ANALYSIS', 'OVERDUE'].includes(existente.status)) {
    return json({
      ok: true,
      cobranca: {
        invoice_url: existente.invoice_url,
        boleto_url: existente.boleto_url,
        pix_payload: existente.pix_payload,
        valor_centavos: existente.valor_centavos,
        vencimento: existente.vencimento,
      },
    });
  }

  // o Asaas exige nome e CPF do pagador; o portal pede uma vez só
  let { data: cadastro } = await sb
    .from('responsaveis_cobranca').select('*').eq('responsavel_id', responsavel.id).maybeSingle();

  if (!cadastro) {
    if (!cpf) return json({ precisa_cpf: true, nome_sugerido: responsavel.nome });
    if (!cpfValido(cpf)) return erro('CPF inválido — confira os números.', 400);
    const { data: criado, error: erroCadastro } = await sb
      .from('responsaveis_cobranca')
      .insert({
        responsavel_id: responsavel.id,
        escolinha_id: responsavel.escolinha_id,
        cpf: soDigitos(cpf),
      })
      .select()
      .single();
    if (erroCadastro) return erro('Não deu para guardar o CPF: ' + erroCadastro.message, 400);
    cadastro = criado;
  }

  try {
    let clienteId = cadastro.asaas_customer_id;
    if (!clienteId) {
      const cliente = await asaas.chamar('/customers', {
        metodo: 'POST',
        corpo: {
          name: (nome ?? responsavel.nome).trim(),
          cpfCnpj: cadastro.cpf,
          mobilePhone: soDigitos(responsavel.telefone ?? '') || undefined,
          email: responsavel.email ?? undefined,
          externalReference: responsavel.id,
          // quem avisa é o link da escolinha, não o Asaas
          notificationDisabled: true,
        },
      });
      clienteId = cliente.id;
      await sb
        .from('responsaveis_cobranca')
        .update({ asaas_customer_id: clienteId })
        .eq('responsavel_id', responsavel.id);
    }

    /* Valor e vencimento originais, com desconto, multa e juros da
       escolinha: o Asaas aplica as mesmas regras da fase 2, então o
       boleto vencido já sai com multa sem ninguém recalcular nada. */
    const cobranca = await asaas.chamar('/payments', {
      metodo: 'POST',
      corpo: {
        customer: clienteId,
        billingType: 'UNDEFINED',
        value: emReais(mensalidade.valor_centavos),
        dueDate: mensalidade.vencimento,
        description:
          mensalidade.tipo === 'avulsa'
            ? `${mensalidade.descricao ?? 'Cobrança'} — ${mensalidade.aluno.nome}`
            : `Mensalidade ${mensalidade.competencia.slice(5, 7)}/${mensalidade.competencia.slice(0, 4)} — ${mensalidade.aluno.nome}`,
        externalReference: mensalidade.id,
        discount: mensalidade.desconto_centavos > 0
          ? {
              value: emReais(mensalidade.desconto_centavos),
              dueDateLimitDays: mensalidade.desconto_dias,
              type: 'FIXED',
            }
          : undefined,
        fine: Number(mensalidade.multa_percentual) > 0
          ? { value: Number(mensalidade.multa_percentual), type: 'PERCENTAGE' }
          : undefined,
        interest: Number(mensalidade.juros_mes_percentual) > 0
          ? { value: Number(mensalidade.juros_mes_percentual) }
          : undefined,
      },
    });

    let pix: string | null = null;
    try {
      const qr = await asaas.chamar(`/payments/${cobranca.id}/pixQrCode`);
      pix = qr?.payload ?? null;
    } catch {
      // nem toda conta tem Pix habilitado; boleto e cartão seguem valendo
    }

    await sb.from('asaas_cobrancas').upsert({
      mensalidade_id: mensalidade.id,
      escolinha_id: responsavel.escolinha_id,
      asaas_id: cobranca.id,
      status: cobranca.status ?? 'PENDING',
      valor_centavos: emCentavos(cobranca.value),
      vencimento: cobranca.dueDate,
      invoice_url: cobranca.invoiceUrl ?? null,
      boleto_url: cobranca.bankSlipUrl ?? null,
      pix_payload: pix,
      atualizada_em: new Date().toISOString(),
    });

    return json({
      ok: true,
      cobranca: {
        invoice_url: cobranca.invoiceUrl ?? null,
        boleto_url: cobranca.bankSlipUrl ?? null,
        pix_payload: pix,
        valor_centavos: emCentavos(cobranca.value),
        vencimento: cobranca.dueDate,
      },
    });
  } catch (e) {
    const mensagem = e instanceof ErroAsaas ? e.message : (e as Error).message;
    await anotarErro(sb, responsavel.escolinha_id, mensagem);
    return erro('Não deu para gerar a cobrança agora: ' + mensagem, 502);
  }
});
