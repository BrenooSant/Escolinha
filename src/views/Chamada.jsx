import { useMemo, useState } from 'react';
import { Barra, Btn, Chips, Eyebrow, Jersey, Panel, Select, Tag, useToast } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { CATEGORIAS, CURTO, HISTORICO, ICONE, MOTIVOS, ROTULO, corFreq, pct } from '../data.js';

const BORDA = { P: 'border-l-ok', F: 'border-l-bad', J: 'border-l-warn', '': 'border-l-line' };
const ATIVO = {
  P: 'bg-ok text-white border-ok',
  F: 'bg-bad text-white border-bad',
  J: 'bg-warn text-white border-warn',
};

function Atleta({ a, marca, justificativa, onMarcar, onJustificar }) {
  const f = pct(a);
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-l-[3px] border-b-line p-3 last:border-b-0 ${
        BORDA[marca]
      } ${marca ? '' : 'bg-surface2/40'}`}
    >
      <Jersey num={a.num} />

      <div className="min-w-0 flex-1">
        <b className="block truncate text-[13.5px] font-semibold">{a.n}</b>
        <small className="text-xs text-ink3">{a.pos}</small>
        <div className="mt-1.5 flex max-w-52 items-center gap-2">
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface2">
            <i className={`block h-full ${f < 70 ? 'bg-bad' : 'bg-accent'}`} style={{ width: `${f}%` }} />
          </span>
          <em className="tnum text-[11px] font-semibold text-ink3 not-italic">{f}% no mês</em>
        </div>
      </div>

      {!marca && <Tag className="hidden sm:inline-block">a marcar</Tag>}

      {/* No celular ocupa a linha inteira; no desktop fica à direita. */}
      <div className="grid w-full grid-cols-3 overflow-hidden rounded-xl border border-line sm:flex sm:w-auto sm:rounded-lg">
        {['P', 'F', 'J'].map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={marca === v}
            aria-label={`${ROTULO[v]}: ${a.n}`}
            onClick={() => onMarcar(a.n, marca === v ? '' : v)}
            className={`flex min-h-11 items-center justify-center gap-1.5 border-r border-line text-xs font-semibold transition last:border-r-0 sm:px-3.5 ${
              marca === v ? ATIVO[v] : 'text-ink3 hover:bg-surface2 hover:text-ink'
            }`}
          >
            <i
              className={`grid size-4 place-items-center rounded-full border-[1.5px] border-current text-[9px] not-italic ${
                marca === v ? 'bg-white/20' : 'opacity-55'
              }`}
            >
              {ICONE[v]}
            </i>
            {CURTO[v]}
          </button>
        ))}
      </div>

      {marca === 'J' && (
        <Select
          value={justificativa || ''}
          onChange={(e) => onJustificar(a.n, e.target.value)}
          aria-label={`Motivo da ausência de ${a.n}`}
          className="w-full py-2 text-xs sm:w-52"
        >
          <option value="">Motivo da falta…</option>
          {MOTIVOS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      )}
    </li>
  );
}

export default function Chamada({ alunos, turma, setTurma, marcas, setMarcas, justificativas, setJustificativas }) {
  const toast = useToast();
  const [data, setData] = useState('2026-09-02');

  const lista = useMemo(() => alunos.filter((a) => a.cat === turma), [alunos, turma]);

  const { p, f, j, naoMarcados, marcados, indice } = useMemo(() => {
    let p = 0, f = 0, j = 0;
    lista.forEach((a) => {
      const m = marcas[a.n];
      if (m === 'P') p++;
      else if (m === 'F') f++;
      else if (m === 'J') j++;
    });
    const marcados = p + f + j;
    return {
      p, f, j,
      marcados,
      naoMarcados: lista.length - marcados,
      indice: marcados ? Math.round(((p + j) / marcados) * 100) : 0,
    };
  }, [lista, marcas]);

  const total = lista.length || 1;
  const marcar = (nome, valor) => setMarcas((m) => ({ ...m, [nome]: valor }));

  const todosPresentes = () => {
    setMarcas((m) => ({ ...m, ...Object.fromEntries(lista.map((a) => [a.n, 'P'])) }));
    toast('Todos presentes — agora ajuste quem faltou');
  };
  const limpar = () => setMarcas((m) => ({ ...m, ...Object.fromEntries(lista.map((a) => [a.n, ''])) }));

  const salvar = () => {
    if (naoMarcados) {
      toast(`Ainda faltam ${naoMarcados} atleta${naoMarcados > 1 ? 's' : ''} sem marcação`);
      return;
    }
    toast(`Chamada do ${turma} salva · ${p} de ${lista.length} presentes`);
  };

  return (
    <>
      <PageHead
        titulo="Chamada do treino"
        sub="Escolha a turma, marque cada atleta e salve. A frequência e o relatório do mês se atualizam sozinhos."
      >
        <Btn variante="ghost" onClick={() => toast('Mostrando as chamadas já salvas desta turma')}>
          Anteriores
        </Btn>
        <Btn onClick={salvar}>Salvar chamada</Btn>
      </PageHead>

      {/* 1. qual treino */}
      <div className="mb-3.5 rounded-xl border border-line bg-surface p-4">
        <Eyebrow className="mb-2 block">1. Turma</Eyebrow>
        <Chips opcoes={CATEGORIAS} valor={turma} onChange={setTurma} />

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <label className="col-span-2 sm:col-span-1">
            <Eyebrow className="mb-1.5 block">2. Data do treino</Eyebrow>
            <input
              type="date"
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                toast('Chamada de ' + e.target.value.split('-').reverse().join('/'));
              }}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-semibold text-ink"
            />
          </label>
          <label>
            <Eyebrow className="mb-1.5 block">Horário</Eyebrow>
            <select className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-semibold text-ink" defaultValue="18h00">
              <option>17h00</option><option>18h00</option><option>19h00</option>
            </select>
          </label>
          <label>
            <Eyebrow className="mb-1.5 block">Local</Eyebrow>
            <select className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-semibold text-ink">
              <option>Campo do Bosque</option><option>Society Vila Nova</option><option>Ginásio coberto</option>
            </select>
          </label>
        </div>
      </div>

      {/* 2. marcar */}
      <Panel>
        <div className="flex flex-col gap-3.5 border-b border-line p-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex-1">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <b className="text-[13px] font-semibold">
                {marcados} de {lista.length} marcados
              </b>
              <span className="text-xs text-ink3">
                {naoMarcados === 0
                  ? 'tudo pronto — é só salvar'
                  : `faltam ${naoMarcados} atleta${naoMarcados > 1 ? 's' : ''}`}
              </span>
            </div>
            <Barra
              fatias={[
                { cor: 'bg-ok', pct: (p / total) * 100 },
                { cor: 'bg-bad', pct: (f / total) * 100 },
                { cor: 'bg-warn', pct: (j / total) * 100 },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Btn variante="ghost" onClick={todosPresentes} className="whitespace-nowrap">
              ✓ Todos presentes
            </Btn>
            <Btn variante="ghost" onClick={limpar}>
              Limpar
            </Btn>
          </div>
        </div>

        {/* placar: 2x2 no celular, 4 colunas no desktop */}
        <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
          {[
            ['Presentes', p, 'text-ok'],
            ['Faltas', f, 'text-bad'],
            ['Justificadas', j, 'text-warn'],
            ['Índice do treino', marcados ? `${indice}%` : '—', ''],
          ].map(([rot, val, cor], i) => (
            <div key={rot} className={`px-4 py-3 ${i % 2 === 0 ? 'border-r border-line' : ''} ${i < 2 ? 'border-b border-line sm:border-b-0' : ''} sm:border-r sm:last:border-r-0`}>
              <span className="text-[11px] font-semibold tracking-[0.1em] text-ink3 uppercase">{rot}</span>
              <b className={`tnum block font-display text-2xl leading-tight font-semibold ${cor}`}>{val}</b>
            </div>
          ))}
        </div>

        <ul>
          {lista.map((a) => (
            <Atleta
              key={a.n}
              a={a}
              marca={marcas[a.n] || ''}
              justificativa={justificativas[a.n]}
              onMarcar={marcar}
              onJustificar={(nome, v) => setJustificativas((j) => ({ ...j, [nome]: v }))}
            />
          ))}
        </ul>
      </Panel>

      {/* 3. histórico */}
      <Panel className="mt-4" titulo="Últimas chamadas desta turma" extra={<Tag>{turma}</Tag>}>
        <div className="no-bar flex gap-2.5 overflow-x-auto p-4">
          {(HISTORICO[turma] || []).map(([dia, presentes, tot]) => {
            const i = Math.round((presentes / tot) * 100);
            return (
              <div key={dia} className="w-24 shrink-0 rounded-xl border border-line p-3">
                <small className="block text-[11px] text-ink3">{dia}</small>
                <b className={`block font-display text-xl font-semibold ${corFreq(i)}`}>{i}%</b>
                <span className="tnum text-[11px] text-ink3">
                  {presentes} de {tot}
                </span>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
