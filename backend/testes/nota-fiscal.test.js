/* Nota fiscal de serviço.

   O portão é o que mais importa aqui: quem não tem CNPJ não emite, e
   isso não é escolha da tela — é função no banco. O resto prova que a
   nota só sai de mensalidade paga, que não sai duas vezes, e que o
   webhook da prefeitura preenche número, PDF e XML quando autoriza.

   Como os do pagamento, rodam contra o stack local e o Asaas de
   mentira; sem os dois, são pulados. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ANON_KEY, URL_SUPABASE, apagarEscolinha, configurado, emDias, entrar, hoje, idDoUsuario,
  novaEscolinha, novoAluno,
} from './ajuda.js';

const FUNCOES = `${URL_SUPABASE}/functions/v1`;
const ASAAS_FALSO = process.env.ASAAS_FALSO ?? 'http://127.0.0.1:8899';
const CHAVE = '$aact_hmlg_teste123456789';
const CNPJ = '11222333000181';

const EH_LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(URL_SUPABASE ?? '');

const noAr = async () => {
  if (!configurado || !EH_LOCAL) return false;
  try {
    const [funcao, falso] = await Promise.all([
      fetch(`${FUNCOES}/nf-emitir`, { method: 'POST' }),
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

describe.skipIf(!rodar)('nota fiscal', () => {
  let gestor, professor, idProfessor, esc, turma, aluno, jwt, jwtProf;

  const emitir = (mensalidadeId, token = jwt) =>
    chamar('nf-emitir', { mensalidade_id: mensalidadeId }, { Authorization: `Bearer ${token}` });

  /* Uma mensalidade por aluno e competência — é constraint no banco.
     Cada caso precisa da sua, então o mês anda a cada chamada em vez
     de ficar fixo. */
  let mes = 0;
  const competencia = () => `2026-${String(++mes).padStart(2, '0')}-01`;

  const mensalidadePaga = async (valor = 15000) => {
    const { data, error } = await gestor
      .from('mensalidades')
      .insert({
        escolinha_id: esc.id, aluno_id: aluno.id, competencia: competencia(),
        valor_centavos: valor, vencimento: emDias(-2), status: 'paga',
        valor_pago_centavos: valor, pago_em: hoje(),
      })
      .select()
      .single();
    if (error) throw new Error('mensalidade: ' + error.message);
    return data;
  };

  const ligar = (ativo = true) =>
    gestor.from('config_fiscal').update({
      ativo,
      servico_codigo: '1.01',
      servico_nome: 'Ensino desportivo',
      nbs_codigo: '1.1401',
      situacao_tributaria: '000',
      classificacao_tributaria: '000001',
      indicador_operacao: '1',
      iss_percentual: 2,
    }).eq('escolinha_id', esc.id);

  beforeAll(async () => {
    gestor = await entrar('dono');
    professor = await entrar('colega');
    idProfessor = await idDoUsuario(professor);
    jwt = (await gestor.auth.getSession()).data.session.access_token;
    jwtProf = (await professor.auth.getSession()).data.session.access_token;

    esc = await novaEscolinha(gestor, 'nota-fiscal');
    turma = esc.turmas[0];
    await gestor.from('membros').insert({
      escolinha_id: esc.id, perfil_id: idProfessor, papel: 'professor',
    });
    aluno = await novoAluno(gestor, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Rafael Nunes', numero: 8,
    });
  });

  afterAll(async () => {
    await gestor.from('membros').delete().eq('escolinha_id', esc?.id).eq('perfil_id', idProfessor);
    await apagarEscolinha(gestor, esc?.id);
  });

  describe('o portão', () => {
    it('a escolinha nasce com a configuração desligada', async () => {
      const { data } = await gestor
        .from('config_fiscal').select('*').eq('escolinha_id', esc.id).single();
      expect(data.ativo).toBe(false);
      expect(data.emissao_automatica).toBe(false);
      expect(data.configurado_em).toBeNull();
    });

    it('sem CNPJ, não emite — e a tela sabe por quê', async () => {
      const { data: pode } = await gestor.rpc('escolinha_emite_nota', { p_escolinha: esc.id });
      expect(pode).toBe(false);

      const { data: s } = await gestor.rpc('situacao_fiscal', { p_escolinha: esc.id });
      expect(s.tem_cnpj).toBe(false);
    });

    it('com CPF no lugar do CNPJ, continua sem emitir', async () => {
      await gestor.from('escolinhas').update({ documento: '52998224725' }).eq('id', esc.id);
      const { data: s } = await gestor.rpc('situacao_fiscal', { p_escolinha: esc.id });
      expect(s.tem_cnpj).toBe(false);
    });

    it('com CNPJ mas sem conta Asaas, ainda não', async () => {
      await gestor.from('escolinhas').update({ documento: CNPJ }).eq('id', esc.id);
      const { data: s } = await gestor.rpc('situacao_fiscal', { p_escolinha: esc.id });
      expect(s.tem_cnpj).toBe(true);
      expect(s.tem_asaas).toBe(false);

      const { data: pode } = await gestor.rpc('escolinha_emite_nota', { p_escolinha: esc.id });
      expect(pode).toBe(false);
    });

    it('não dá para ligar sem ter escolhido o serviço', async () => {
      const { error } = await gestor
        .from('config_fiscal').update({ ativo: true }).eq('escolinha_id', esc.id);
      expect(error).not.toBeNull();   // a constraint do banco recusa
    });
  });

  describe('configurar', () => {
    beforeAll(async () => {
      const r = await chamar('asaas-conectar', { escolinha_id: esc.id, api_key: CHAVE }, {
        Authorization: `Bearer ${jwt}`,
      });
      if (r.status !== 200) throw new Error('conectar o Asaas: ' + (await r.text()));
    });

    it('o professor não configura', async () => {
      const r = await chamar('nf-configurar', { escolinha_id: esc.id, acao: 'opcoes' }, {
        Authorization: `Bearer ${jwtProf}`,
      });
      expect(r.status).toBe(403);
    });

    it('pergunta ao Asaas o que o município exige', async () => {
      const r = await chamar('nf-configurar', { escolinha_id: esc.id, acao: 'opcoes' }, {
        Authorization: `Bearer ${jwt}`,
      });
      expect(r.status).toBe(200);

      const c = await r.json();
      expect(c.municipio.requiredFields.map((f) => f.name)).toContain('municipalInscription');
      expect(c.servicos.map((s) => s.description)).toContain('Ensino desportivo');
      // listas da reforma tributária, consultadas e não fixadas no código
      expect(c.nbs.map((n) => n.code)).toContain('1.1401');
      expect(c.situacoes.length).toBeGreaterThan(0);
    });

    it('salvar manda a configuração ao Asaas e guarda aqui', async () => {
      const r = await chamar('nf-configurar', {
        escolinha_id: esc.id,
        acao: 'salvar',
        fiscal: {
          asaas: { municipalInscription: '123456', simplesNacional: true },
          servico_codigo: '1.01',
          servico_nome: 'Ensino desportivo',
          iss_percentual: 2,
          nbs_codigo: '1.1401',
          situacao_tributaria: '000',
          classificacao_tributaria: '000001',
          indicador_operacao: '1',
          ativo: true,
        },
      }, { Authorization: `Bearer ${jwt}` });
      expect(r.status).toBe(200);

      const enviado = (await estadoDoFalso()).fiscal.at(-1);
      expect(enviado.municipalInscription).toBe('123456');

      const { data } = await gestor
        .from('config_fiscal').select('*').eq('escolinha_id', esc.id).single();
      expect(data.ativo).toBe(true);
      expect(data.configurado_em).not.toBeNull();

      const { data: pode } = await gestor.rpc('escolinha_emite_nota', { p_escolinha: esc.id });
      expect(pode).toBe(true);
    });
  });

  describe('emitir', () => {
    it('mensalidade em aberto não vira nota', async () => {
      const { data: m } = await gestor
        .from('mensalidades')
        .insert({
          escolinha_id: esc.id, aluno_id: aluno.id, competencia: competencia(),
          valor_centavos: 15000, vencimento: emDias(10),
        })
        .select()
        .single();

      const r = await emitir(m.id);
      expect(r.status).toBe(409);
      expect((await r.json()).erro).toMatch(/em aberto/);
    });

    it('o professor não emite', async () => {
      const m = await mensalidadePaga();
      const r = await emitir(m.id, jwtProf);
      expect(r.status).toBe(403);
    });

    it('mensalidade paga vira nota, com os códigos da reforma junto', async () => {
      const m = await mensalidadePaga(18000);
      const r = await emitir(m.id);
      expect(r.status).toBe(200);

      const { nota } = await r.json();
      expect(nota.status).toBe('SCHEDULED');
      expect(nota.valor_centavos).toBe(18000);

      const enviada = (await estadoDoFalso()).notas.at(-1);
      expect(enviada.value).toBe(180);
      expect(enviada.municipalServiceName).toBe('Ensino desportivo');
      expect(enviada.externalReference).toBe(m.id);
      expect(enviada.taxes.iss).toBe(2);
      expect(enviada.taxes.nbsCode).toBe('1.1401');
      expect(enviada.taxes.taxSituationCode).toBe('000');
      expect(enviada.taxes.operationIndicatorCode).toBe('1');
    });

    it('emitir de novo devolve a mesma nota, não cria outra', async () => {
      const m = await mensalidadePaga(12000);
      await emitir(m.id);
      const antes = (await estadoDoFalso()).notas.length;

      const r = await emitir(m.id);
      expect(r.status).toBe(200);
      expect((await r.json()).repetida).toBe(true);
      expect((await estadoDoFalso()).notas.length).toBe(antes);
    });

    it('com a emissão desligada, recusa', async () => {
      await gestor.from('config_fiscal').update({ ativo: false }).eq('escolinha_id', esc.id);
      const m = await mensalidadePaga();
      const r = await emitir(m.id);
      expect(r.status).toBe(409);
      await ligar(true);
    });
  });

  describe('o webhook da prefeitura', () => {
    let nota;

    const evento = async (tipo, extra = {}) => {
      const { data: conta } = await gestor
        .from('asaas_conta').select('webhook_token').eq('escolinha_id', esc.id).single();
      return chamar(
        'asaas-webhook',
        { id: `evt_nf_${tipo}_${Date.now()}`, event: tipo, invoice: { id: nota.asaas_id, ...extra } },
        { 'asaas-access-token': conta.webhook_token }
      );
    };

    beforeAll(async () => {
      const m = await mensalidadePaga(20000);
      const r = await emitir(m.id);
      nota = (await r.json()).nota;
    });

    it('autorizada traz número, PDF e XML', async () => {
      const r = await evento('INVOICE_AUTHORIZED', {
        status: 'AUTHORIZED',
        number: '2026/000123',
        pdfUrl: 'https://falso/nf/123.pdf',
        xmlUrl: 'https://falso/nf/123.xml',
        validationCode: 'ABC123',
      });
      expect(r.status).toBe(200);

      const { data } = await gestor
        .from('notas_fiscais').select('*').eq('asaas_id', nota.asaas_id).single();
      expect(data.status).toBe('AUTHORIZED');
      expect(data.numero).toBe('2026/000123');
      expect(data.pdf_url).toBe('https://falso/nf/123.pdf');
      expect(data.erro).toBeNull();
    });

    it('depois do erro, dá para emitir de novo — e não fica beco sem saída', async () => {
      // primeiro põe a nota em erro
      await evento('INVOICE_ERROR', { status: 'ERROR', statusDescription: 'Prefeitura fora do ar' });

      const { data: antes } = await gestor
        .from('notas_fiscais').select('mensalidade_id').eq('asaas_id', nota.asaas_id).single();

      const r = await emitir(antes.mensalidade_id);
      expect(r.status).toBe(200);
      const corpo = await r.json();
      expect(corpo.repetida).toBeUndefined();        // é nota nova, não a mesma
      expect(corpo.nota.asaas_id).not.toBe(nota.asaas_id);
      expect(corpo.nota.erro).toBeNull();

      nota = corpo.nota;                              // os casos seguintes usam a nova
    });

    it('erro da prefeitura fica guardado para o gestor ver e reemitir', async () => {
      const r = await evento('INVOICE_ERROR', {
        status: 'ERROR',
        statusDescription: 'Certificado digital vencido',
      });
      expect(r.status).toBe(200);

      const { data } = await gestor
        .from('notas_fiscais').select('status, erro').eq('asaas_id', nota.asaas_id).single();
      expect(data.status).toBe('ERROR');
      expect(data.erro).toBe('Certificado digital vencido');
    });
  });

  describe('o professor não chega perto', () => {
    it('não lê configuração fiscal nem notas', async () => {
      for (const t of ['config_fiscal', 'notas_fiscais', 'vw_notas_fiscais']) {
        const { data } = await professor.from(t).select('*').eq('escolinha_id', esc.id);
        expect(data ?? []).toEqual([]);
      }
    });
  });
});
