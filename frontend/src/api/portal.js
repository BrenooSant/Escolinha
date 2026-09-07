import { rpc } from './cliente.js';

/* Portal do responsável: sem login, tudo a partir do token do link. */

export async function abrir(token) {
  return rpc('portal_responsavel', { p_token: token });
}

export async function avisarPagamento(token, mensalidadeId, observacao) {
  return rpc('avisar_pagamento', {
    p_token: token,
    p_mensalidade: mensalidadeId,
    p_obs: observacao || null,
  });
}
