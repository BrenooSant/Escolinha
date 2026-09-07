import { supabase } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

export async function membros(escolinhaId) {
  return exec(
    supabase
      .from('membros')
      .select('papel, criado_em, perfil:perfis(id, nome, telefone)')
      .eq('escolinha_id', escolinhaId)
      .order('criado_em')
  );
}

export async function trocarPapel(escolinhaId, perfilId, papel) {
  return exec(
    supabase
      .from('membros')
      .update({ papel })
      .eq('escolinha_id', escolinhaId)
      .eq('perfil_id', perfilId)
      .select()
      .single()
  );
}

export async function remover(escolinhaId, perfilId) {
  return exec(
    supabase.from('membros').delete().eq('escolinha_id', escolinhaId).eq('perfil_id', perfilId)
  );
}

/* ---------- convites ---------- */

export async function convites(escolinhaId) {
  return exec(
    supabase
      .from('convites')
      .select('*')
      .eq('escolinha_id', escolinhaId)
      .is('aceito_em', null)
      .order('criado_em', { ascending: false })
  );
}

export async function convidar(escolinhaId, { email, papel = 'professor' }) {
  const { data: sessao } = await supabase.auth.getUser();
  return exec(
    supabase
      .from('convites')
      .insert({
        escolinha_id: escolinhaId,
        email: email || null,
        papel,
        criado_por: sessao?.user?.id ?? null,
      })
      .select()
      .single()
  );
}

export async function cancelarConvite(id) {
  return exec(supabase.from('convites').delete().eq('id', id));
}

export async function lerConvite(token) {
  return rpc('convite_por_token', { p_token: token });
}

export async function aceitarConvite(token) {
  return rpc('aceitar_convite', { p_token: token });
}
