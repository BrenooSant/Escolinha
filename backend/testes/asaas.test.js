/* Pagamento pelo Asaas, de ponta a ponta: conectar a conta, gerar a
   cobrança do link do responsável e receber o webhook que dá baixa.

   Rodam contra as funções servidas localmente (`supabase functions
   serve`) e contra um Asaas de mentira — sem chave de verdade e sem
   dinheiro. Onde as funções não estiverem no ar, a suíte é pulada. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ANON_KEY, URL_SUPABASE, apagarEscolinha, configurado, emDias, entrar, idDoUsuario, novaEscolinha,
  novoAluno, novoResponsavel,
} from './ajuda.js';

const FUNCOES = `${URL_SUPABASE}/functions/v1`;
const ASAAS_FALSO = process.env.ASAAS_FALSO ?? 'http://127.0.0.1:8899';
const CHAVE = '$aact_hmlg_teste123456789';

/* Só rodam onde existe o par completo: as funções servidas localmente e
   o Asaas de mentira. Contra a nuvem (ou no CI) são pulados — lá as
   funções falam com o Asaas de verdade, e chave de teste não vale. */
const noAr = async () => {
  if (!configurado) return false;
  try {
    const [funcao, falso] = await Promise.all([
      fetch(`${FUNCOES}/asaas-webhook`, { method: 'POST' }),
      fetch(`${ASAAS_FALSO}/__estado`),
    ]);
    return funcao.status === 401 && falso.ok;
  } catch {
    return false;
  }
};

const chamar = (nome, corpo, cabecalhos = {}) =>
  fetch(`${FUNCOES}/${nome}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, ...cabecalhos },
    body: JSON.stringify(corpo),
  });

const estadoDoFalso = async () => (await fetch(`${ASAAS_FALSO}/__estado`)).json();

const rodar = await noAr();

describe.skipIf(!rodar)('pagamento pelo Asaas', () => {
  let gestor, professor, idProfessor, esc, turma, resp, aluno, mensalidade, token, jwt;

  beforeAll(async () => {
    gestor = await entrar('dono');
    professor = await entrar('colega');
    idProfessor = await idDoUsuario(professor);
    jwt = (await gestor.auth.getSession()).data.session.access_token;

    esc = await novaEscolinha(gestor, 'asaas');
    turma = esc.turmas[0];
    await gestor.from('membros').insert({ escolinha_id: esc.id, perfil_id: idProfessor, papel: 'professor' });
    await gestor
      .from('config_cobranca')
      .update({ multa_percentual: 2, juros_mes_percentual: 1, desconto_tipo: 'fixo', desconto_valor: 1000, desconto_dias: 0 })
      .eq('escolinha_id', esc.id);

    resp = await novoResponsavel(gestor, { escolinhaId: esc.id, nome: 'Paula Dias', telefone: '(62) 98111-7788' });
    aluno = await novoAluno(gestor, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Tiago Dias', numero: 31, responsavel_id: resp.id,
    });
    const { data: m } = await gestor
      .from('mensalidades')
      .insert({
        escolinha_id: esc.id, aluno_id: aluno.id, competencia: '2035-03-01',
        valor_centavos: 15000, vencimento: emDias(5),
      })
      .select()
      .single();
    mensalidade = m;
    token = (await gestor.rpc('token_responsavel', { p_responsavel: resp.id })).data;
  });

  afterAll(async () => {
    await gestor.from('membros').delete().eq('escolinha_id', esc?.id).eq('perfil_id', idProfessor);
    await apagarEscolinha(gestor, esc?.id);
  });

  describe('conectar a conta', () => {
    it('o professor não conecta', async () => {
      const jwtProf = (await professor.auth.getSession()).data.session.access_token;
      const r = await chamar('asaas-conectar', { escolinha_id: esc.id, api_key: CHAVE }, {
        Authorization: `Bearer ${jwtProf}`,
      });
      expect(r.status).toBe(403);
    });

    it('chave fora do formato do Asaas é recusada antes de sair daqui', async () => {
      const r = await chamar('asaas-conectar', { escolinha_id: esc.id, api_key: 'minha-chave' }, {
        Authorization: `Bearer ${jwt}`,
      });
      expect(r.status).toBe(400);
      expect((await r.json()).erro).toMatch(/começa com \$aact_/);
    });

    it('chave que o Asaas recusa não deixa conexão pela metade', async () => {
      const r = await chamar('asaas-conectar', { escolinha_id: esc.id, api_key: '$aact_hmlg_recusada' }, {
        Authorization: `Bearer ${jwt}`,
      });
      expect(r.status).toBe(400);
      const { data } = await gestor.from('asaas_conta').select('*').eq('escolinha_id', esc.id);
      expect(data).toEqual([]);
    });

    it('o gestor conecta, e o webhook fica registrado no Asaas', async () => {
      const r = await chamar('asaas-conectar', { escolinha_id: esc.id, api_key: CHAVE }, {
        Authorization: `Bearer ${jwt}`,
      });
      expect(r.status).toBe(200);
      expect((await r.json()).ambiente).toBe('sandbox');

      const { data } = await gestor.from('asaas_conta').select('*').eq('escolinha_id', esc.id).single();
      expect(data.chave_final).toBe(CHAVE.slice(-4));
      expect(data.conta_nome).toBe('Escolinha Teste');
      expect(data.webhook_token).toHaveLength(48);

      const falso = await estadoDoFalso();
      const hook = falso.webhooks.at(-1);
      expect(hook.authToken).toBe(data.webhook_token);
      expect(hook.events).toContain('PAYMENT_RECEIVED');
      expect(hook.url).toMatch(/asaas-webhook$/);
    });

    it('nem o gestor lê a chave guardada', async () => {
      const { data, error } = await gestor.from('asaas_segredo').select('api_key').eq('escolinha_id', esc.id);
      expect(error || (data ?? []).length === 0).toBeTruthy();
    });

    it('o portal passa a saber que dá para pagar online', async () => {
      const { data } = await gestor.rpc('escolinha_aceita_online', { p_escolinha: esc.id });
      expect(data).toBe(true);
    });
  });

  describe('cobrança do link do responsável', () => {
    it('link errado não gera nada', async () => {
      const r = await chamar('asaas-cobranca', { token: 'naoexiste', mensalidade_id: mensalidade.id });
      expect(r.status).toBe(404);
    });

    it('pede o CPF na primeira vez', async () => {
      const r = await chamar('asaas-cobranca', { token, mensalidade_id: mensalidade.id });
      const corpo = await r.json();
      expect(corpo.precisa_cpf).toBe(true);
      expect(corpo.nome_sugerido).toBe('Paula Dias');
    });

    it('CPF inválido não passa', async () => {
      const r = await chamar('asaas-cobranca', {
        token, mensalidade_id: mensalidade.id, cpf: '111.111.111-11',
      });
      expect(r.status).toBe(400);
    });

    it('com o CPF, devolve boleto e Pix — e leva as regras da escolinha', async () => {
      const r = await chamar('asaas-cobranca', {
        token, mensalidade_id: mensalidade.id, cpf: '529.982.247-25', nome: 'Paula Dias',
      });
      expect(r.status).toBe(200);
      const { cobranca } = await r.json();
      expect(cobranca.boleto_url).toMatch(/^https:\/\/falso\/b\//);
      expect(cobranca.pix_payload).toContain('PIX-FALSO');

      const falso = await estadoDoFalso();
      const criada = falso.cobrancas.at(-1);
      expect(criada.value).toBe(150);
      expect(criada.dueDate).toBe(mensalidade.vencimento);
      expect(criada.discount).toEqual({ value: 10, dueDateLimitDays: 0, type: 'FIXED' });
      expect(criada.fine).toEqual({ value: 2, type: 'PERCENTAGE' });
      expect(criada.interest).toEqual({ value: 1 });
      expect(criada.externalReference).toBe(mensalidade.id);

      // o Asaas não avisa ninguém: quem mostra a cobrança é o link
      expect(falso.clientes.at(-1).notificationDisabled).toBe(true);
    });

    it('tocar em pagar de novo reaproveita a mesma cobrança', async () => {
      const antes = (await estadoDoFalso()).cobrancas.length;
      const r = await chamar('asaas-cobranca', { token, mensalidade_id: mensalidade.id });
      expect(r.status).toBe(200);
      expect((await estadoDoFalso()).cobrancas.length).toBe(antes);

      const { data } = await gestor.from('asaas_cobrancas').select('*').eq('mensalidade_id', mensalidade.id);
      expect(data).toHaveLength(1);
    });

    it('o link de um responsável não paga a mensalidade de outro', async () => {
      const outro = await novoResponsavel(gestor, { escolinhaId: esc.id, nome: 'Outro', telefone: '(62) 90000-1111' });
      const t = (await gestor.rpc('token_responsavel', { p_responsavel: outro.id })).data;
      const r = await chamar('asaas-cobranca', { token: t, mensalidade_id: mensalidade.id });
      expect(r.status).toBe(404);
    });
  });

  describe('webhook: a baixa sozinha', () => {
    const evento = async (tipo, extra = {}, cabecalhos) => {
      const { data: conta } = await gestor.from('asaas_conta').select('webhook_token').eq('escolinha_id', esc.id).single();
      const { data: cob } = await gestor.from('asaas_cobrancas').select('asaas_id').eq('mensalidade_id', mensalidade.id).single();
      return chamar(
        'asaas-webhook',
        {
          id: extra.id ?? `evt_${tipo}_${Date.now()}`,
          event: tipo,
          payment: {
            id: cob.asaas_id, status: tipo.replace('PAYMENT_', ''), value: 153, netValue: 150.5,
            billingType: 'PIX', paymentDate: new Date().toISOString().slice(0, 10), ...extra.payment,
          },
        },
        cabecalhos ?? { 'asaas-access-token': conta.webhook_token }
      );
    };

    it('token errado é recusado', async () => {
      const r = await evento('PAYMENT_RECEIVED', {}, { 'asaas-access-token': 'token-errado' });
      expect(r.status).toBe(401);
    });

    it('pagamento recebido quita a mensalidade e entra no caixa', async () => {
      const r = await evento('PAYMENT_RECEIVED', { id: 'evt_1' });
      expect(r.status).toBe(200);

      const { data: m } = await gestor.from('mensalidades').select('*').eq('id', mensalidade.id).single();
      expect(m.status).toBe('paga');
      expect(m.valor_pago_centavos).toBe(15300);
      expect(m.metodo).toBe('pix');

      const { data: l } = await gestor.from('lancamentos').select('valor_centavos').eq('mensalidade_id', mensalidade.id).single();
      expect(l.valor_centavos).toBe(15300);
    });

    it('o mesmo evento repetido não lança duas vezes', async () => {
      const r = await evento('PAYMENT_RECEIVED', { id: 'evt_1' });
      expect((await r.json()).repetido).toBe(true);

      const { data } = await gestor.from('lancamentos').select('id').eq('mensalidade_id', mensalidade.id);
      expect(data).toHaveLength(1);
    });

    it('estorno devolve a mensalidade para em aberto e tira do caixa', async () => {
      const r = await evento('PAYMENT_REFUNDED', { id: 'evt_2' });
      expect(r.status).toBe(200);

      const { data: m } = await gestor.from('mensalidades').select('status, valor_pago_centavos').eq('id', mensalidade.id).single();
      expect(m.status).toBe('aberta');
      expect(m.valor_pago_centavos).toBeNull();

      const { data: l } = await gestor.from('lancamentos').select('id').eq('mensalidade_id', mensalidade.id);
      expect(l).toEqual([]);
    });

    it('o gestor vê o evento chegando, mas não o conteúdo cru', async () => {
      const { data: conta } = await gestor.from('asaas_conta').select('ultimo_evento_em').eq('escolinha_id', esc.id).single();
      expect(conta.ultimo_evento_em).toBeTruthy();

      const { data, error } = await gestor.from('asaas_eventos').select('id').eq('escolinha_id', esc.id);
      expect(error || (data ?? []).length === 0).toBeTruthy();
    });
  });
});
