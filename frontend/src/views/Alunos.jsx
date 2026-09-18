import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Btn, Chips, Erro, Esqueleto, Foto, Panel, Tag, Vazio, useToast } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useAlunos, useTurmas } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import { situacaoMensalidade } from '../lib/constantes.js';
import { brl, corFreq, dataBR, idade } from '../lib/format.js';
import { exportarCSV } from '../lib/csv.js';
import Ficha from './Ficha.jsx';
import FormAluno from './FormAluno.jsx';
import ModalCobranca, { cobrancaDeMensalidade } from './ModalCobranca.jsx';
import * as apiFinanceiro from '../api/financeiro.js';

export default function Alunos() {
  const toast = useToast();
  const { gestor } = useSessao();
  const [params, setParams] = useSearchParams();
  const [termo, setTermo] = useState('');
  const [filtro, setFiltro] = useState('Todas');
  const [arquivados, setArquivados] = useState(false);
  const [fichaId, setFichaId] = useState(null);
  const [editando, setEditando] = useState(null);
  const [novo, setNovo] = useState(false);
  const [cobranca, setCobranca] = useState(null);

  const turmas = useTurmas();
  const alunos = useAlunos({ ativos: !arquivados });

  /* O painel manda para cá com ?novo=1 no atalho "Matricular atleta". */
  useEffect(() => {
    if (params.get('novo')) {
      if (gestor) setNovo(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams, gestor]);

  const opcoes = useMemo(
    () => ['Todas', ...(turmas.data ?? []).map((t) => t.nome)],
    [turmas.data]
  );

  const lista = useMemo(() => {
    const t = termo.trim().toLowerCase();
    return (alunos.data ?? []).filter(
      (a) =>
        (filtro === 'Todas' || a.turma_nome === filtro) &&
        (!t ||
          a.nome.toLowerCase().includes(t) ||
          (a.responsavel_nome || '').toLowerCase().includes(t) ||
          String(a.numero ?? '').includes(t))
    );
  }, [alunos.data, filtro, termo]);

  const ficha = useMemo(() => lista.find((a) => a.id === fichaId) ?? (alunos.data ?? []).find((a) => a.id === fichaId), [lista, alunos.data, fichaId]);

  const exportar = () => {
    // o professor exporta a lista sem as colunas de dinheiro
    const colunas = ['Nome', 'Número', 'Turma', 'Posição', 'Nascimento', 'Responsável', 'Parentesco', 'WhatsApp', 'Frequência'];
    exportarCSV(
      `alunos-${new Date().toISOString().slice(0, 10)}.csv`,
      gestor ? [...colunas, 'Mensalidade', 'Situação'] : colunas,
      lista.map((a) => {
        const linha = [
          a.nome, a.numero, a.turma_nome, a.posicao, dataBR(a.nascimento),
          a.responsavel_nome, a.responsavel_parentesco, a.responsavel_telefone,
          a.frequencia != null ? `${a.frequencia}%` : '',
        ];
        return gestor ? [...linha, brl(a.valor_centavos), situacaoMensalidade(a).rotulo] : linha;
      })
    );
    toast(`${lista.length} atletas exportados`);
  };

  return (
    <>
      <PageHead
        titulo="Alunos"
        sub={
          alunos.data
            ? `${alunos.data.length} atleta${alunos.data.length === 1 ? '' : 's'} ${arquivados ? 'arquivados' : 'matriculados'}`
            : 'carregando…'
        }
      >
        <Btn variante="ghost" onClick={exportar} disabled={!lista.length}>Exportar CSV</Btn>
        {gestor && <Btn onClick={() => setNovo(true)}>+ Novo aluno</Btn>}
      </PageHead>

      <Panel
        titulo={
          <div className="relative w-full sm:max-w-72">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink3">⌕</span>
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar atleta, responsável ou número..."
              aria-label="Buscar atleta ou responsável"
              className="w-full rounded-lg border border-line bg-surface py-2 pr-3 pl-8 text-ink placeholder:text-ink3"
            />
          </div>
        }
        extra={
          <button
            onClick={() => setArquivados((v) => !v)}
            className="shrink-0 text-xs font-semibold text-ink3 hover:text-accent"
          >
            {arquivados ? 'Ver ativos' : 'Ver arquivados'}
          </button>
        }
      >
        <div className="border-b border-line px-4 py-3">
          <Chips opcoes={opcoes} valor={filtro} onChange={setFiltro} />
        </div>

        {alunos.isPending ? (
          <Esqueleto linhas={6} />
        ) : alunos.isError ? (
          <Erro erro={alunos.error} aoTentar={alunos.refetch} />
        ) : lista.length === 0 ? (
          <Vazio
            icone={termo || filtro !== 'Todas' ? '🔍' : '⚽'}
            titulo={termo || filtro !== 'Todas' ? 'Nenhum atleta nesta busca' : 'Ainda não há atletas'}
            texto={
              termo || filtro !== 'Todas'
                ? 'Tente outro nome, ou limpe o filtro de turma.'
                : 'Matricule pelo painel ou mande o link público para os responsáveis preencherem a ficha.'
            }
          >
            {gestor && !termo && filtro === 'Todas' && <Btn onClick={() => setNovo(true)}>+ Novo aluno</Btn>}
          </Vazio>
        ) : (
          <>
            {/* ---- celular: cartões ---- */}
            <ul className="lg:hidden">
              {lista.map((a) => {
                const s = situacaoMensalidade(a);
                return (
                  <li key={a.id} className="border-b border-line last:border-b-0">
                    <button
                      onClick={() => setFichaId(a.id)}
                      className="flex w-full items-center gap-3 p-3 text-left active:bg-surface2"
                    >
                      <Foto num={a.numero} nome={a.nome} />
                      <div className="min-w-0 flex-1">
                        <b className="block truncate text-[13.5px] font-semibold">{a.nome}</b>
                        <small className="text-xs text-ink3">
                          {[a.turma_nome, a.posicao].filter(Boolean).join(' · ') || 'sem turma'}
                        </small>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {gestor && <Tag tom={s.tom}>{s.rotulo}</Tag>}
                          {a.frequencia != null && (
                            <span className={`tnum text-[11px] font-semibold ${corFreq(a.frequencia)}`}>
                              {a.frequencia}% de presença
                            </span>
                          )}
                        </div>
                      </div>
                      {gestor && (
                        <div className="shrink-0 text-right">
                          <b className="tnum block text-[13px]">{brl(a.valor_centavos)}</b>
                          <small className="text-[11px] text-ink3">por mês</small>
                        </div>
                      )}
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
                  <th>Turma</th>
                  <th>Posição</th>
                  <th>Responsável</th>
                  <th>Contato</th>
                  <th className="!text-right">Frequência</th>
                  {gestor && <th className="!text-right">Mensalidade</th>}
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => {
                  const s = situacaoMensalidade(a);
                  const anos = idade(a.nascimento);
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setFichaId(a.id)}
                      className="cursor-pointer hover:bg-surface2 [&>td]:border-b [&>td]:border-line [&>td]:px-4 [&>td]:py-2.5 [&:last-child>td]:border-b-0"
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <Foto num={a.numero} nome={a.nome} />
                          <div>
                            <b className="block font-semibold">{a.nome}</b>
                            <small className="text-xs text-ink3">
                              {a.nascimento ? `${dataBR(a.nascimento)}${anos != null ? ` · ${anos} anos` : ''}` : '—'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{a.turma_nome ? <Tag>{a.turma_nome}</Tag> : <span className="text-ink3">—</span>}</td>
                      <td className="text-ink2">{a.posicao || '—'}</td>
                      <td>
                        {a.responsavel_nome || '—'}
                        <br />
                        <small className="text-ink3">{a.responsavel_parentesco}</small>
                      </td>
                      <td className="tnum text-ink3">{a.responsavel_telefone || '—'}</td>
                      <td className="text-right">
                        <b className={`tnum ${corFreq(a.frequencia)}`}>
                          {a.frequencia != null ? `${a.frequencia}%` : '—'}
                        </b>
                        <br />
                        <small className="text-ink3">{a.presencas}/{a.treinos} treinos</small>
                      </td>
                      {gestor && (
                        <td className="text-right">
                          <b className="tnum">{brl(a.valor_centavos)}</b>
                          <br />
                          <Tag tom={s.tom}>{s.rotulo}</Tag>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Panel>

      <p className="mt-2.5 px-1 text-xs text-ink3">Toque em um atleta para abrir a ficha completa.</p>

      {ficha && (
        <Ficha
          aluno={ficha}
          onFechar={() => setFichaId(null)}
          onEditar={setEditando}
          onCobrar={async (a) => {
            // a cobrança de verdade: com plano, multa ou desconto, o valor não é o da turma
            try {
              setCobranca(cobrancaDeMensalidade(await apiFinanceiro.obter(a.mensalidade_id)));
            } catch (e) {
              toast(e.message);
            }
          }}
        />
      )}
      <FormAluno aberto={novo || Boolean(editando)} aluno={editando} onFechar={() => { setNovo(false); setEditando(null); }} />
      {cobranca && <ModalCobranca cobranca={cobranca} onFechar={() => setCobranca(null)} />}
    </>
  );
}
