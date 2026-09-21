/* Cliente do Asaas e utilidades que as três funções usam.

   A chave da escolinha nunca sai do servidor: ela é lida de
   `asaas_segredo`, uma tabela sem policy nenhuma, com a chave de
   serviço. */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

export const erro = (mensagem: string, status = 400) => json({ erro: mensagem }, status);

/* Chave de sandbox começa com $aact_hmlg_ e a de produção com
   $aact_prod_. Conferir isso aqui evita o erro mais comum da
   integração: chave de um ambiente com o endereço do outro. */
export const ambienteDaChave = (chave: string): 'sandbox' | 'producao' | null => {
  const c = chave.trim();
  if (c.startsWith('$aact_hmlg_')) return 'sandbox';
  if (c.startsWith('$aact_prod_')) return 'producao';
  return null;
};

/* Os endereços podem ser trocados por variável de ambiente: é assim
   que os testes rodam contra um Asaas de mentira, sem chave de verdade
   e sem tocar em dinheiro. */
const BASE = {
  sandbox: Deno.env.get('ASAAS_URL_SANDBOX') ?? 'https://api-sandbox.asaas.com/v3',
  producao: Deno.env.get('ASAAS_URL_PRODUCAO') ?? 'https://api.asaas.com/v3',
};

export class Asaas {
  constructor(private chave: string, private ambiente: 'sandbox' | 'producao') {}

  async chamar(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}) {
    const resposta = await fetch(`${BASE[this.ambiente]}${caminho}`, {
      method: opcoes.metodo ?? 'GET',
      headers: {
        access_token: this.chave,
        'Content-Type': 'application/json',
        // o Asaas pede um User-Agent que identifique a aplicação
        'User-Agent': 'Escolinha',
      },
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
    });

    const texto = await resposta.text();
    const dados = texto ? JSON.parse(texto) : null;

    if (!resposta.ok) {
      const descricao = dados?.errors?.[0]?.description ?? `Asaas respondeu ${resposta.status}`;
      throw new ErroAsaas(descricao, resposta.status, dados);
    }
    return dados;
  }
}

export class ErroAsaas extends Error {
  constructor(mensagem: string, public status: number, public dados: unknown) {
    super(mensagem);
  }
}

export const servidor = (): SupabaseClient =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

/* A conta conectada da escolinha, com a chave. Devolve null quando a
   escolinha ainda não conectou. */
export async function contaDaEscolinha(sb: SupabaseClient, escolinhaId: string) {
  const { data: conta } = await sb.from('asaas_conta').select('*').eq('escolinha_id', escolinhaId).maybeSingle();
  if (!conta) return null;
  const { data: segredo } = await sb
    .from('asaas_segredo').select('api_key').eq('escolinha_id', escolinhaId).maybeSingle();
  if (!segredo) return null;
  return { conta, asaas: new Asaas(segredo.api_key, conta.ambiente) };
}

/* Guarda o que deu errado para a tela do gestor poder mostrar. */
export async function anotarErro(sb: SupabaseClient, escolinhaId: string, mensagem: string) {
  await sb
    .from('asaas_conta')
    .update({ ultimo_erro: mensagem.slice(0, 300), ultimo_erro_em: new Date().toISOString() })
    .eq('escolinha_id', escolinhaId);
}

export const emReais = (centavos: number) => Number((centavos / 100).toFixed(2));
export const emCentavos = (reais: number) => Math.round(Number(reais) * 100);
export const soDigitos = (t: string) => (t ?? '').replace(/\D/g, '');
