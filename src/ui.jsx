import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ---------------- tags e cores ---------------- */
const TOM = {
  ok: 'bg-okbg text-ok',
  warn: 'bg-warnbg text-warn',
  bad: 'bg-badbg text-bad',
  neutro: 'bg-surface2 text-ink2',
};

export function Tag({ tom = 'neutro', children, className = '' }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TOM[tom]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Eyebrow({ children, className = '' }) {
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] text-ink3 ${className}`}>
      {children}
    </span>
  );
}

/* ---------------- botões ---------------- */
export function Btn({ variante = 'cheio', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 min-h-11 sm:min-h-9 text-[13px] font-semibold transition disabled:opacity-50';
  const estilo =
    variante === 'ghost'
      ? 'border border-line text-ink2 hover:bg-surface2'
      : 'bg-accent text-white hover:brightness-110';
  return <button className={`${base} ${estilo} ${className}`} {...props} />;
}

/* ---------------- caixas ---------------- */
export function Panel({ titulo, extra, children, className = '', corpo = false }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-line bg-surface ${className}`}>
      {(titulo || extra) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {typeof titulo === 'string' ? <h3 className="text-base">{titulo}</h3> : titulo}
          {extra}
        </header>
      )}
      <div className={corpo ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Tile({ rotulo, valor, nota, alerta = false, cor }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3 sm:p-4">
      <Eyebrow className="block leading-tight">{rotulo}</Eyebrow>
      <b
        className={`tnum mt-1.5 block font-display text-2xl leading-tight font-semibold sm:text-3xl ${
          cor || (alerta ? 'text-bad' : '')
        }`}
      >
        {valor}
      </b>
      {nota && <small className="text-xs text-ink3">{nota}</small>}
    </div>
  );
}

export function Jersey({ num, tamanho = 'md' }) {
  const t = {
    sm: 'size-8 text-sm rounded-lg',
    md: 'size-9 text-base rounded-lg',
    lg: 'size-13 text-2xl rounded-xl',
  }[tamanho];
  return (
    <span
      className={`${t} grid shrink-0 place-items-center bg-accentsoft font-display font-semibold text-accentink`}
    >
      {num}
    </span>
  );
}

/* ---------------- chips de filtro ---------------- */
export function Chips({ opcoes, valor, onChange, className = '' }) {
  return (
    <div className={`no-bar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 ${className}`}>
      {opcoes.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === valor}
          onClick={() => onChange(o)}
          className={`flex min-h-10 shrink-0 items-center rounded-full border px-4 text-xs font-semibold transition ${
            o === valor
              ? 'border-ink bg-ink text-ground'
              : 'border-line text-ink2 hover:bg-surface2'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/* ---------------- barra de progresso ---------------- */
export function Barra({ fatias, className = '' }) {
  return (
    <div className={`flex h-1.5 overflow-hidden rounded-full bg-surface2 ${className}`}>
      {fatias.map((f, i) => (
        <i key={i} className={`block h-full transition-[width] duration-300 ${f.cor}`} style={{ width: `${f.pct}%` }} />
      ))}
    </div>
  );
}

/* ---------------- campos de formulário ---------------- */
const campoBase =
  'w-full rounded-lg border bg-surface px-3 py-2.5 text-ink placeholder:text-ink3 disabled:bg-surface2 disabled:text-ink2';

export function Field({ label, erro, dica, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-ink2">{label}</span>
      {children}
      {erro && <span className="mt-1 block text-[11px] font-semibold text-bad">{erro}</span>}
      {dica && !erro && <span className="mt-1 block text-[11px] text-ink3">{dica}</span>}
    </label>
  );
}

export function Input({ erro, className = '', ...props }) {
  return <input className={`${campoBase} ${erro ? 'border-bad' : 'border-line'} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${campoBase} border-line ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`${campoBase} border-line resize-y leading-relaxed ${className}`} {...props} />;
}

/* ---------------- folha / diálogo ---------------- */
/* No celular sobe de baixo e ocupa a largura toda; no desktop vira um
   diálogo centrado. Fecha no Esc, no clique fora e trava o scroll do fundo. */
export function Sheet({ aberto, onFechar, children, largura = 'max-w-lg', rotulo }) {
  const fundo = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const esc = (e) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', esc);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = antes;
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div
      ref={fundo}
      onMouseDown={(e) => e.target === fundo.current && onFechar()}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center sm:p-5"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:max-h-[88vh] sm:rounded-2xl ${largura}`}
      >
        {/* alcinha de arrastar, só no celular */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <span className="h-1 w-10 rounded-full bg-line" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function SheetFoot({ children }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:pb-4">
      {children}
    </div>
  );
}

/* ---------------- toast ---------------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const timer = useRef();

  const toast = useCallback((texto) => {
    clearTimeout(timer.current);
    setMsg({ texto, id: Date.now() });
    timer.current = setTimeout(() => setMsg(null), 2800);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {msg && (
        <div
          role="status"
          key={msg.id}
          className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-60 mx-auto max-w-sm rounded-full bg-ink px-5 py-3 text-center text-[13px] font-semibold text-ground shadow-xl lg:bottom-7"
        >
          {msg.texto}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
