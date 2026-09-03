import { useState } from 'react';
import { Btn, Field, Input } from '../ui.jsx';

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

export default function Login({ onEntrar }) {
  const [cadastro, setCadastro] = useState(false);

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
        <div className="relative mt-6 grid grid-cols-3 gap-4 border-t border-[#EFF6F0]/20 pt-4 lg:mt-0 lg:flex lg:gap-8 lg:pt-5">
          {[['20', 'Atletas'], ['4', 'Categorias'], ['6', 'Treinos/semana']].map(([n, l]) => (
            <div key={l}>
              <b className="tnum block font-display text-xl font-semibold lg:text-2xl">{n}</b>
              <span className="text-[10px] tracking-[0.12em] text-[#B9D5C3] uppercase lg:text-[11px]">{l}</span>
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
                onClick={() => setCadastro(modo)}
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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onEntrar(cadastro);
            }}
            className="space-y-3.5"
          >
            {cadastro && (
              <>
                <Field label="Nome do responsável técnico">
                  <Input placeholder="Prof. Ricardo Menezes" autoComplete="name" />
                </Field>
                <Field label="Nome da escolinha">
                  <Input placeholder="Craque do Amanhã" />
                </Field>
              </>
            )}
            <Field label="E-mail">
              <Input type="email" placeholder="professor@craquedoamanha.com.br" autoComplete="email" />
            </Field>
            <Field label="Senha">
              <Input type="password" placeholder="••••••••" autoComplete="current-password" />
            </Field>
            <Btn type="submit" className="w-full">
              {cadastro ? 'Criar conta e entrar' : 'Entrar no painel'}
            </Btn>
          </form>

          <p className="mt-4 text-center text-xs text-ink3">Demonstração visual — qualquer clique já entra.</p>
        </div>
      </div>
    </div>
  );
}
