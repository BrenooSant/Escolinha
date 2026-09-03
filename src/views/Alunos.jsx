import { useMemo, useState } from 'react';
import { Btn, Chips, Jersey, Panel, Tag } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { CATEGORIAS, MENS, STATUS, corFreq, pct } from '../data.js';

const FILTROS = ['Todas', ...CATEGORIAS];

export default function Alunos({ alunos, categoria, setCategoria, onAbrirFicha, onNovoAluno }) {
  const [termo, setTermo] = useState('');

  const lista = useMemo(() => {
    const t = termo.trim().toLowerCase();
    return alunos.filter(
      (a) =>
        (categoria === 'Todas' || a.cat === categoria) &&
        (!t || a.n.toLowerCase().includes(t) || a.resp.toLowerCase().includes(t))
    );
  }, [alunos, categoria, termo]);

  return (
    <>
      <PageHead titulo="Alunos" sub={`${alunos.length} atletas matriculados em 4 categorias`}>
        <Btn onClick={onNovoAluno}>+ Novo aluno</Btn>
      </PageHead>

      <Panel
        titulo={
          <div className="relative w-full sm:max-w-72">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink3">⌕</span>
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar atleta ou responsável..."
              aria-label="Buscar atleta ou responsável"
              className="w-full rounded-lg border border-line bg-surface py-2 pr-3 pl-8 text-ink placeholder:text-ink3"
            />
          </div>
        }
        extra={<Tag className="hidden shrink-0 sm:inline-block">{lista.length} atletas</Tag>}
      >
        <div className="border-b border-line px-4 py-3">
          <Chips opcoes={FILTROS} valor={categoria} onChange={setCategoria} />
        </div>

        {lista.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-ink3">
            Nenhum atleta encontrado para esta busca.
          </p>
        ) : (
          <>
            {/* ---- celular: cartões ---- */}
            <ul className="lg:hidden">
              {lista.map((a) => {
                const f = pct(a);
                const [tom, rotulo] = STATUS[a.st];
                return (
                  <li key={a.n} className="border-b border-line last:border-b-0">
                    <button
                      onClick={() => onAbrirFicha(a)}
                      className="flex w-full items-center gap-3 p-3 text-left active:bg-surface2"
                    >
                      <Jersey num={a.num} />
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-[13.5px] font-semibold">{a.n}</b>
                        <small className="text-xs text-ink3">
                          {a.cat} · {a.pos}
                        </small>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Tag tom={tom}>{rotulo}</Tag>
                          <span className={`tnum text-[11px] font-semibold ${corFreq(f)}`}>{f}% de presença</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <b className="tnum block text-[13px]">R$ {MENS[a.cat]}</b>
                        <small className="text-[11px] text-ink3">por mês</small>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* ---- desktop: tabela ---- */}
            <table className="hidden w-full border-collapse text-[13px] lg:table">
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-4 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:tracking-[0.1em] [&>th]:text-ink3 [&>th]:uppercase">
                  <th>Atleta</th>
                  <th>Categoria</th>
                  <th>Posição</th>
                  <th>Responsável</th>
                  <th>Contato</th>
                  <th className="!text-right">Frequência</th>
                  <th className="!text-right">Mensalidade</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => {
                  const f = pct(a);
                  const [tom, rotulo] = STATUS[a.st];
                  return (
                    <tr
                      key={a.n}
                      onClick={() => onAbrirFicha(a)}
                      className="cursor-pointer hover:bg-surface2 [&>td]:border-b [&>td]:border-line [&>td]:px-4 [&>td]:py-2.5 [&:last-child>td]:border-b-0"
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <Jersey num={a.num} />
                          <div>
                            <b className="block font-semibold">{a.n}</b>
                            <small className="text-xs text-ink3">{a.nasc}</small>
                          </div>
                        </div>
                      </td>
                      <td><Tag>{a.cat}</Tag></td>
                      <td className="text-ink2">{a.pos}</td>
                      <td>
                        {a.resp}
                        <br />
                        <small className="text-ink3">{a.par}</small>
                      </td>
                      <td className="tnum text-ink3">{a.tel}</td>
                      <td className="text-right">
                        <b className={`tnum ${corFreq(f)}`}>{f}%</b>
                        <br />
                        <small className="text-ink3">{a.freq} treinos</small>
                      </td>
                      <td className="text-right">
                        <b className="tnum">R$ {MENS[a.cat]},00</b>
                        <br />
                        <Tag tom={tom}>{rotulo}</Tag>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <p className="mt-2.5 px-1 text-xs text-ink3">Toque em um atleta para abrir a ficha completa.</p>
    </>
  );
}
