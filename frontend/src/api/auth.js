import { supabase, mensagemDeErro } from '../lib/supabase.js';
import { exec, rpc } from './cliente.js';

const falhar = (erro) => {
  throw new Error(mensagemDeErro(erro));
};

export async function sessaoAtual() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export function aoMudarSessao(callback) {
  const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => callback(sessao));
  return () => data.subscription.unsubscribe();
}

export async function entrar({ email, senha }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) falhar(error);
  return data.session;
}

/* Cadastro: cria a conta e, em seguida, a escolinha. As duas coisas são
   separadas de propósito — a escolinha nasce por RPC, que já registra o
   dono e as turmas iniciais. Se o projeto exigir confirmação de e-mail,
   não há sessão ainda e a criação fica para o primeiro login. */
export async function cadastrar({ email, senha, nome, escolinha, cidade }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: { data: { nome, escolinha_pendente: escolinha, cidade_pendente: cidade || null } },
  });
  if (error) falhar(error);

  if (!data.session) return { confirmarEmail: true };

  await rpc('criar_escolinha', { p_nome: escolinha, p_cidade: cidade || null });
  return { confirmarEmail: false };
}

/* Chamado no primeiro login de quem se cadastrou com confirmação de
   e-mail ligada e ainda não tem escolinha nenhuma. */
export async function criarEscolinha({ nome, cidade }) {
  return rpc('criar_escolinha', { p_nome: nome, p_cidade: cidade || null });
}

export async function sair() {
  await supabase.auth.signOut();
}

export async function recuperarSenha(email, redirectTo) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) falhar(error);
}

export async function trocarSenha(novaSenha) {
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) falhar(error);
}

export async function meuPerfil() {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return null;
  const perfil = await exec(
    supabase.from('perfis').select('id, nome, telefone').eq('id', data.user.id).maybeSingle()
  );
  return perfil ? { ...perfil, email: data.user.email } : null;
}

export async function salvarPerfil({ nome, telefone }) {
  const { data } = await supabase.auth.getUser();
  return exec(
    supabase.from('perfis').update({ nome, telefone }).eq('id', data.user.id).select().single()
  );
}
