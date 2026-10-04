/* Emitir a nota fiscal de uma mensalidade já paga.

   O pedido não leva município: ele vem da configuração fiscal da conta,
   lá no Asaas. O que vai daqui é o serviço, a descrição, o valor, os
   impostos e o id da cobrança que originou tudo.

   Manual por desenho. Nota errada é pior que nota nenhuma — dá trabalho
   para cancelar e pode gerar imposto indevido —, então quem aperta o
   botão é o gestor, e o automático só existe depois da primeira sair
   certa. */
import { CORS, ErroAsaas, FISCAL, contaDaEscolinha, ehDono, emReais, erro, json, servidor }
  from '../_compartilhado/asaas.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro('Método não suportado.', 405);

  const autorizacao = req.headers.get('Authorization') ?? '';
  if (!autorizacao) return erro('Entre na sua conta.', 401);

  const { mensalidade_id: mensalidadeId } = await req.json().catch(() => ({}));
  if (!mensalidadeId) return erro('Informe a mensalidade.');

  const sb = servidor();

  const { data: mensalidade } = await sb
    .from('mensalidades')
    .select('id, escolinha_id, status, competencia, valor_pago_centavos, valor_centavos, tipo, descricao, aluno:alunos(nome)')
    .eq('id', mensalidadeId)
    .maybeSingle();
  if (!mensalidade) return erro('Mensalidade não encontrada.', 404);

  if (!(await ehDono(autorizacao, mensalidade.escolinha_id))) {
    return erro('Só o gestor emite nota fiscal.', 403);
  }

  /* Nota de serviço não prestado é problema fiscal, não detalhe de
     interface: a trava fica aqui, não no botão. */
  if (mensalidade.status !== 'paga') {
    return erro('A nota sai depois do pagamento — esta mensalidade ainda está em aberto.', 409);
  }

  const { data: config } = await sb
    .from('config_fiscal').select('*').eq('escolinha_id', mensalidade.escolinha_id).maybeSingle();
  if (!config?.ativo) {
    return erro('A emissão de nota fiscal está desligada em Ajustes.', 409);
  }

  /* Já emitida: devolve a que existe em vez de criar outra.

     Menos quando falhou. Certificado vencido e prefeitura fora do ar
     são erros que passam, e uma nota parada em ERROR sem caminho de
     volta seria um beco sem saída na tela — a tentativa seguinte
     substitui a que deu errado. */
  const { data: jaTem } = await sb
    .from('notas_fiscais').select('*').eq('mensalidade_id', mensalidadeId).maybeSingle();
  if (jaTem && jaTem.status !== 'ERROR') {
    return json({ ok: true, nota: jaTem, repetida: true });
  }
  if (jaTem) {
    await sb.from('notas_fiscais').delete().eq('mensalidade_id', mensalidadeId);
  }

  /* A nota é amarrada à cobrança do Asaas quando ela existe — é assim
     que o Asaas relaciona nota e pagamento. Mensalidade paga na mão
     (Pix direto, dinheiro) não tem cobrança lá, e aí a nota sai pelo
     cliente. */
  const { data: cobranca } = await sb
    .from('asaas_cobrancas').select('asaas_id').eq('mensalidade_id', mensalidadeId).maybeSingle();

  const conectada = await contaDaEscolinha(sb, mensalidade.escolinha_id);
  if (!conectada) return erro('Conta Asaas não conectada.', 409);
  const { asaas } = conectada;

  const centavos = mensalidade.valor_pago_centavos ?? mensalidade.valor_centavos;
  const competencia = `${mensalidade.competencia.slice(5, 7)}/${mensalidade.competencia.slice(0, 4)}`;
  const aluno = (mensalidade.aluno as { nome?: string } | null)?.nome ?? 'atleta';

  const descricao = mensalidade.tipo === 'avulsa'
    ? `${mensalidade.descricao ?? 'Serviço'} — ${aluno}`
    : `${config.descricao_servico} ${competencia} — ${aluno}`;

  /* Impostos. Os quatro códigos da reforma tributária entram só quando
     o gestor os escolheu: para quem ainda não é obrigado, mandar campo
     vazio é pedir recusa. Obrigatórios para serviços em geral desde
     01/10/2026 e para o Simples Nacional a partir de 01/01/2027. */
  const taxes: Record<string, unknown> = {
    iss: Number(config.iss_percentual ?? 0),
    retainIss: config.retem_iss === true,
    pis: 0,
    cofins: 0,
    csll: 0,
    inss: 0,
    ir: 0,
  };
  if (config.nbs_codigo) taxes.nbsCode = config.nbs_codigo;
  if (config.situacao_tributaria) taxes.taxSituationCode = config.situacao_tributaria;
  if (config.classificacao_tributaria) taxes.taxClassificationCode = config.classificacao_tributaria;
  if (config.indicador_operacao) taxes.operationIndicatorCode = config.indicador_operacao;

  try {
    const nota = await asaas.chamar(FISCAL.notas, {
      metodo: 'POST',
      corpo: {
        payment: cobranca?.asaas_id ?? undefined,
        serviceDescription: descricao,
        observations: `Competência ${competencia}`,
        value: emReais(centavos),
        deductions: 0,
        effectiveDate: new Date().toISOString().slice(0, 10),
        municipalServiceId: config.servico_id ?? undefined,
        municipalServiceCode: config.servico_codigo ?? undefined,
        municipalServiceName: config.servico_nome,
        externalReference: mensalidade.id,
        taxes,
      },
    });

    const { data: linha, error } = await sb
      .from('notas_fiscais')
      .insert({
        mensalidade_id: mensalidade.id,
        escolinha_id: mensalidade.escolinha_id,
        asaas_id: nota.id,
        status: nota.status ?? 'SCHEDULED',
        numero: nota.number ?? null,
        pdf_url: nota.pdfUrl ?? null,
        xml_url: nota.xmlUrl ?? null,
        codigo_verificacao: nota.validationCode ?? null,
        valor_centavos: centavos,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return json({ ok: true, nota: linha });
  } catch (e) {
    const mensagem = e instanceof ErroAsaas ? e.message : (e as Error).message;
    await sb
      .from('config_fiscal')
      .update({ ultimo_erro: mensagem.slice(0, 300), ultimo_erro_em: new Date().toISOString() })
      .eq('escolinha_id', mensalidade.escolinha_id);
    return erro(mensagem, 400);
  }
});
