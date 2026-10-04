/* Configuração fiscal da escolinha.

   Duas coisas numa função só, escolhidas por `acao`:

   - `opcoes`  pergunta ao Asaas o que ESTE município exige e quais
               serviços e códigos existem. É o que faz a tela se montar
               sozinha, em vez de eu adivinhar um formulário fiscal que
               serve para 5 570 prefeituras.
   - `salvar`  manda a configuração ao Asaas e guarda aqui o que a
               emissão vai precisar depois.

   Só o gestor chega aqui, e quem confere isso é a RLS. */
import { CORS, ErroAsaas, FISCAL, contaDaEscolinha, ehDono, erro, json, servidor }
  from '../_compartilhado/asaas.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro('Método não suportado.', 405);

  const autorizacao = req.headers.get('Authorization') ?? '';
  if (!autorizacao) return erro('Entre na sua conta.', 401);

  const corpo = await req.json().catch(() => ({}));
  const { escolinha_id: escolinhaId, acao } = corpo;
  if (!escolinhaId) return erro('Informe a escolinha.');

  if (!(await ehDono(autorizacao, escolinhaId))) {
    return erro('Só o gestor mexe na configuração fiscal.', 403);
  }

  const sb = servidor();

  /* Nota fiscal sai pela conta Asaas da escolinha: sem ela conectada,
     não há por onde emitir. */
  const conectada = await contaDaEscolinha(sb, escolinhaId);
  if (!conectada) {
    return erro('Conecte a conta Asaas da escolinha antes de configurar a nota fiscal.', 409);
  }
  const { asaas } = conectada;

  try {
    if (acao === 'opcoes') {
      /* Uma lista que falha não pode derrubar as outras: nem todo
         município publica tudo, e o que vier é o que a tela mostra. */
      const buscar = async (caminho: string) => {
        try {
          const r = await asaas.chamar(caminho);
          return r?.data ?? r ?? null;
        } catch {
          return null;
        }
      };

      const [municipio, servicos, nbs, situacoes, classificacoes, indicadores] = await Promise.all([
        buscar(FISCAL.opcoesDoMunicipio),
        buscar(FISCAL.servicos),
        buscar(FISCAL.nbs),
        buscar(FISCAL.situacoes),
        buscar(FISCAL.classificacoes),
        buscar(FISCAL.indicadores),
      ]);

      return json({ ok: true, municipio, servicos, nbs, situacoes, classificacoes, indicadores });
    }

    if (acao === 'salvar') {
      const f = corpo.fiscal ?? {};

      /* O que o Asaas precisa saber da conta. Os campos variam por
         município — por isso vão como vieram da tela, que os montou a
         partir de `opcoes`. */
      if (f.asaas && Object.keys(f.asaas).length > 0) {
        await asaas.chamar(FISCAL.configuracao, { metodo: 'POST', corpo: f.asaas });
      }

      const { error } = await sb
        .from('config_fiscal')
        .update({
          servico_id: f.servico_id ?? null,
          servico_codigo: f.servico_codigo ?? null,
          servico_nome: f.servico_nome ?? null,
          descricao_servico: f.descricao_servico ?? 'Mensalidade de escolinha de futebol',
          iss_percentual: f.iss_percentual ?? 0,
          retem_iss: f.retem_iss ?? false,
          nbs_codigo: f.nbs_codigo ?? null,
          situacao_tributaria: f.situacao_tributaria ?? null,
          classificacao_tributaria: f.classificacao_tributaria ?? null,
          indicador_operacao: f.indicador_operacao ?? null,
          ativo: f.ativo ?? false,
          ultimo_erro: null,
          ultimo_erro_em: null,
          configurado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        })
        .eq('escolinha_id', escolinhaId);
      if (error) throw new Error(error.message);

      return json({ ok: true });
    }

    return erro('Ação desconhecida.');
  } catch (e) {
    const mensagem = e instanceof ErroAsaas ? e.message : (e as Error).message;
    await sb
      .from('config_fiscal')
      .update({ ultimo_erro: mensagem.slice(0, 300), ultimo_erro_em: new Date().toISOString() })
      .eq('escolinha_id', escolinhaId);
    return erro(mensagem, 400);
  }
});
