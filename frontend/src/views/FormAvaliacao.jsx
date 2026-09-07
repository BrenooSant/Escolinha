import { useEffect, useState } from 'react';
import { Alerta, Btn, Field, Sheet, SheetFoot, Textarea, useToast, Vazio } from '../ui.jsx';
import { useAcao, useQuesitos } from '../hooks/dados.js';
import * as apiAvaliacoes from '../api/avaliacoes.js';
import { hojeISO, primeiroNome } from '../lib/format.js';

const LEGENDA = ['', 'Bem abaixo', 'Abaixo', 'Na média', 'Acima', 'Destaque'];

/* Nota de 1 a 5 por quesito. Botões grandes porque isso é preenchido em
   pé, no campo, com o celular na mão. */
function Nota({ quesito, valor, onChange }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <b className="text-[13px] font-semibold">{quesito.nome}</b>
        <span className="text-[11px] text-ink3">{valor ? LEGENDA[valor] : 'sem nota'}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={valor === n}
            aria-label={`${quesito.nome}: ${n} — ${LEGENDA[n]}`}
            onClick={() => onChange(valor === n ? null : n)}
            className={`min-h-11 rounded-lg border text-sm font-semibold transition ${
              valor === n
                ? 'border-accent bg-accent text-white'
                : 'border-line text-ink2 hover:bg-surface2'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FormAvaliacao({ aberto, aluno, avaliacao, onFechar }) {
  const toast = useToast();
  const quesitos = useQuesitos();
  const [notas, setNotas] = useState({});
  const [data, setData] = useState(hojeISO());
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState(null);

  const editando = Boolean(avaliacao);

  useEffect(() => {
    if (!aberto) return;
    setErro(null);
    if (avaliacao) {
      setData(avaliacao.data);
      setObservacao(avaliacao.observacao ?? '');
      setNotas(Object.fromEntries(avaliacao.notas.map((n) => [n.quesito_id, n.nota])));
    } else {
      setData(hojeISO());
      setObservacao('');
      setNotas({});
    }
  }, [aberto, avaliacao]);

  const salvar = useAcao(
    () =>
      apiAvaliacoes.salvar({
        alunoId: aluno.id,
        data,
        notas,
        observacao,
        id: avaliacao?.id,
      }),
    {
      sucesso: () => {
        toast(`Avaliação de ${primeiroNome(aluno.nome)} salva`);
        onFechar();
      },
    }
  );

  const preenchidas = Object.values(notas).filter(Boolean).length;

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    if (preenchidas === 0) return setErro('Dê pelo menos uma nota.');
    salvar.mutate(undefined, { onError: (err) => setErro(err.message) });
  };

  return (
    <Sheet
      aberto={aberto}
      onFechar={onFechar}
      largura="max-w-lg"
      rotulo={`Avaliar ${aluno?.nome ?? ''}`}
    >
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg sm:text-xl">{editando ? 'Editar avaliação' : 'Nova avaliação'}</h3>
        <p className="mt-1 text-[13px] text-ink3">
          {aluno?.nome} · o responsável vê as notas no portal, mas não a sua observação.
        </p>
      </header>

      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4 sm:px-5">
          <Field label="Data da avaliação" className="mb-1">
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              max={hojeISO()}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-semibold text-ink"
            />
          </Field>

          {quesitos.isPending ? (
            <p className="py-6 text-center text-[13px] text-ink3">Carregando quesitos…</p>
          ) : !quesitos.data?.length ? (
            <Vazio
              icone="📋"
              titulo="Nenhum quesito cadastrado"
              texto="Cadastre os quesitos de avaliação em Ajustes antes de avaliar."
            />
          ) : (
            <div className="mt-3">
              {quesitos.data.map((q) => (
                <Nota
                  key={q.id}
                  quesito={q}
                  valor={notas[q.id] ?? null}
                  onChange={(v) => setNotas((n) => ({ ...n, [q.id]: v }))}
                />
              ))}
            </div>
          )}

          <Field label="Observação" className="mt-4" dica="Fica só para a equipe técnica.">
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="min-h-20"
              placeholder="Evoluiu muito no passe curto. Ainda foge da marcação."
            />
          </Field>

          <div className="mt-3"><Alerta>{erro}</Alerta></div>
        </div>

        <SheetFoot>
          <Btn type="button" variante="ghost" onClick={onFechar}>Cancelar</Btn>
          <Btn type="submit" carregando={salvar.isPending} disabled={!quesitos.data?.length}>
            Salvar avaliação {preenchidas > 0 && `(${preenchidas})`}
          </Btn>
        </SheetFoot>
      </form>
    </Sheet>
  );
}
