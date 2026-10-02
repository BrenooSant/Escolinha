/* Asaas de mentira.

   Os testes do pagamento falavam com um servidor em 127.0.0.1:8899 que
   nunca existiu neste repositório — então os 17 casos do caminho do
   dinheiro nunca rodaram, em lugar nenhum. Este arquivo é esse
   servidor.

   Ele responde o mínimo que as três Edge Functions pedem, guarda o que
   recebeu para os testes conferirem, e não sabe fazer mais nada: sem
   chave de verdade, sem rede, sem dinheiro.

   Node puro de propósito — uma dependência a mais só para isto seria
   uma dependência a mais para manter.

   Uso:  node backend/testes/asaas-falso.mjs [porta] */
import { createServer } from 'node:http';

const PORTA = Number(process.argv[2] ?? process.env.PORTA ?? 8899);

/* Tudo que chegou, na ordem. Os testes leem por /__estado e olham o
   último (`.at(-1)`), então acumular é o comportamento desejado. */
const estado = { webhooks: [], clientes: [], cobrancas: [], eventos: [] };
let sequencia = 0;
const novoId = (prefixo) => `${prefixo}_${String(++sequencia).padStart(6, '0')}`;

/* A chave que o Asaas recusa, para o teste de conexão pela metade.
   Qualquer outra $aact_ passa. */
const RECUSADA = '$aact_hmlg_recusada';

const corpoDe = (req) =>
  new Promise((resolve) => {
    let bruto = '';
    req.on('data', (p) => { bruto += p; });
    req.on('end', () => {
      try { resolve(bruto ? JSON.parse(bruto) : {}); } catch { resolve({}); }
    });
  });

const responder = (res, status, corpo) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(corpo));
};

const recusar = (res, status, descricao) =>
  responder(res, status, { errors: [{ code: 'invalid', description: descricao }] });

const servidor = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  const chave = req.headers.access_token ?? '';
  const corpo = req.method === 'POST' ? await corpoDe(req) : {};

  /* Espelho para os testes — fora da autenticação de propósito: é
     ferramenta de teste, não endpoint do Asaas. */
  if (pathname === '/__estado') {
    return responder(res, 200, estado);
  }
  if (pathname === '/__zerar') {
    for (const k of Object.keys(estado)) estado[k] = [];
    return responder(res, 200, { ok: true });
  }

  // o Asaas de verdade exige a chave em tudo; imitar isso é o que faz
  // o teste de chave recusada valer alguma coisa
  if (!chave.startsWith('$aact_')) {
    return recusar(res, 401, 'Chave de API não informada.');
  }
  if (chave === RECUSADA) {
    return recusar(res, 401, 'Chave de API inválida.');
  }

  if (pathname === '/myAccount' && req.method === 'GET') {
    return responder(res, 200, {
      name: 'Escolinha Teste',
      email: 'financeiro@escolinhateste.com.br',
      walletId: 'wal_falso_0001',
      cpfCnpj: '12345678000190',
    });
  }

  if (pathname === '/webhooks' && req.method === 'POST') {
    const registro = { id: novoId('wh'), ...corpo };
    estado.webhooks.push(registro);
    return responder(res, 200, registro);
  }

  if (pathname === '/customers' && req.method === 'POST') {
    const registro = { id: novoId('cus'), ...corpo };
    estado.clientes.push(registro);
    return responder(res, 200, registro);
  }

  if (pathname === '/payments' && req.method === 'POST') {
    const id = novoId('pay');
    const registro = {
      id,
      status: 'PENDING',
      // devolve o que recebeu: é assim que o Asaas responde, e é o que
      // a função grava em asaas_cobrancas
      value: corpo.value,
      dueDate: corpo.dueDate,
      invoiceUrl: `https://falso/i/${id}`,
      bankSlipUrl: `https://falso/b/${id}`,
      ...corpo,
    };
    estado.cobrancas.push(registro);
    return responder(res, 200, registro);
  }

  const pix = pathname.match(/^\/payments\/([^/]+)\/pixQrCode$/);
  if (pix && req.method === 'GET') {
    return responder(res, 200, {
      encodedImage: 'iVBORw0KGgo=',
      payload: `PIX-FALSO-${pix[1]}`,
      expirationDate: null,
    });
  }

  return recusar(res, 404, `Rota de mentira não implementada: ${req.method} ${pathname}`);
});

/* Escuta em todas as interfaces, e não só no loopback, porque quem
   liga para cá são as Edge Functions — que rodam dentro de um
   container. Para elas o host é `host.docker.internal`, e amarrar em
   127.0.0.1 recusaria a conexão. */
servidor.listen(PORTA, () => {
  console.log(`Asaas de mentira na porta ${PORTA}`);
  console.log(`  deste computador:  http://127.0.0.1:${PORTA}`);
  console.log(`  das funções:       http://host.docker.internal:${PORTA}`);
});
