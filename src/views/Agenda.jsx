import { Btn, Eyebrow, Jersey, Panel, Tag, useToast } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { AGENDA, MENS, TURMAS } from '../data.js';

export default function Agenda({ alunos }) {
  const toast = useToast();

  return (
    <>
      <PageHead titulo="Agenda de treinos" sub="Semana de 31/08 a 05/09 · 8 treinos e 1 amistoso">
        <Btn variante="ghost" onClick={() => toast('Semana anterior')} aria-label="Semana anterior">←</Btn>
        <Btn variante="ghost" onClick={() => toast('Próxima semana')} aria-label="Próxima semana">→</Btn>
        <Btn onClick={() => toast('Novo treino adicionado à agenda')} className="!flex-[2] sm:!flex-none">
          + Agendar treino
        </Btn>
      </PageHead>

      {/* celular: dias empilhados · desktop: 6 colunas */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-6 lg:gap-3">
        {AGENDA.map((d) => (
          <div
            key={d.data}
            className={`rounded-xl border bg-surface p-3 lg:min-h-38 ${
              d.hoje ? 'border-accent ring-1 ring-accent' : 'border-line'
            }`}
          >
            <Eyebrow className={`mb-2.5 block border-b border-line pb-2 ${d.hoje ? '!text-accent' : ''}`}>
              {d.dia} · {d.data}
              {d.hoje && ' · hoje'}
            </Eyebrow>
            {d.itens.length === 0 ? (
              <p className="text-xs text-ink3 italic">Sem treino</p>
            ) : (
              <div className="space-y-2">
                {d.itens.map((t) => (
                  <div
                    key={t.turma + t.info}
                    className={`rounded-lg px-2.5 py-2 ${t.jogo ? 'bg-warnbg' : 'bg-accentsoft'}`}
                  >
                    <b className={`block font-display text-[15px] font-semibold ${t.jogo ? 'text-warn' : 'text-accentink'}`}>
                      {t.turma}
                    </b>
                    <small className="block text-[11.5px] leading-snug text-ink2">{t.info}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Panel className="mt-4" titulo="Turmas" extra={<Tag>4 categorias</Tag>}>
        <ul>
          {TURMAS.map((t) => {
            const qtd = alunos.filter((a) => a.cat === t.cat).length;
            const vagas = t.capacidade - qtd;
            return (
              <li
                key={t.cat}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0"
              >
                <Jersey num={t.cat.replace('Sub-', '')} />
                <div className="min-w-0 flex-1">
                  <b className="block text-[13px] font-semibold">{t.cat}</b>
                  <small className="block text-xs text-ink3">
                    {t.dias} · {t.prof}
                  </small>
                </div>
                <div className="flex w-full items-center gap-3 pl-12 sm:w-auto sm:gap-4 sm:pl-0">
                  <span className="tnum text-xs text-ink2">{qtd} atletas</span>
                  <span className="tnum text-xs text-ink2">R$ {MENS[t.cat]}</span>
                  <Tag tom={vagas <= 2 ? 'warn' : 'ok'}>{vagas} vagas</Tag>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
