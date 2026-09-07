import { useMemo, useState } from 'react';
import {
  Alerta, Btn, Confirmar, Erro, Esqueleto, Field, Input, Panel, Select, Sheet,
  SheetFoot, Tag, Tile, Vazio, useToast,
} from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useAcao, useLancamentos, useMensalidades, usePainel, useTurmas } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiFinanceiro from '../api/financeiro.js';
import {
  brl, brlCurto, dataCurta, deCentavos, hojeISO, mesCurto, mesExtenso, paraCentavos, paraISO,
} from '../lib/format.js';
import { exportarCSV } from '../lib/csv.js';

const CATEGORIAS_SAIDA = ['Estrutura', 'Material', 'Competição', 'Pessoal', 'Transporte', 'Outros'];
const CATEGORIAS_ENTRADA = ['Mensalidade', 'Uniforme', 'Evento', 'Patrocínio', 'Outros'];

export default function Financeiro() {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const painel = usePainel();
  const turmas = useTurmas();
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [apagando, setApagando] = useState(null);

  const competencia = painel.data?.competencia;

  /* Seis meses para trás alimentam o gráfico e a lista de lançamentos. */
  const de = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5);
    return paraISO(d);
  }, []);

  const lancamentos = useLancamentos(de, hojeISO());
  const mensalidades = useMensalidades(competencia);

  const serie = useMemo(() => {
    const mapa = new Map();
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      mapa.set(paraISO(d).slice(0, 7), { mes: paraISO(d), entrada: 0, saida: 0 });
    }
    for (const l of lancamentos.data ?? []) {
      const chave = l.data.slice(0, 7);
      const item = mapa.get(chave);
      if (!item) continue;
      if (l.tipo === 'entrada') item.entrada += l.valor_centavos;
      else item.saida += l.valor_centavos;
    }
    return [...mapa.values()];
  }, [lancamentos.data]);

  const teto = Math.max(...serie.map((s) => Math.max(s.entrada, s.saida)), 1);

  const gerar = useAcao(() => apiFinanceiro.gerarDoMes(escolinhaId), {
    sucesso: (n) =>
      toast(n > 0 ? `${n} mensalidade${n > 1 ? 's' : ''} gerada${n > 1 ? 's' : ''}` : 'Todas as mensalidades do mês já existiam'),
  });

  const apagar = useAcao(() => apiFinanceiro.apagarLancamento(apagando.id), {
    sucesso: () => { toast('Lançamento removido'); setApagando(null); },
  });

  if (painel.isPending) return <Esqueleto linhas={6} />;
  if (painel.isError) return <Erro erro={painel.error} aoTentar={painel.refetch} />;

  const r = painel.data;
  const saldo = r.entradas_mes - r.saidas_mes;

  const exportar = () => {
    exportarCSV(
      `caixa-${competencia.slice(0, 7)}.csv`,
      ['Data', 'Descrição', 'Tipo', 'Categoria', 'Valor'],
      (lancamentos.data ?? []).map((l) => [
        dataCurta(l.data), l.descricao, l.tipo, l.categoria || '',
        (l.tipo === 'saida' ? '-' : '') + (l.valor_centavos / 100).toFixed(2).replace('.', ','),
      ])
    );
    toast('Caixa exportado');
  };

  return (
    <>
      <PageHead titulo="Financeiro" sub={`Caixa de ${mesExtenso(competencia)}`}>
        <Btn variante="ghost" onClick={exportar}>Exportar CSV</Btn>
        <Btn onClick={() => setNovo(true)}>+ Lançamento</Btn>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Tile rotulo="Entradas no mês" valor={brlCurto(r.entradas_mes)} nota="mensalidades e outras receitas" cor="text-ok" />
        <Tile rotulo="Saídas no mês" valor={brlCurto(r.saidas_mes)} nota="campo, material, arbitragem" />
        <Tile rotulo="Saldo" valor={brlCurto(saldo)} cor={saldo < 0 ? 'text-bad' : ''} nota={saldo < 0 ? 'no vermelho' : 'no azul'} />
        <Tile
          rotulo="A receber"
          valor={brlCurto(r.aberto)}
          nota={`${r.atletas - r.pagas} mensalidade${r.atletas - r.pagas === 1 ? '' : 's'} em aberto`}
          alerta
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel titulo="Entradas x saídas" extra={<Tag>últimos 6 meses</Tag>} corpo>
          {lancamentos.isPending ? (
            <Esqueleto linhas={2} className="!p-0" />
          ) : (
            <>
              <div className="grid h-44 grid-cols-6 items-end gap-2 pt-2 sm:gap-3.5">
                {serie.map((s) => (
                  <div key={s.mes} className="flex h-full flex-col justify-end gap-1.5 text-center">
                    <b className="tnum text-[11px] font-semibold text-ink2">
                      {(s.entrada / 100000).toFixed(1)}
                    </b>
                    <span className="flex h-full flex-col justify-end gap-0.5">
                      <i className="block rounded-t-sm bg-accent" style={{ height: `${(s.entrada / teto) * 100}%` }} />
                      <i className="block rounded-b-sm bg-ink3/40" style={{ height: `${(s.saida / teto) * 100}%` }} />
                    </span>
                    <span className="text-[11px] tracking-wide text-ink3 uppercase">{mesCurto(s.mes)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 flex gap-4 text-xs text-ink3">
                <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-xs bg-accent" />Entradas</span>
                <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-xs bg-ink3/40" />Saídas</span>
                <span className="ml-auto">valores em R$ mil</span>
              </div>
            </>
          )}
        </Panel>

        <Panel titulo="Últimos lançamentos" extra={<Tag>{lancamentos.data?.length ?? 0}</Tag>}>
          {lancamentos.isPending ? (
            <Esqueleto linhas={5} />
          ) : lancamentos.data?.length ? (
            <ul className="max-h-96 overflow-y-auto">
              {lancamentos.data.slice(0, 40).map((l) => (
                <li key={l.id} className="group flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                  {/* mensalidade não se edita aqui: ela vem da baixa do pagamento */}
                  <button
                    onClick={() => !l.mensalidade_id && setEditando(l)}
                    disabled={Boolean(l.mensalidade_id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                  >
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13px] font-semibold">{l.descricao}</b>
                      <small className="text-xs text-ink3">
                        {dataCurta(l.data)}{l.categoria ? ` · ${l.categoria}` : ''}
                      </small>
                    </span>
                    <span className={`tnum shrink-0 text-[13px] font-semibold ${l.tipo === 'entrada' ? 'text-ok' : 'text-ink2'}`}>
                      {l.tipo === 'entrada' ? '+ ' : '− '}{brl(l.valor_centavos)}
                    </span>
                  </button>
                  {!l.mensalidade_id && (
                    <button
                      onClick={() => setApagando(l)}
                      title="Apagar lançamento"
                      className="shrink-0 px-1 text-ink3 opacity-0 transition group-hover:opacity-100 hover:text-bad"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Vazio icone="🧾" titulo="Caixa vazio" texto="Registre aluguel do campo, compra de material e outras receitas.">
              <Btn variante="ghost" onClick={() => setNovo(true)}>+ Lançamento</Btn>
            </Vazio>
          )}
        </Panel>
      </div>

      <Panel
        className="mt-4"
        titulo="Mensalidades por turma"
        extra={
          <Btn variante="ghost" className="!min-h-8 !px-3 !text-xs" onClick={() => gerar.mutate()} carregando={gerar.isPending}>
            Gerar as do mês
          </Btn>
        }
      >
        {mensalidades.isPending || turmas.isPending ? (
          <Esqueleto linhas={4} />
        ) : !mensalidades.data?.length ? (
          <Vazio
            icone="💸"
            titulo="Nenhuma mensalidade neste mês"
            texto="Gere as mensalidades do mês para acompanhar quem pagou e quem falta."
          >
            <Btn onClick={() => gerar.mutate()} carregando={gerar.isPending}>Gerar mensalidades</Btn>
          </Vazio>
        ) : (
          <ul>
            {(turmas.data ?? []).map((t) => {
              const dela = mensalidades.data.filter((m) => m.turma_nome === t.nome);
              if (!dela.length) return null;
              const pagas = dela.filter((m) => m.status === 'paga');
              const totalPago = pagas.reduce((s, m) => s + m.valor_centavos, 0);
              const total = dela.reduce((s, m) => s + m.valor_centavos, 0);
              return (
                <li key={t.id} className="border-b border-line px-4 py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <b className="text-[13px] font-semibold">{t.nome}</b>
                    <span className="tnum text-[13px]">
                      <b>{brl(totalPago)}</b>
                      <span className="text-ink3"> de {brl(total)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink3">
                    <span className="tnum">{brl(t.mensalidade_centavos)} · {dela.length} atletas</span>
                    <Tag tom="ok">{pagas.length} pagas</Tag>
                    <Tag tom={dela.length - pagas.length ? 'warn' : 'ok'}>
                      {dela.length - pagas.length} em aberto
                    </Tag>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <FormLancamento
        key={editando?.id ?? 'novo'}
        aberto={novo || Boolean(editando)}
        lancamento={editando}
        onFechar={() => { setNovo(false); setEditando(null); }}
      />

      <Confirmar
        aberto={Boolean(apagando)}
        titulo="Apagar lançamento?"
        texto={apagando ? `"${apagando.descricao}" sai do caixa do mês.` : ''}
        rotulo="Apagar"
        carregando={apagar.isPending}
        onConfirmar={() => apagar.mutate()}
        onFechar={() => setApagando(null)}
      />
    </>
  );
}

function FormLancamento({ aberto, lancamento, onFechar }) {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const [tipo, setTipo] = useState(lancamento?.tipo ?? 'saida');
  const [erro, setErro] = useState(null);
  const editando = Boolean(lancamento);

  const salvar = useAcao(
    (dados) =>
      editando
        ? apiFinanceiro.salvarLancamento(lancamento.id, dados)
        : apiFinanceiro.criarLancamento(escolinhaId, dados),
    { sucesso: () => { toast(editando ? 'Lançamento atualizado' : 'Lançamento registrado'); onFechar(); } }
  );

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);
    const centavos = paraCentavos(f.get('valor'));
    if (centavos <= 0) return setErro('Informe um valor maior que zero.');

    salvar.mutate(
      {
        descricao: f.get('descricao').trim(),
        tipo,
        valor_centavos: centavos,
        data: f.get('data'),
        categoria: f.get('categoria'),
      },
      { onError: (err) => setErro(err.message) }
    );
  };

  return (
    <Sheet aberto={aberto} onFechar={onFechar} rotulo={editando ? 'Editar lançamento' : 'Novo lançamento'}>
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg sm:text-xl">{editando ? 'Editar lançamento' : 'Novo lançamento'}</h3>
        <p className="mt-1 text-[13px] text-ink3">
          As mensalidades pagas entram sozinhas — aqui vão as outras contas.
        </p>
      </header>

      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:px-5">
          <div className="col-span-full flex gap-0.5 rounded-xl bg-surface2 p-1">
            {[['saida', 'Saída'], ['entrada', 'Entrada']].map(([v, rot]) => (
              <button
                key={v}
                type="button"
                onClick={() => setTipo(v)}
                className={`min-h-10 flex-1 rounded-lg text-[13px] font-semibold transition ${
                  tipo === v ? 'bg-surface text-ink shadow-sm' : 'text-ink2'
                }`}
              >
                {rot}
              </button>
            ))}
          </div>

          <Field label="Descrição" className="sm:col-span-2">
            <Input name="descricao" required minLength={2} defaultValue={lancamento?.descricao ?? ''} placeholder="Aluguel do campo" />
          </Field>
          <Field label="Valor">
            <Input
              name="valor"
              required
              inputMode="decimal"
              defaultValue={lancamento ? deCentavos(lancamento.valor_centavos) : ''}
              placeholder="900,00"
            />
          </Field>
          <Field label="Data">
            <Input type="date" name="data" required defaultValue={lancamento?.data ?? hojeISO()} />
          </Field>
          <Field label="Categoria" className="sm:col-span-2">
            <Select name="categoria" defaultValue={lancamento?.categoria ?? (tipo === 'saida' ? 'Estrutura' : 'Uniforme')}>
              {(tipo === 'saida' ? CATEGORIAS_SAIDA : CATEGORIAS_ENTRADA).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <div className="col-span-full"><Alerta>{erro}</Alerta></div>
        </div>

        <SheetFoot>
          <Btn type="button" variante="ghost" onClick={onFechar}>Cancelar</Btn>
          <Btn type="submit" carregando={salvar.isPending}>{editando ? 'Salvar' : 'Registrar'}</Btn>
        </SheetFoot>
      </form>
    </Sheet>
  );
}
