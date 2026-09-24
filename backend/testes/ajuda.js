/* Apoio dos testes de integração.
   Nada de mock: as regras que importam moram no Postgres (RLS, funções,
   políticas do Storage) e só valem alguma coisa se forem exercitadas
   contra um banco de verdade. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const aqui = dirname(fileURLToPath(import.meta.url));

function lerEnv(caminho) {
  if (!existsSync(caminho)) return {};
  return Object.fromEntries(
    readFileSync(caminho, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
}

/* Procura na ordem: ambiente, .env daqui, .env do front. O último é o
   caso comum — é o mesmo projeto, e a anon key é pública por desenho. */
const doArquivo = {
  ...lerEnv(resolve(aqui, '../../frontend/.env')),
  ...lerEnv(resolve(aqui, '.env')),
};

const pega = (...nomes) => {
  for (const n of nomes) {
    const v = process.env[n] ?? doArquivo[n];
    if (v) return v;
  }
  return null;
};

export const URL_SUPABASE = pega('SUPABASE_URL', 'VITE_SUPABASE_URL');
export const ANON_KEY = pega('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');

export const configurado = Boolean(URL_SUPABASE && ANON_KEY);

/* Sem chave, a suíte é pulada em vez de falhar: é o que deixa o projeto
   rodar num clone qualquer, sem conta no Supabase.

   Em CI essa gentileza vira mentira. O job passa em treze segundos sem
   ter executado um único teste, e o check verde ao lado do pull request
   diz que a RLS foi conferida quando ninguém conferiu nada. Foi o que
   aconteceu aqui desde o primeiro dia: `14 skipped (14)`, sempre verde.

   Então lá, faltar chave é erro. Na máquina de quem clonou, continua
   sendo só um pulo. */
if (!configurado && process.env.CI) {
  throw new Error(
    'Testes de integração sem chave do Supabase.\n' +
      'Em CI eles não podem ser pulados — um check verde que não rodou nada\n' +
      'é pior que um vermelho. Cadastre os secrets do repositório:\n' +
      '  VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY\n' +
      '(e, se quiser contas de teste próprias, TESTE_EMAIL, TESTE_EMAIL_2 e TESTE_SENHA).'
  );
}

const CONTAS = {
  dono: pega('TESTE_EMAIL') ?? 'escolinha.teste.claude@gmail.com',
  colega: pega('TESTE_EMAIL_2') ?? 'escolinha.teste2.claude@gmail.com',
};
const SENHA = pega('TESTE_SENHA') ?? 'escolinha-teste-2026';

export function clienteAnonimo() {
  return createClient(URL_SUPABASE, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* As contas são fixas e reaproveitadas entre rodadas: criar uma conta
   nova a cada execução encheria o Authentication de lixo e esbarraria no
   limite de e-mails do projeto. */
export async function entrar(qual = 'dono') {
  const email = CONTAS[qual];
  const sb = clienteAnonimo();

  const login = await sb.auth.signInWithPassword({ email, password: SENHA });
  if (!login.error) return sb;

  const cadastro = await sb.auth.signUp({
    email,
    password: SENHA,
    options: { data: { nome: qual === 'dono' ? 'Professor de Teste' : 'Colega de Teste' } },
  });

  if (cadastro.error) {
    throw new Error(
      `Não deu para entrar nem criar ${email}: ${cadastro.error.message}\n` +
        'Crie a conta à mão no painel do Supabase, ou desligue a confirmação de e-mail.'
    );
  }
  if (!cadastro.data.session) {
    throw new Error(
      `A conta ${email} foi criada mas exige confirmação de e-mail.\n` +
        'Confirme-a uma vez (ou desligue a confirmação) e rode os testes de novo.'
    );
  }
  return sb;
}

export async function idDoUsuario(sb) {
  const { data } = await sb.auth.getUser();
  return data.user.id;
}

/* Escolinha descartável. O nome carrega a marca dos testes para dar
   para varrer sobras à mão, se alguma execução morrer no meio. */
export async function novaEscolinha(sb, apelido = 'geral') {
  const nome = `[teste] ${apelido} ${Date.now().toString(36)}`;
  const { data: id, error } = await sb.rpc('criar_escolinha', {
    p_nome: nome,
    p_cidade: 'Goiânia, GO',
  });
  if (error) throw new Error('criar_escolinha: ' + error.message);

  const { data: turmas } = await sb.from('vw_turmas').select('*').eq('escolinha_id', id).order('ordem');
  const { data: escolinha } = await sb.from('escolinhas').select('*').eq('id', id).single();

  return { id, nome, turmas, escolinha };
}

/* Apagar a escolinha leva tudo em cascata. Confirma que sumiu mesmo:
   a RLS faz um delete sem permissão devolver zero linhas sem erro, e um
   teste que "limpa" em silêncio deixa lixo acumulando no projeto. */
export async function apagarEscolinha(sb, id) {
  if (!id) return;
  const { data, error } = await sb.from('escolinhas').delete().eq('id', id).select('id');
  if (error) throw new Error('limpeza falhou: ' + error.message);
  if (!data?.length) throw new Error(`limpeza não apagou a escolinha ${id} (sem permissão?)`);
}

/* Atalhos usados por vários arquivos. */
export async function novoAluno(sb, { escolinhaId, turmaId, nome = 'Atleta de Teste', numero, ...resto }) {
  const { data, error } = await sb
    .from('alunos')
    .insert({ escolinha_id: escolinhaId, turma_id: turmaId, nome, numero, ...resto })
    .select()
    .single();
  if (error) throw new Error('novoAluno: ' + error.message);
  return data;
}

export async function novoResponsavel(sb, { escolinhaId, nome = 'Responsável de Teste', telefone }) {
  const { data, error } = await sb
    .from('responsaveis')
    .insert({ escolinha_id: escolinhaId, nome, parentesco: 'Mãe', telefone })
    // explícito: `token` não sai no select direto (ver token_responsavel)
    .select('id, escolinha_id, nome, parentesco, telefone, email')
    .single();
  if (error) throw new Error('novoResponsavel: ' + error.message);
  return data;
}

export async function novoTreino(sb, { escolinhaId, turmaId, data: dia = hoje(), hora = '18:00', ...resto }) {
  const { data, error } = await sb
    .from('treinos')
    .insert({ escolinha_id: escolinhaId, turma_id: turmaId, data: dia, hora, ...resto })
    .select()
    .single();
  if (error) throw new Error('novoTreino: ' + error.message);
  return data;
}

export const hoje = () => new Date().toISOString().slice(0, 10);
export const emDias = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

/* PNG de 1x1, para os testes de Storage. */
export const pngMinimo = () =>
  Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
    (c) => c.charCodeAt(0)
  );
