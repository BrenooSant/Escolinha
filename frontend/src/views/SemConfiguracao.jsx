/* Aparece quando o build não recebeu as variáveis do Supabase. Sem elas
   nada funciona, então vale uma tela explicando o que falta em vez de
   uma sequência de erros de rede. */
export default function SemConfiguracao() {
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6">
        <span className="text-3xl" aria-hidden="true">🔌</span>
        <h1 className="mt-3 text-2xl">Falta conectar o Supabase</h1>
        <p className="mt-2 text-[13px] text-ink3">
          Crie um arquivo <code className="rounded bg-surface2 px-1">frontend/.env</code> a partir do{' '}
          <code className="rounded bg-surface2 px-1">.env.example</code> e preencha:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-surface2 p-3 text-[12px] leading-relaxed">
{`VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}
        </pre>
        <p className="mt-3 text-[13px] text-ink3">
          Depois rode <code className="rounded bg-surface2 px-1">npm run dev</code> de novo — o Vite só
          lê o <code className="rounded bg-surface2 px-1">.env</code> na inicialização.
        </p>
        <p className="mt-3 text-[12px] text-ink3">
          No GitHub Pages, as mesmas duas variáveis precisam existir como secrets do repositório.
        </p>
      </div>
    </div>
  );
}
