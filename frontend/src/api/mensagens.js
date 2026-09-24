import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

/* Fila e modelos são do gestor, pela RLS: a mensagem carrega valor de
   mensalidade e telefone de responsável. */

export async function fila(escolinhaId, { status = 'pendente', limite = 200 } = {}) {
  let q = supabase.from('vw_fila_mensagens').select('*').eq('escolinha_id', escolinhaId);
  if (status) q = q.eq('status', status);
  return exec(q.order('agendada_para', { ascending: false }).order('criado_em').limit(limite));
}

export async function modelos(escolinhaId) {
  return exec(
    supabase.from('modelos_mensagem').select('*').eq('escolinha_id', escolinhaId).order('tipo')
  );
}

export async function salvarModelo(escolinhaId, tipo, dados) {
  return exec(
    supabase
      .from('modelos_mensagem')
      .update({ ...dados, atualizado_em: new Date().toISOString() })
      .eq('escolinha_id', escolinhaId)
      .eq('tipo', tipo)
      .select()
      .single()
  );
}

/* O mesmo que a rotina das 7h faz, para quem não quer esperar até
   amanhã — e para quando o pg_cron não estiver ligado. Rodar de novo
   no mesmo dia não duplica nada. */
export async function montarAgora(escolinhaId) {
  return rpc('montar_fila', { p_escolinha: escolinhaId });
}

/* O gestor pode ajustar o texto antes de mandar. Guardar a versão
   ajustada importa: é ela que `marcar_enviada` copia para o histórico
   de lembretes da cobrança. */
export async function salvarTexto(id, texto) {
  const linhas = await exec(
    supabase.from('fila_mensagens').update({ texto }).eq('id', id).select('id')
  );
  if (!linhas?.length) {
    throw new Error('Só o gestor mexe na fila de mensagens.');
  }
  return linhas[0];
}

export async function marcarEnviada(id) {
  return rpc('marcar_enviada', { p_id: id });
}

export async function dispensar(id) {
  const linhas = await exec(
    supabase.from('fila_mensagens').update({ status: 'dispensada' }).eq('id', id).select('id')
  );
  if (!linhas?.length) {
    throw new Error('Só o gestor mexe na fila de mensagens.');
  }
  return linhas[0];
}
