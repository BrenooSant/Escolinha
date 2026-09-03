import { Barra, Jersey, Panel, Tag, Tile, useToast } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { ANIVERSARIANTES, CATEGORIAS, SEMANA, brl, corFreq, pct, tomFreq } from '../data.js';

const ATALHOS = [
  { ic: '✓', titulo: 'Fazer a chamada de hoje', nota: 'Sub-13 · 18h · 5 atletas', vai: 'presenca' },
  { ic: '＋', titulo: 'Matricular atleta', nota: 'ficha completa em 1 minuto', acao: 'novo' },
  { ic: '↗', titulo: 'Cobrar atrasados', nota: null, vai: 'cobrancas' },
  { ic: '▤', titulo: 'Relatório do mês', nota: 'presença + caixa em PDF', toast: 'Relatório de setembro gerado' },
];

export default function Painel({ alunos, resumo, irPara, onNovoAluno }) {
  const toast = useToast();

  const alertas = [
    ['bad', `${resumo.devedores} mensalidades vencidas`, `${brl(resumo.atrasado)},00 parados — a mais antiga tem 33 dias.`, 'Cobrar', 'cobrancas'],
    ['warn', '3 atletas com frequência baixa', 'Lucas, Heitor e Théo abaixo de 70% no mês.', 'Ver alunos', 'alunos'],
    ['warn', 'Chamada de terça não foi salva', 'Sub-11, treino de 01/09 às 18h.', 'Fazer agora', 'presenca'],
    ['ok', '2 fichas sem autorização de imagem', 'Pendente para Alice Barreto e Samuel Queiroz.', 'Ver alunos', 'alunos'],
  ];

  const COR_DOT = { bad: 'bg-bad', warn: 'bg-warn', ok: 'bg-ok' };

  return (
    <>
      <PageHead titulo="Painel" sub="Setembro de 2026 · Campo do Bosque, Goiânia">
        <Tag className="!py-1.5 !text-xs">Próximo treino: hoje, 18h — Sub-13</Tag>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Tile rotulo="Atletas ativos" valor={alunos.length} nota="+3 matrículas no mês" />
        <Tile rotulo="Presença média" valor={`${resumo.freqMedia}%`} nota="últimos 30 dias" />
        <Tile rotulo="Recebido em setembro" valor={brl(resumo.recebido)} nota={`${resumo.pagas} de ${alunos.length} mensalidades`} />
        <Tile rotulo="Em atraso" valor={brl(resumo.atrasado)} nota={`${resumo.devedores} responsáveis`} alerta />
      </div>

      {/* atalhos */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {ATALHOS.map((a) => (
          <button
            key={a.titulo}
            onClick={() => {
              if (a.vai) irPara(a.vai);
              else if (a.acao === 'novo') onNovoAluno();
              else toast(a.toast);
            }}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition hover:-translate-y-px hover:border-accent sm:p-3.5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accentsoft text-[15px] text-accentink">
              {a.ic}
            </span>
            <span className="min-w-0">
              <b className="block text-[13px] leading-tight font-semibold">{a.titulo}</b>
              <small className="text-[11.5px] text-ink3">
                {a.nota ?? `${resumo.devedores} responsáveis · ${brl(resumo.atrasado)}`}
              </small>
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        {/* chamada da semana */}
        <Panel titulo="Chamada da semana" extra={<Tag>4 turmas</Tag>}>
          <ul>
            {SEMANA.map(([cat, dia, presentes, faltas]) => {
              const idx = Math.round((presentes / (presentes + faltas)) * 100);
              return (
                <li
                  key={cat}
                  className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <b className="text-[13px] font-semibold">{cat}</b>
                    <small className="block text-xs text-ink3">{dia}</small>
                  </div>
                  <span className="tnum text-xs text-ink2">
                    {presentes} presentes · {faltas} faltas
                  </span>
                  <Tag tom={tomFreq(idx)}>{idx}%</Tag>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* alertas */}
        <Panel titulo="Precisa da sua atenção" extra={<Tag tom="bad">{alertas.length}</Tag>}>
          <ul>
            {alertas.map(([tom, titulo, nota, cta, destino]) => (
              <li key={titulo} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${COR_DOT[tom]}`} />
                <div className="min-w-0 flex-1">
                  <b className="block text-[13px] font-semibold">{titulo}</b>
                  <small className="text-xs text-ink3">{nota}</small>
                </div>
                <button
                  onClick={() => irPara(destino)}
                  className="-mr-2 flex min-h-10 shrink-0 items-center self-center px-2 text-xs font-semibold whitespace-nowrap text-accent hover:underline"
                >
                  {cta} →
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel titulo="Frequência por turma" extra={<Tag>últimos 30 dias</Tag>} corpo>
          <div className="space-y-4">
            {CATEGORIAS.map((c) => {
              const t = alunos.filter((a) => a.cat === c);
              if (!t.length) return null;
              const m = Math.round(t.reduce((s, a) => s + pct(a), 0) / t.length);
              return (
                <div key={c}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <b className="text-[13px]">{c}</b>
                    <span className="text-xs text-ink3">
                      {t.length} atletas · <b className={corFreq(m)}>{m}%</b>
                    </span>
                  </div>
                  <Barra fatias={[{ cor: `bg-current ${corFreq(m)}`, pct: m }]} />
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel titulo="Aniversariantes do mês" extra={<Tag>setembro</Tag>} corpo>
          <div className="space-y-3.5">
            {ANIVERSARIANTES.map((a) => (
              <div key={a.n} className="flex items-center gap-3">
                <Jersey num={a.num} />
                <div className="min-w-0">
                  <b className="block truncate text-[13px] font-semibold">{a.n}</b>
                  <small className="text-xs text-ink3">{a.quando}</small>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
