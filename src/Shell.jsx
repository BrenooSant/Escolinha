import { useState } from 'react';
import { Sheet } from './ui.jsx';
import { Crest } from './views/Login.jsx';

/* ícones em traço, 24x24 — leves e nítidos em qualquer tela */
const PATHS = {
  painel: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  agenda: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  alunos: 'M16 20v-2a4 4 0 0 0-8 0v2M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35',
  presenca: 'M4 4h16v16H4zM8.5 12.2l2.4 2.4 4.6-4.9',
  financeiro: 'M3 7h18v12H3zM3 11h18M7 15h3',
  cobrancas: 'M12 3.5 2.8 19.5h18.4zM12 10v4M12 17h.01',
  mais: 'M5 12h.01M12 12h.01M19 12h.01',
  sair: 'M15 4h4v16h-4M11 8l-4 4 4 4M7 12h9',
};

export function Icon({ nome, className = 'size-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[nome]} />
    </svg>
  );
}

const VIEWS = {
  painel: 'Painel',
  agenda: 'Agenda',
  alunos: 'Alunos',
  presenca: 'Chamada',
  financeiro: 'Financeiro',
  cobrancas: 'Cobranças',
};

/* No celular: 4 abas fixas + "Mais". No desktop: barra lateral com tudo. */
const ABAS = ['painel', 'presenca', 'alunos', 'financeiro'];
const NO_MENU = ['agenda', 'cobrancas'];

export default function Shell({ view, irPara, devedores, onSair, children }) {
  const [menu, setMenu] = useState(false);

  const abrir = (v) => {
    setMenu(false);
    irPara(v);
  };

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[230px_1fr]">
      {/* ---------- barra lateral (desktop) ---------- */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-surface p-4 lg:flex">
        <Crest tom="escuro" className="text-[15px] text-ink" />
        <nav className="flex flex-col gap-0.5">
          {Object.entries(VIEWS).map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => irPara(v)}
              aria-current={view === v ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
                view === v ? 'bg-accentsoft font-semibold text-accentink' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              <Icon nome={v} className="size-4.5" />
              {rotulo}
              {v === 'cobrancas' && devedores > 0 && (
                <span className="ml-auto rounded-full bg-bad px-1.5 text-[11px] font-bold text-white">
                  {devedores}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t border-line pt-4">
          <span className="grid size-8 place-items-center rounded-full bg-surface2 text-xs font-bold text-ink2">RM</span>
          <div className="min-w-0">
            <b className="block truncate text-[13px]">Prof. Ricardo</b>
            <small className="text-[11px] text-ink3">Coordenação</small>
          </div>
          <button onClick={onSair} title="Sair"
            className="ml-auto rounded-lg border border-line p-2 text-ink2 hover:bg-surface2">
            <Icon nome="sair" className="size-4" />
          </button>
        </div>
      </aside>

      {/* ---------- topo (celular) ---------- */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
        <Crest tom="escuro" className="text-[15px] text-ink" />
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface2 text-xs font-bold text-ink2">
          RM
        </span>
      </header>

      {/* ---------- conteúdo ---------- */}
      <main className="mx-auto w-full max-w-[1180px] px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-7 lg:pb-16">
        {children}
      </main>

      {/* ---------- abas de baixo (celular) ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {ABAS.map((v) => (
          <button
            key={v}
            onClick={() => irPara(v)}
            aria-current={view === v ? 'page' : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition ${
              view === v ? 'text-accent' : 'text-ink3'
            }`}
          >
            <Icon nome={v} />
            {VIEWS[v]}
          </button>
        ))}
        <button
          onClick={() => setMenu(true)}
          aria-current={NO_MENU.includes(view) ? 'page' : undefined}
          className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition ${
            NO_MENU.includes(view) ? 'text-accent' : 'text-ink3'
          }`}
        >
          <Icon nome="mais" />
          Mais
          {devedores > 0 && (
            <span className="absolute top-2.5 right-[calc(50%-1.35rem)] size-2 rounded-full bg-bad" />
          )}
        </button>
      </nav>

      {/* menu "Mais" */}
      <Sheet aberto={menu} onFechar={() => setMenu(false)} rotulo="Mais opções">
        <div className="p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {NO_MENU.map((v) => (
            <button
              key={v}
              onClick={() => abrir(v)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-4 text-left text-sm font-semibold hover:bg-surface2"
            >
              <Icon nome={v} className="size-5 text-ink3" />
              {v === 'agenda' ? 'Agenda de treinos' : 'Cobranças'}
              {v === 'cobrancas' && devedores > 0 && (
                <span className="ml-auto rounded-full bg-bad px-2 py-0.5 text-[11px] font-bold text-white">
                  {devedores}
                </span>
              )}
            </button>
          ))}
          <hr className="my-2 border-line" />
          <button
            onClick={onSair}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-4 text-left text-sm font-semibold text-ink2 hover:bg-surface2"
          >
            <Icon nome="sair" className="size-5 text-ink3" />
            Sair da conta
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/* cabeçalho de página, reaproveitado por todas as telas */
export function PageHead({ titulo, sub, children }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-2xl leading-tight sm:text-[29px]">{titulo}</h2>
        {sub && <p className="mt-1 text-[13px] text-ink3">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{children}</div>}
    </div>
  );
}
