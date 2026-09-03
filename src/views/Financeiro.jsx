import { Btn, Panel, Tag, Tile, useToast } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { CATEGORIAS, LANCAMENTOS, MENS, MESES, SAIDAS, TETO_GRAFICO, brl } from '../data.js';

export default function Financeiro({ alunos, resumo }) {
  const toast = useToast();

  return (
    <>
      <PageHead titulo="Financeiro" sub="Balanço de abril a setembro de 2026">
        <Btn variante="ghost" onClick={() => toast('Relatório exportado')}>Exportar relatório</Btn>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Tile rotulo="Entradas no mês" valor={brl(resumo.entradas)} nota="mensalidades + uniformes" cor="text-ok" />
        <Tile rotulo="Saídas no mês" valor={brl(SAIDAS)} nota="campo, material, arbitragem" />
        <Tile rotulo="Saldo" valor={brl(resumo.entradas - SAIDAS)} nota="+18% sobre agosto" />
        <Tile rotulo="A receber" valor={brl(resumo.aberto)} nota={`${alunos.length - resumo.pagas} mensalidades em aberto`} alerta />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel titulo="Entradas x saídas" extra={<Tag>R$ mil</Tag>} corpo>
          <div className="grid h-44 grid-cols-6 items-end gap-2 pt-2 sm:gap-3.5">
            {MESES.map(([mes, entrada, saida]) => (
              <div key={mes} className="flex h-full flex-col justify-end gap-1.5 text-center">
                <b className="tnum text-[11px] font-semibold text-ink2">{entrada.toFixed(1)}</b>
                <span className="flex h-full flex-col justify-end gap-0.5">
                  <i className="block rounded-t-sm bg-accent" style={{ height: `${(entrada / TETO_GRAFICO) * 100}%` }} />
                  <i className="block rounded-b-sm bg-ink3/40" style={{ height: `${(saida / TETO_GRAFICO) * 100}%` }} />
                </span>
                <span className="text-[11px] tracking-wide text-ink3 uppercase">{mes}</span>
              </div>
            ))}
          </div>
          <div className="mt-3.5 flex gap-4 text-xs text-ink3">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-xs bg-accent" />Entradas</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-xs bg-ink3/40" />Saídas</span>
          </div>
        </Panel>

        <Panel titulo="Últimos lançamentos">
          <ul>
            {LANCAMENTOS.map(([nome, dia, valor, entrada]) => (
              <li key={nome} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-semibold">{nome}</b>
                  <small className="text-xs text-ink3">{dia}</small>
                </div>
                <span className={`tnum shrink-0 text-[13px] font-semibold ${entrada ? 'text-ok' : 'text-ink2'}`}>
                  {valor}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel className="mt-4" titulo="Mensalidades por categoria" extra={<Tag>setembro de 2026</Tag>}>
        <ul>
          {CATEGORIAS.map((c) => {
            const t = alunos.filter((a) => a.cat === c);
            const pagas = t.filter((a) => a.st === 'pago').length;
            const v = MENS[c];
            return (
              <li key={c} className="border-b border-line px-4 py-3 last:border-b-0">
                <div className="flex items-center justify-between gap-3">
                  <b className="text-[13px] font-semibold">{c}</b>
                  <span className="tnum text-[13px]">
                    <b>{brl(pagas * v)}</b>
                    <span className="text-ink3"> de {brl(t.length * v)}</span>
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink3">
                  <span className="tnum">R$ {v},00 · {t.length} atletas</span>
                  <Tag tom="ok">{pagas} pagas</Tag>
                  <Tag tom={t.length - pagas ? 'warn' : 'ok'}>{t.length - pagas} em aberto</Tag>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
