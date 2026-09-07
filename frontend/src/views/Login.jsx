import { useState } from 'react';
import { Alerta, Btn, Field, Input, useToast } from '../ui.jsx';
import * as apiAuth from '../api/auth.js';
import { useSessao } from '../estado/Sessao.jsx';

function Campo({ children }) {
  return <svg viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"
    className="pointer-events-none absolute inset-0 size-full opacity-50">
    <g fill="none" stroke="#EFF6F0" strokeWidth="2" opacity=".45">
      <rect x="24" y="24" width="352" height="552" />
      <line x1="24" y1="300" x2="376" y2="300" />
      <circle cx="200" cy="300" r="66" />
      <rect x="104" y="24" width="192" height="86" />
      <rect x="152" y="24" width="96" height="38" />
      <rect x="104" y="490" width="192" height="86" />
      <rect x="152" y="538" width="96" height="38" />
    </g>
    {children}
  </svg>;
}

export function Crest({ className = '', tom = 'claro' }) {
  return (
    <div className={`flex items-center gap-2.5 font-display text-lg tracking-wider uppercase ${className}`}>
      <span
        className={`grid size-7 shrink-0 place-items-center rounded-full text-base font-bold ${
          tom === 'claro' ? 'bg-[#EFF6F0] text-accentink' : 'bg-accent text-white'
        }`}
      >
        ⚽
      </span>
      Craque do Amanhã
    </div>
  );
}

const DESTAQUES = [
  ['Chamada', 'marcada no celular, à beira do campo'],
  ['Mensalidade', 'quem pagou, quem atrasou, quanto entrou'],
  ['Matrícula', 'um link só para os pais preencherem a ficha'],
];

export default function Login() {
  const toast = useToast();
  const { recarregar, trocarEscolinha } = useSessao();
  const [cadastro, setCadastro] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setEnviando(true);

    const f = new FormData(e.currentTarget);
    try {
      if (cadastro) {
        const r = await apiAuth.cadastrar({
          email: f.get('email').trim(),
          senha: f.get('senha'),
          nome: f.get('nome').trim(),
          escolinha: f.get('escolinha').trim(),
          cidade: f.get('cidade').trim(),
        });
        if (r.confirmarEmail) {
          setAviso('Conta criada. Confirme o e-mail que enviamos e depois entre por aqui.');
          setCadastro(false);
        } else {
          // O provedor já leu a sessão antes da escolinha existir; sem
          // este recarregar, o app cai na tela de "crie a sua escolinha"
          // e o professor acaba criando uma segunda.
          await recarregar();
          if (r.escolinhaId) trocarEscolinha(r.escolinhaId);
          toast('Escolinha criada — bem-vindo!');
        }
      } else {
        await apiAuth.entrar({ email: f.get('email').trim(), senha: f.get('senha') });
      }
      // no login comum a sessão nova é captada pelo ProvedorSessao
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  const esqueci = async () => {
    const email = document.querySelector('input[name="email"]')?.value.trim();
    if (!email) return setErro('Escreva o e-mail no campo acima e clique de novo.');
    try {
      await apiAuth.recuperarSenha(email, window.location.origin + window.location.pathname);
      setErro(null);
      setAviso('Link de troca de senha enviado para ' + email + '.');
    } catch (err) {
      setErro(err.message);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_0.95fr]">
      {/* faixa verde: cabeçalho curto no celular, painel inteiro no desktop */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-accent px-6 py-7 text-[#EFF6F0] lg:px-11 lg:py-10">
        <Campo />
        <div className="relative flex items-center justify-between gap-4">
          <Crest />
        </div>
        <div className="relative mt-6 lg:mt-0">
          <h1 className="max-w-[11ch] text-3xl leading-none font-bold text-balance sm:text-4xl lg:text-[clamp(34px,4.4vw,54px)]">
            A escolinha inteira numa tela só.
          </h1>
          <p className="mt-3 max-w-[34ch] text-sm text-[#CFE3D6] lg:mt-4">
            Chamada do treino, mensalidades e cobrança dos responsáveis — sem caderno, sem planilha.
          </p>
        </div>
        <div className="relative mt-6 grid gap-3 border-t border-[#EFF6F0]/20 pt-4 sm:grid-cols-3 lg:mt-0 lg:pt-5">
          {DESTAQUES.map(([titulo, texto]) => (
            <div key={titulo}>
              <b className="block font-display text-[15px] font-semibold tracking-wide uppercase">{titulo}</b>
              <span className="text-[11.5px] leading-snug text-[#B9D5C3]">{texto}</span>
            </div>
          ))}
        </div>
      </div>

      {/* formulário */}
      <div className="grid place-items-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-[360px]">
          <div role="tablist" className="mb-6 flex gap-0.5 rounded-xl bg-surface2 p-1">
            {[['Entrar', false], ['Registre-se', true]].map(([rot, modo]) => (
              <button
                key={rot}
                role="tab"
                aria-selected={cadastro === modo}
                onClick={() => { setCadastro(modo); setErro(null); setAviso(null); }}
                className={`min-h-11 flex-1 rounded-lg text-[13px] font-semibold transition ${
                  cadastro === modo ? 'bg-surface text-ink shadow-sm' : 'text-ink2'
                }`}
              >
                {rot}
              </button>
            ))}
          </div>

          <h2 className="text-2xl">{cadastro ? 'Crie a sua escolinha' : 'Bom treino, professor'}</h2>
          <p className="mt-1 mb-5 text-[13px] text-ink3">
            {cadastro ? 'Leva menos de um minuto para começar.' : 'Acesse o painel da escolinha.'}
          </p>

          <form onSubmit={enviar} className="space-y-3.5">
            {cadastro && (
              <>
                <Field label="Seu nome">
                  <Input name="nome" required minLength={2} placeholder="Ricardo Menezes" autoComplete="name" />
                </Field>
                <Field label="Nome da escolinha">
                  <Input name="escolinha" required minLength={2} placeholder="Craque do Amanhã" />
                </Field>
                <Field label="Cidade">
                  <Input name="cidade" placeholder="Goiânia, GO" autoComplete="address-level2" />
                </Field>
              </>
            )}
            <Field label="E-mail">
              <Input name="email" type="email" required placeholder="professor@craquedoamanha.com.br" autoComplete="email" />
            </Field>
            <Field label="Senha" dica={cadastro ? 'Mínimo de 6 caracteres.' : null}>
              <Input
                name="senha"
                type="password"
                required
                minLength={6}
                placeholder="••••••••"
                autoComplete={cadastro ? 'new-password' : 'current-password'}
              />
            </Field>

            <Alerta>{erro}</Alerta>
            <Alerta tom="ok">{aviso}</Alerta>

            <Btn type="submit" className="w-full" carregando={enviando}>
              {cadastro ? 'Criar conta e entrar' : 'Entrar no painel'}
            </Btn>
          </form>

          {!cadastro && (
            <button onClick={esqueci} className="mt-3.5 block w-full text-center text-xs font-semibold text-ink3 hover:text-accent">
              Esqueci minha senha
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
