import { useMemo, useState } from 'react';
import { Btn, Chips, Erro, Esqueleto, Field, Input, Panel, Select, Tag, Vazio, useToast } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useSessao } from '../estado/Sessao.jsx';
import { useAlunos, useTurmas } from '../hooks/dados.js';
import { POSICOES, situacaoMensalidade } from '../lib/constantes.js';
import { brl, corFreq, dataBR, idade } from '../lib/format.js';
import { exportarCSV } from '../lib/csv.js';

/* Relatório de atletas: um conjunto de filtros que se combinam e saem
   em PDF (para imprimir ou mandar) ou CSV (para abrir no Excel).
   "Todos os matriculados", "os do Sub-11" e "os nascidos em 2014" são o
   mesmo relatório com filtros diferentes — por isso uma tela só. */

const SITUACOES = [
  { valor: 'todas', rotulo: 'Qualquer' },
  { valor: 'paga', rotulo: 'Em dia' },
  { valor: 'atrasada', rotulo: 'Atrasada' },
  { valor: 'aberta', rotulo: 'Em aberto' },
  { valor: 'isenta', rotulo: 'Isento' },
];

const ORDENS = [
  { valor: 'nome', rotulo: 'Nome' },
  { valor: 'turma', rotulo: 'Turma' },
  { valor: 'nascimento', rotulo: 'Nascimento' },
  { valor: 'frequencia', rotulo: 'Frequência' },
  { valor: 'numero', rotulo: 'Número' },
];

export default function Relatorios() {
  const toast = useToast();
  const { escolinha } = useSessao();

  const [arquivados, setArquivados] = useState(false);
  const [turmaId, setTurmaId] = useState('');
  const [posicao, setPosicao] = useState('');
  const [situacao, setSituacao] = useState('todas');
  const [nascidoDe, setNascidoDe] = useState('');
  const [nascidoAte, setNascidoAte] = useState('');
  const [freqMin, setFreqMin] = useState('');
  const [ordem, setOrdem] = useState('nome');
  const [agrupar, setAgrupar] = useState(true);
  const [gerando, setGerando] = useState(false);

  const turmas = useTurmas();
  const alunos = useAlunos({ ativos: !arquivados });

  /* Os anos vêm do próprio elenco: não adianta oferecer 2003 para uma
     escolinha que só tem Sub-9. */
  const anos = useMemo(() => {
    const vistos = new Set();
    for (const a of alunos.data ?? []) {
      if (a.nascimento) vistos.add(a.nascimento.slice(0, 4));
    }
    return [...vistos].sort();
  }, [alunos.data]);

  const lista = useMemo(() => {
    let r = [...(alunos.data ?? [])];

    if (turmaId) r = r.filter((a) => a.turma_id === turmaId);
    if (posicao) r = r.filter((a) => a.posicao === posicao);

    if (nascidoDe) r = r.filter((a) => a.nascimento && a.nascimento.slice(0, 4) >= nascidoDe);
    if (nascidoAte) r = r.filter((a) => a.nascimento && a.nascimento.slice(0, 4) <= nascidoAte);

    if (situacao !== 'todas') {
      r = r.filter((a) => {
        if (situacao === 'atrasada') return a.mensalidade_status === 'aberta' && a.dias_atraso > 0;
        if (situacao === 'aberta') return a.mensalidade_status === 'aberta' && !(a.dias_atraso > 0);
        return a.mensalidade_status === situacao;
      });
    }

    const min = Number(freqMin);
    if (freqMin !== '' && Number.isFinite(min)) {
      r = r.filter((a) => (a.frequencia ?? 0) >= min);
    }

    const porNome = (x, y) => x.nome.localeCompare(y.nome, 'pt-BR');
    r.sort((x, y) => {
      if (ordem === 'turma') return (x.turma_nome || '').localeCompare(y.turma_nome || '', 'pt-BR') || porNome(x, y);
      if (ordem === 'nascimento') return (x.nascimento || '').localeCompare(y.nascimento || '') || porNome(x, y);
      if (ordem === 'frequencia') return (y.frequencia ?? -1) - (x.frequencia ?? -1) || porNome(x, y);
      if (ordem === 'numero') return (x.numero ?? 999) - (y.numero ?? 999) || porNome(x, y);
      return porNome(x, y);
    });

    return r;
  }, [alunos.data, turmaId, posicao, situacao, nascidoDe, nascidoAte, freqMin, ordem]);

  /* O mesmo texto vai para o cabeçalho do PDF e para o nome do arquivo:
     daqui a um mês ninguém lembra o que "relatorio-3.pdf" filtrava. */
  const descricao = useMemo(() => {
    const partes = [];
    partes.push(turmaId ? turmas.data?.find((t) => t.id === turmaId)?.nome ?? 'Turma' : 'Todas as turmas');
    if (posicao) partes.push(posicao);
    if (nascidoDe && nascidoAte) partes.push(nascidoDe === nascidoAte ? `nascidos em ${nascidoDe}` : `nascidos de ${nascidoDe} a ${nascidoAte}`);
    else if (nascidoDe) partes.push(`nascidos a partir de ${nascidoDe}`);
    else if (nascidoAte) partes.push(`nascidos até ${nascidoAte}`);
    if (situacao !== 'todas') partes.push(`mensalidade: ${SITUACOES.find((s) => s.valor === situacao).rotulo.toLowerCase()}`);
    if (freqMin !== '') partes.push(`frequência ≥ ${freqMin}%`);
    if (arquivados) partes.push('arquivados');
    return partes.join(' · ');
  }, [turmaId, turmas.data, posicao, nascidoDe, nascidoAte, situacao, freqMin, arquivados]);

  const limpar = () => {
    setTurmaId(''); setPosicao(''); setSituacao('todas');
    setNascidoDe(''); setNascidoAte(''); setFreqMin('');
    setOrdem('nome'); setArquivados(false);
  };

  const filtrando =
    Boolean(turmaId || posicao || nascidoDe || nascidoAte || freqMin !== '' || arquivados) ||
    situacao !== 'todas';

  const baixarPDF = async () => {
    setGerando(true);
    try {
      // o jsPDF só entra no bundle de quem realmente gera o relatório
      const { relatorioAlunosPDF } = await import('../lib/pdf.js');
      relatorioAlunosPDF({
        escolinha,
        descricao,
        alunos: lista,
        agruparPorTurma: agrupar && !turmaId,
      });
      toast(`${lista.length} atleta${lista.length === 1 ? '' : 's'} no PDF`);
    } catch (e) {
      toast(e.message);
    } finally {
      setGerando(false);
    }
  };

  const baixarCSV = () => {
    exportarCSV(
      `atletas-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Número', 'Atleta', 'Nascimento', 'Idade', 'Turma', 'Professor', 'Posição',
        'Responsável', 'Parentesco', 'WhatsApp', 'E-mail',
        'Treinos', 'Presenças', 'Faltas', 'Justificadas', 'Frequência',
        'Mensalidade', 'Situação', 'Matriculado em'],
      lista.map((a) => [
        a.numero, a.nome, dataBR(a.nascimento), idade(a.nascimento),
        a.turma_nome, a.turma_professor, a.posicao,
        a.responsavel_nome, a.responsavel_parentesco, a.responsavel_telefone, a.responsavel_email,
        a.treinos, a.presencas, a.faltas, a.justificadas,
        a.frequencia != null ? `${a.frequencia}%` : '',
        brl(a.valor_centavos), situacaoMensalidade(a).rotulo, dataBR(a.matriculado_em),
      ])
    );
    toast(`${lista.length} atleta${lista.length === 1 ? '' : 's'} no CSV`);
  };

  if (alunos.isError) return <Erro erro={alunos.error} aoTentar={alunos.refetch} />;

  return (
    <>
      <PageHead
        titulo="Relatórios"
        sub="Escolha o recorte e baixe em PDF para imprimir ou em CSV para abrir no Excel."
      />

      <div className="grid gap-4 lg:grid-cols-[340px_1fr] lg:items-start">
        <Panel titulo="Filtros" extra={filtrando ? <button onClick={limpar} className="text-xs font-semibold text-accent">Limpar</button> : null} corpo className="lg:sticky lg:top-5">
          <div className="grid gap-3.5">
            <Field label="Turma">
              <Select value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
                <option value="">Todas as turmas</option>
                {(turmas.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </Select>
            </Field>

            <Field
              label="Ano de nascimento"
              dica={anos.length ? `O elenco tem atletas de ${anos[0]} a ${anos.at(-1)}.` : undefined}
            >
              <div className="flex items-center gap-2">
                <Select value={nascidoDe} onChange={(e) => setNascidoDe(e.target.value)}>
                  <option value="">De</option>
                  {anos.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
                <span className="text-xs text-ink3">até</span>
                <Select value={nascidoAte} onChange={(e) => setNascidoAte(e.target.value)}>
                  <option value="">Até</option>
                  {anos.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              </div>
            </Field>

            <Field label="Posição">
              <Select value={posicao} onChange={(e) => setPosicao(e.target.value)}>
                <option value="">Qualquer posição</option>
                {POSICOES.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>

            <Field label="Mensalidade">
              <Select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
                {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
              </Select>
            </Field>

            <Field label="Frequência mínima" dica="Deixe vazio para não filtrar por presença.">
              <Input
                type="number" min="0" max="100" inputMode="numeric"
                placeholder="ex.: 75"
                value={freqMin}
                onChange={(e) => setFreqMin(e.target.value)}
              />
            </Field>

            <Field label="Ordenar por">
              <Select value={ordem} onChange={(e) => setOrdem(e.target.value)}>
                {ORDENS.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
              </Select>
            </Field>

            <div className="grid gap-2 border-t border-line pt-3.5">
              <Marcar checado={agrupar} onChange={setAgrupar} desativado={Boolean(turmaId)}>
                Separar por turma no PDF
              </Marcar>
              <Marcar checado={arquivados} onChange={setArquivados}>
                Mostrar arquivados em vez dos ativos
              </Marcar>
            </div>
          </div>
        </Panel>

        <div className="grid gap-4">
          <Panel
            titulo={alunos.isPending ? 'Carregando…' : `${lista.length} atleta${lista.length === 1 ? '' : 's'}`}
            extra={<Tag tom={lista.length ? 'ok' : 'neutro'}>{descricao}</Tag>}
          >
            {alunos.isPending ? (
              <Esqueleto linhas={6} />
            ) : !lista.length ? (
              <Vazio
                icone="🔍"
                titulo="Nenhum atleta com esse recorte"
                texto="Afrouxe algum filtro — ou confira se está olhando os ativos e não os arquivados."
              >
                {filtrando && <Btn variante="ghost" onClick={limpar}>Limpar filtros</Btn>}
              </Vazio>
            ) : (
              <>
                {/* celular: cartões */}
                <ul className="lg:hidden">
                  {lista.map((a) => {
                    const s = situacaoMensalidade(a);
                    return (
                      <li key={a.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface2 text-xs font-bold text-ink2">
                          {a.numero ?? '–'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <b className="block truncate text-[13px]">{a.nome}</b>
                          <small className="block text-xs text-ink3">
                            {[a.turma_nome, a.nascimento ? `${a.nascimento.slice(0, 4)} · ${idade(a.nascimento)} anos` : null]
                              .filter(Boolean).join(' · ')}
                          </small>
                        </div>
                        <div className="shrink-0 text-right">
                          <b className={`block text-[13px] tnum ${corFreq(a.frequencia)}`}>
                            {a.frequencia != null ? `${a.frequencia}%` : '—'}
                          </b>
                          <Tag tom={s.tom}>{s.rotulo}</Tag>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {/* desktop: tabela */}
                <table className="hidden w-full border-collapse text-[13px] lg:table">
                  <thead>
                    <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-4 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:tracking-[0.1em] [&>th]:text-ink3 [&>th]:uppercase">
                      <th>Atleta</th>
                      <th>Turma</th>
                      <th>Nascimento</th>
                      <th>Posição</th>
                      <th>Responsável</th>
                      <th className="!text-right">Freq.</th>
                      <th className="!text-right">Mensalidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((a) => {
                      const s = situacaoMensalidade(a);
                      return (
                        <tr key={a.id} className="border-b border-line last:border-0 [&>td]:px-4 [&>td]:py-2.5">
                          <td>
                            <b className="font-semibold">{a.nome}</b>
                            {a.numero != null && <span className="ml-1.5 text-xs text-ink3">#{a.numero}</span>}
                          </td>
                          <td className="text-ink2">{a.turma_nome || '—'}</td>
                          <td className="tnum text-ink2">
                            {a.nascimento ? `${dataBR(a.nascimento)} · ${idade(a.nascimento)}a` : '—'}
                          </td>
                          <td className="text-ink2">{a.posicao || '—'}</td>
                          <td className="text-ink2">
                            {a.responsavel_nome || '—'}
                            {a.responsavel_telefone && (
                              <small className="block text-xs text-ink3">{a.responsavel_telefone}</small>
                            )}
                          </td>
                          <td className={`tnum text-right font-semibold ${corFreq(a.frequencia)}`}>
                            {a.frequencia != null ? `${a.frequencia}%` : '—'}
                          </td>
                          <td className="text-right">
                            <span className="tnum block">{brl(a.valor_centavos)}</span>
                            <Tag tom={s.tom}>{s.rotulo}</Tag>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </Panel>

          <div className="flex flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            <Btn onClick={baixarPDF} carregando={gerando} disabled={!lista.length}>
              Baixar PDF
            </Btn>
            <Btn variante="ghost" onClick={baixarCSV} disabled={!lista.length}>
              Baixar CSV
            </Btn>
          </div>
        </div>
      </div>
    </>
  );
}

function Marcar({ checado, onChange, desativado = false, children }) {
  return (
    <label className={`flex items-center gap-2.5 text-[13px] ${desativado ? 'opacity-45' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checado && !desativado}
        disabled={desativado}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 accent-accent"
      />
      <span className="text-ink2">{children}</span>
    </label>
  );
}
