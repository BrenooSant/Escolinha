import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Sheet } from './ui.jsx';
import { Crest } from './views/Login.jsx';
import { useSessao } from './estado/Sessao.jsx';
import { usePainel } from './hooks/dados.js';
import { iniciais } from './lib/format.js';

/* ícones em traço, 24x24 — leves e nítidos em qualquer tela */
const PATHS = {
  painel: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  agenda: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  alunos: 'M16 20v-2a4 4 0 0 0-8 0v2M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35',
  chamada: 'M4 4h16v16H4zM8.5 12.2l2.4 2.4 4.6-4.9',
  financeiro: 'M3 7h18v12H3zM3 11h18M7 15h3',
  cobrancas: 'M12 3.5 2.8 19.5h18.4zM12 10v4M12 17h.01',
  matriculas: 'M12 5v14M5 12h14',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-2.72 1.13V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.79-1.07l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 3.5 14.2H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.07-2.79l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9.8 3.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.79 1.07l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.6 1.6 0 0 0 20.5 9.8h.5a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.2',
  mais: 'M5 12h.01M12 12h.01M19 12h.01',
  sair: 'M15 4h4v16h-4M11 8l-4 4 4 4M7 12h9',
  trocar: 'M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4',
};

export function Icon({ nome, className = 'size-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[nome]} />
    </svg>
  );
}

const MENU = [
  { para: '/', icone: 'painel', rotulo: 'Painel' },
  { para: '/agenda', icone: 'agenda', rotulo: 'Agenda' },
  { para: '/alunos', icone: 'alunos', rotulo: 'Alunos' },
  { para: '/chamada', icone: 'chamada', rotulo: 'Chamada' },
  { para: '/financeiro', icone: 'financeiro', rotulo: 'Financeiro' },
  { para: '/cobrancas', icone: 'cobrancas', rotulo: 'Cobranças', selo: 'devedores' },
  { para: '/matriculas', icone: 'matriculas', rotulo: 'Matrículas', selo: 'pre_matriculas' },
  { para: '/ajustes', icone: 'ajustes', rotulo: 'Ajustes' },
];

/* No celular: 4 abas fixas + "Mais". No desktop: barra lateral com tudo. */
const ABAS = ['/', '/chamada', '/alunos', '/financeiro'];
const NO_MENU = MENU.filter((m) => !ABAS.includes(m.para));

export default function Shell({ children }) {
  const [menu, setMenu] = useState(false);
  const [trocador, setTrocador] = useState(false);
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const { perfil, escolinha, escolinhas, trocarEscolinha, sair } = useSessao();
  const { data: resumo } = usePainel();

  const selos = {
    devedores: resumo?.devedores ?? 0,
    pre_matriculas: resumo?.pre_matriculas ?? 0,
  };
  const noMenuAtivo = NO_MENU.some((m) => pathname.startsWith(m.para) && m.para !== '/');
  const pendencias = selos.devedores + selos.pre_matriculas;

  const ir = (para) => {
    setMenu(false);
    navegar(para);
    window.scrollTo(0, 0);
  };

  const Selo = ({ chave, className = '' }) =>
    selos[chave] > 0 ? (
      <span className={`rounded-full bg-bad px-1.5 text-[11px] font-bold text-white ${className}`}>
        {selos[chave]}
      </span>
    ) : null;

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[230px_1fr]">
      {/* ---------- barra lateral (desktop) ---------- */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 border-r border-line bg-surface p-4 lg:flex">
        <Crest tom="escuro" className="text-[15px] text-ink" />

        <button
          onClick={() => escolinhas.length > 1 && setTrocador(true)}
          className="rounded-lg border border-line px-3 py-2 text-left transition hover:bg-surface2 disabled:cursor-default"
          disabled={escolinhas.length <= 1}
        >
          <span className="block text-[10px] font-semibold tracking-[0.12em] text-ink3 uppercase">Escolinha</span>
          <b className="mt-0.5 flex items-center gap-1.5 truncate text-[13px]">
            {escolinha?.nome}
            {escolinhas.length > 1 && <Icon nome="trocar" className="ml-auto size-3.5 shrink-0 text-ink3" />}
          </b>
        </button>

        <nav className="flex flex-col gap-0.5">
          {MENU.map((m) => (
            <NavLink
              key={m.para}
              to={m.para}
              end={m.para === '/'}
              onClick={() => window.scrollTo(0, 0)}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
                  isActive ? 'bg-accentsoft font-semibold text-accentink' : 'text-ink2 hover:bg-surface2'
                }`
              }
            >
              <Icon nome={m.icone} className="size-4.5" />
              {m.rotulo}
              {m.selo && <Selo chave={m.selo} className="ml-auto" />}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-2.5 border-t border-line pt-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface2 text-xs font-bold text-ink2">
            {iniciais(perfil?.nome)}
          </span>
          <div className="min-w-0">
            <b className="block truncate text-[13px]">{perfil?.nome || 'Professor'}</b>
            <small className="text-[11px] text-ink3">
              {escolinha?.papel === 'dono' ? 'Coordenação' : 'Professor'}
            </small>
          </div>
          <button onClick={sair} title="Sair"
            className="ml-auto rounded-lg border border-line p-2 text-ink2 hover:bg-surface2">
            <Icon nome="sair" className="size-4" />
          </button>
        </div>
      </aside>

      {/* ---------- topo (celular) ---------- */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
        <button
          onClick={() => escolinhas.length > 1 && setTrocador(true)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <Crest tom="escuro" className="!text-[15px] text-ink" />
        </button>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface2 text-xs font-bold text-ink2">
          {iniciais(perfil?.nome)}
        </span>
      </header>

      {/* ---------- conteúdo ---------- */}
      <main className="mx-auto w-full max-w-[1180px] px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-7 lg:pb-16">
        {children}
      </main>

      {/* ---------- abas de baixo (celular) ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {ABAS.map((para) => {
          const m = MENU.find((x) => x.para === para);
          return (
            <NavLink
              key={para}
              to={para}
              end={para === '/'}
              onClick={() => window.scrollTo(0, 0)}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition ${
                  isActive ? 'text-accent' : 'text-ink3'
                }`
              }
            >
              <Icon nome={m.icone} />
              {m.rotulo}
            </NavLink>
          );
        })}
        <button
          onClick={() => setMenu(true)}
          aria-current={noMenuAtivo ? 'page' : undefined}
          className={`relative flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition ${
            noMenuAtivo ? 'text-accent' : 'text-ink3'
          }`}
        >
          <Icon nome="mais" />
          Mais
          {pendencias > 0 && (
            <span className="absolute top-2.5 right-[calc(50%-1.35rem)] size-2 rounded-full bg-bad" />
          )}
        </button>
      </nav>

      {/* menu "Mais" */}
      <Sheet aberto={menu} onFechar={() => setMenu(false)} rotulo="Mais opções">
        <div className="p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {NO_MENU.map((m) => (
            <button
              key={m.para}
              onClick={() => ir(m.para)}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-4 text-left text-sm font-semibold hover:bg-surface2"
            >
              <Icon nome={m.icone} className="size-5 text-ink3" />
              {m.rotulo}
              {m.selo && <Selo chave={m.selo} className="ml-auto px-2 py-0.5" />}
            </button>
          ))}
          <hr className="my-2 border-line" />
          <button
            onClick={sair}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-4 text-left text-sm font-semibold text-ink2 hover:bg-surface2"
          >
            <Icon nome="sair" className="size-5 text-ink3" />
            Sair da conta
          </button>
        </div>
      </Sheet>

      {/* troca de escolinha, para quem cuida de mais de uma */}
      <Sheet aberto={trocador} onFechar={() => setTrocador(false)} rotulo="Trocar de escolinha">
        <div className="p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <p className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-[0.14em] text-ink3 uppercase">
            Suas escolinhas
          </p>
          {escolinhas.map((e) => (
            <button
              key={e.id}
              onClick={() => {
                trocarEscolinha(e.id);
                setTrocador(false);
                ir('/');
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold hover:bg-surface2 ${
                e.id === escolinha?.id ? 'text-accent' : ''
              }`}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accentsoft text-xs font-bold text-accentink">
                {iniciais(e.nome)}
              </span>
              <span className="min-w-0">
                <b className="block truncate">{e.nome}</b>
                <small className="text-[11px] font-normal text-ink3">{e.cidade || 'Sem cidade'}</small>
              </span>
              {e.id === escolinha?.id && <span className="ml-auto">✓</span>}
            </button>
          ))}
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
