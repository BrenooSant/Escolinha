import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alerta, Barra, Btn, Erro, Esqueleto, Field, Foto, Panel, Select, Sheet, SheetFoot, Tag,
  Textarea, Vazio, useToast,
} from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useSessao } from '../estado/Sessao.jsx';
import { useAcao, useAgenda, useChamada, useTreinosDaTurma } from '../hooks/dados.js';
import * as apiChamada from '../api/chamada.js';
import { ICONE_MARCA, MARCA_CURTA, MOTIVOS, ROTULO_MARCA } from '../lib/constantes.js';
import { corFreq, dataCurta, diaDaSemana, hojeISO, hora, paraISO, primeiroNome } from '../lib/format.js';

/* Rascunho da chamada.

   Marcar 20 atletas leva minutos, e no meio disso o celular toca, chega
   notificação, o dedo encosta numa aba de baixo. Antes, qualquer uma
   dessas coisas apagava tudo sem avisar. Avisar não bastaria: quando o
   iOS descarta a aba em segundo plano, não há diálogo que salve — só ter
   guardado. Por isso o que está marcado fica no aparelho até a chamada
   ser salva de verdade.

   Uma semana de validade: rascunho de treino de mês passado é lixo. */
const CHAVE_RASCUNHO = (treinoId) => `chamada:rascunho:${treinoId}`;
const VALIDADE = 7 * 864e5;

function lerRascunho(treinoId) {
  try {
    const bruto = localStorage.getItem(CHAVE_RASCUNHO(treinoId));
    if (!bruto) return null;
    const r = JSON.parse(bruto);
    if (!r?.em || Date.now() - r.em > VALIDADE) {
      localStorage.removeItem(CHAVE_RASCUNHO(treinoId));
      return null;
    }
    return { marcas: r.marcas ?? {}, motivos: r.motivos ?? {} };
  } catch {
    return null; // aba anônima, storage cheio — seguir sem rascunho
  }
}

function gravarRascunho(treinoId, marcas, motivos) {
  try {
    localStorage.setItem(
      CHAVE_RASCUNHO(treinoId),
      JSON.stringify({ marcas, motivos, em: Date.now() })
    );
  } catch { /* sem rascunho é pior, mas não pode derrubar a marcação */ }
}

function apagarRascunho(treinoId) {
  try {
    localStorage.removeItem(CHAVE_RASCUNHO(treinoId));
  } catch { /* nada a fazer */ }
}

const BORDA = { P: 'border-l-ok', F: 'border-l-bad', J: 'border-l-warn', '': 'border-l-line' };
const ATIVO = {
  P: 'bg-ok text-white border-ok',
  F: 'bg-bad text-white border-bad',
  J: 'bg-warn text-white border-warn',
};

export default function Chamada() {
  const { treinoId } = useParams();
  return treinoId ? <Marcacao treinoId={treinoId} /> : <EscolherTreino />;
}

/* ---------------------------------------------------------------
   Passo 1 — escolher o treino
   --------------------------------------------------------------- */
function EscolherTreino() {
  const navegar = useNavigate();
  const de = useMemo(() => paraISO(new Date(Date.now() - 21 * 864e5)), []);
  const ate = useMemo(() => paraISO(new Date(Date.now() + 7 * 864e5)), []);
  const agenda = useAgenda(de, ate);

  const hoje = hojeISO();

  const { pendentes, feitos, futuros } = useMemo(() => {
    const lista = (agenda.data ?? []).filter((t) => t.status !== 'cancelado');
    return {
      pendentes: lista.filter((t) => t.status === 'agendado' && t.data <= hoje).reverse(),
      futuros: lista.filter((t) => t.status === 'agendado' && t.data > hoje),
      feitos: lista.filter((t) => t.status === 'realizado').reverse(),
    };
  }, [agenda.data, hoje]);

  const Item = ({ t, acento }) => (
    <li className="border-b border-line last:border-b-0">
      <button
        onClick={() => navegar(`/chamada/${t.id}`)}
        className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-surface2 sm:px-4"
      >
        <div className="w-12 shrink-0 text-center">
          <b className="tnum block font-display text-lg leading-none">{dataCurta(t.data).split('/')[0]}</b>
          <small className="text-[10px] tracking-wide text-ink3 uppercase">{diaDaSemana(t.data).slice(0, 3)}</small>
        </div>
        <div className="min-w-0 flex-1">
          <b className="block text-[13.5px] font-semibold">
            {t.turma_nome}
            {t.tipo === 'jogo' && <Tag tom="warn" className="ml-2">amistoso</Tag>}
          </b>
          <small className="block truncate text-xs text-ink3">
            {hora(t.hora)}
            {t.local ? ` · ${t.local}` : ''} · {t.elenco} atleta{t.elenco === 1 ? '' : 's'}
          </small>
        </div>
        {t.status === 'realizado' ? (
          <Tag tom="ok">{t.presentes}/{t.marcados} presentes</Tag>
        ) : (
          <Tag tom={acento}>{acento === 'bad' ? 'a marcar' : 'agendado'}</Tag>
        )}
      </button>
    </li>
  );

  return (
    <>
      <PageHead
        titulo="Chamada do treino"
        sub="Escolha o treino para marcar quem veio. A frequência e o relatório se atualizam sozinhos."
      >
        <Btn variante="ghost" onClick={() => navegar('/agenda')}>Agendar treino</Btn>
      </PageHead>

      {agenda.isPending ? (
        <Esqueleto linhas={5} />
      ) : agenda.isError ? (
        <Erro erro={agenda.error} aoTentar={agenda.refetch} />
      ) : !pendentes.length && !futuros.length && !feitos.length ? (
        <Panel>
          <Vazio
            icone="📋"
            titulo="Nenhum treino nas últimas semanas"
            texto="Monte a grade das turmas em Ajustes e gere os treinos na Agenda — depois é só marcar a chamada aqui."
          >
            <Btn onClick={() => navegar('/agenda')}>Abrir agenda</Btn>
          </Vazio>
        </Panel>
      ) : (
        <div className="space-y-4">
          {pendentes.length > 0 && (
            <Panel titulo="Esperando a chamada" extra={<Tag tom="bad">{pendentes.length}</Tag>}>
              <ul>{pendentes.map((t) => <Item key={t.id} t={t} acento="bad" />)}</ul>
            </Panel>
          )}
          {futuros.length > 0 && (
            <Panel titulo="Próximos treinos" extra={<Tag>{futuros.length}</Tag>}>
              <ul>{futuros.map((t) => <Item key={t.id} t={t} acento="warn" />)}</ul>
            </Panel>
          )}
          {feitos.length > 0 && (
            <Panel titulo="Chamadas já feitas" extra={<Tag tom="ok">{feitos.length}</Tag>}>
              <ul>{feitos.slice(0, 12).map((t) => <Item key={t.id} t={t} acento="ok" />)}</ul>
            </Panel>
          )}
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------
   Passo 2 — marcar
   --------------------------------------------------------------- */
function Marcacao({ treinoId }) {
  const navegar = useNavigate();
  const toast = useToast();
  const { gestor } = useSessao();
  const consulta = useChamada(treinoId);

  const [marcas, setMarcas] = useState({});
  const [motivos, setMotivos] = useState({});
  const [erro, setErro] = useState(null);
  const [sujo, setSujo] = useState(false);
  const [recuperado, setRecuperado] = useState(false);
  const [liberando, setLiberando] = useState(null);

  /* Parte do que já está gravado; enquanto o professor não mexer, um
     refetch pode reescrever sem perigo. Se houver rascunho de uma
     marcação interrompida, ele ganha do que veio do servidor. */
  useEffect(() => {
    if (!consulta.data || sujo) return;
    const rascunho = lerRascunho(treinoId);
    if (rascunho) {
      setMarcas(rascunho.marcas);
      setMotivos(rascunho.motivos);
      setSujo(true);
      setRecuperado(true);
      return;
    }
    setMarcas(consulta.data.marcas);
    setMotivos(consulta.data.motivos);
  }, [consulta.data, sujo, treinoId]);

  /* Guarda a cada toque: sair da tela deixa de perder o que foi marcado. */
  useEffect(() => {
    if (sujo) gravarRascunho(treinoId, marcas, motivos);
  }, [sujo, marcas, motivos, treinoId]);

  /* Fechar a aba ou recarregar não passa pelo React — aqui o navegador
     é quem pergunta. */
  useEffect(() => {
    if (!sujo) return;
    const avisar = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sujo]);

  const salvar = useAcao(() => apiChamada.salvar(treinoId, marcas, motivos), {
    sucesso: () => {
      apagarRascunho(treinoId);
      setSujo(false);
      setRecuperado(false);
    },
  });

  /* Volta ao que está no banco e joga o rascunho fora. */
  const descartarRascunho = () => {
    apagarRascunho(treinoId);
    setMarcas(consulta.data.marcas);
    setMotivos(consulta.data.motivos);
    setSujo(false);
    setRecuperado(false);
  };

  const treino = consulta.data?.treino;
  const elenco = consulta.data?.elenco ?? [];
  const modo = consulta.data?.modoBloqueio ?? 'avisar';
  const bloqueados = elenco.filter((a) => a.bloqueado && !a.liberacao).length;
  const historico = useTreinosDaTurma(treino?.turma_id, treino?.data);

  const placar = useMemo(() => {
    let p = 0, f = 0, j = 0;
    for (const a of elenco) {
      const m = marcas[a.id];
      if (m === 'P') p++;
      else if (m === 'F') f++;
      else if (m === 'J') j++;
    }
    const marcados = p + f + j;
    return {
      p, f, j, marcados,
      naoMarcados: elenco.length - marcados,
      indice: marcados ? Math.round(((p + j) / marcados) * 100) : 0,
    };
  }, [elenco, marcas]);

  if (consulta.isPending) return <Esqueleto linhas={8} />;
  if (consulta.isError) return <Erro erro={consulta.error} aoTentar={consulta.refetch} />;

  const total = elenco.length || 1;

  /* O banco recusa presença de atleta bloqueado — a tela só antecipa a
     recusa, para o professor não marcar 20 atletas e descobrir no fim.
     Falta e justificada passam direto: elas dizem que ele não treinou,
     que é o que o bloqueio quer. */
  const travado = (a) => a.bloqueado && !a.liberacao;

  const marcar = (id, valor) => {
    const a = elenco.find((x) => x.id === id);
    if (valor === 'P' && a && travado(a)) {
      if (modo === 'impedir') {
        toast(`${primeiroNome(a.nome)} está com mensalidade em atraso`);
      } else if (gestor) {
        setLiberando(a);
      } else {
        toast(`${primeiroNome(a.nome)} está bloqueado — só o gestor libera`);
      }
      return;
    }
    setSujo(true);
    setMarcas((m) => ({ ...m, [id]: valor }));
  };

  const todosPresentes = () => {
    setSujo(true);
    const livres = elenco.filter((a) => !travado(a));
    setMarcas(Object.fromEntries(livres.map((a) => [a.id, 'P'])));
    toast(
      livres.length === elenco.length
        ? 'Todos presentes — agora ajuste quem faltou'
        : `${livres.length} presentes · ${elenco.length - livres.length} bloqueado${
            elenco.length - livres.length > 1 ? 's' : ''
          } de fora`
    );
  };

  const limpar = () => {
    setSujo(true);
    setMarcas({});
  };

  const gravar = () => {
    setErro(null);
    if (placar.naoMarcados) {
      setErro(`Ainda faltam ${placar.naoMarcados} atleta${placar.naoMarcados > 1 ? 's' : ''} sem marcação.`);
      return;
    }
    salvar.mutate(undefined, {
      onSuccess: () => {
        toast(`Chamada do ${treino.turma_nome} salva · ${placar.p} de ${elenco.length} presentes`);
        navegar('/chamada');
      },
      onError: (e) => setErro(e.message),
    });
  };

  return (
    <>
      <PageHead
        titulo={`Chamada · ${treino.turma_nome}`}
        sub={`${diaDaSemana(treino.data)}, ${dataCurta(treino.data)} às ${hora(treino.hora)}${
          treino.local ? ` · ${treino.local}` : ''
        }`}
      >
        <Btn variante="ghost" onClick={() => navegar('/chamada')}>Trocar treino</Btn>
        <Btn onClick={gravar} carregando={salvar.isPending}>
          {treino.status === 'realizado' ? 'Salvar correção' : 'Salvar chamada'}
        </Btn>
      </PageHead>

      {recuperado && (
        <div className="mb-3.5 flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3">
          <span className="text-[13px] text-ink2">
            <b className="font-semibold">Marcação recuperada.</b>{' '}
            Você saiu antes de salvar — está tudo aqui do jeito que ficou.
          </span>
          <button
            onClick={descartarRascunho}
            className="ml-auto shrink-0 text-xs font-semibold text-ink3 underline-offset-2 hover:text-bad hover:underline"
          >
            Descartar e recomeçar
          </button>
        </div>
      )}

      {treino.status === 'realizado' && (
        <div className="mb-3.5">
          <Alerta tom="ok">
            Esta chamada já foi salva. Alterar aqui recalcula a frequência dos atletas.
          </Alerta>
        </div>
      )}

      {bloqueados > 0 && (
        <div className="mb-3.5">
          <Alerta tom="warn">
            {bloqueados === 1 ? 'Um atleta está' : `${bloqueados} atletas estão`} com a mensalidade
            em atraso e não {bloqueados === 1 ? 'pode' : 'podem'} ser marcado
            {bloqueados === 1 ? '' : 's'} presente{bloqueados === 1 ? '' : 's'}.{' '}
            {modo === 'impedir'
              ? 'Regularize a mensalidade para liberar.'
              : gestor
                ? 'Toque em Presente para liberar com um motivo.'
                : 'Só o gestor pode liberar.'}
          </Alerta>
        </div>
      )}

      <Panel>
        <div className="flex flex-col gap-3.5 border-b border-line p-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex-1">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <b className="text-[13px] font-semibold">
                {placar.marcados} de {elenco.length} marcados
              </b>
              <span className="text-xs text-ink3">
                {placar.naoMarcados === 0
                  ? 'tudo pronto — é só salvar'
                  : `faltam ${placar.naoMarcados} atleta${placar.naoMarcados > 1 ? 's' : ''}`}
              </span>
            </div>
            <Barra
              fatias={[
                { cor: 'bg-ok', pct: (placar.p / total) * 100 },
                { cor: 'bg-bad', pct: (placar.f / total) * 100 },
                { cor: 'bg-warn', pct: (placar.j / total) * 100 },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Btn variante="ghost" onClick={todosPresentes} className="whitespace-nowrap">
              ✓ Todos presentes
            </Btn>
            <Btn variante="ghost" onClick={limpar}>Limpar</Btn>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
          {[
            ['Presentes', placar.p, 'text-ok'],
            ['Faltas', placar.f, 'text-bad'],
            ['Justificadas', placar.j, 'text-warn'],
            ['Índice do treino', placar.marcados ? `${placar.indice}%` : '—', ''],
          ].map(([rot, val, cor], i) => (
            <div
              key={rot}
              className={`px-4 py-3 ${i % 2 === 0 ? 'border-r border-line' : ''} ${
                i < 2 ? 'border-b border-line sm:border-b-0' : ''
              } sm:border-r sm:last:border-r-0`}
            >
              <span className="text-[11px] font-semibold tracking-[0.1em] text-ink3 uppercase">{rot}</span>
              <b className={`tnum block font-display text-2xl leading-tight font-semibold ${cor}`}>{val}</b>
            </div>
          ))}
        </div>

        {elenco.length === 0 ? (
          <Vazio
            icone="👕"
            titulo="Nenhum atleta nesta turma"
            texto="Matricule alguém na turma ou mova atletas de outra categoria para poder fazer a chamada."
          >
            <Btn onClick={() => navegar('/alunos')}>Ver alunos</Btn>
          </Vazio>
        ) : (
          <ul>
            {elenco.map((a) => (
              <Atleta
                key={a.id}
                a={a}
                travado={travado(a)}
                marca={marcas[a.id] || ''}
                motivo={motivos[a.id]}
                onMarcar={marcar}
                onMotivo={(id, v) => { setSujo(true); setMotivos((m) => ({ ...m, [id]: v })); }}
              />
            ))}
          </ul>
        )}
      </Panel>

      {erro && <div className="mt-3"><Alerta>{erro}</Alerta></div>}

      <LiberarAtleta
        aluno={liberando}
        treinoId={treinoId}
        onFechar={() => setLiberando(null)}
        aoLiberar={(id) => {
          setLiberando(null);
          setSujo(true);
          setMarcas((m) => ({ ...m, [id]: 'P' }));
        }}
      />

      <Panel className="mt-4" titulo="Últimas chamadas desta turma" extra={<Tag>{treino.turma_nome}</Tag>}>
        {historico.isPending ? (
          <Esqueleto linhas={1} />
        ) : (
          <div className="no-bar flex gap-2.5 overflow-x-auto p-4">
            {(historico.data ?? [])
              .filter((t) => t.status === 'realizado' && t.id !== treino.id)
              .slice(0, 8)
              .map((t) => {
                const i = t.marcados ? Math.round(((t.presentes + t.justificadas) / t.marcados) * 100) : 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => navegar(`/chamada/${t.id}`)}
                    className="w-24 shrink-0 rounded-xl border border-line p-3 text-left transition hover:border-accent"
                  >
                    <small className="block text-[11px] text-ink3">{dataCurta(t.data)}</small>
                    <b className={`block font-display text-xl font-semibold ${corFreq(i)}`}>{i}%</b>
                    <span className="tnum text-[11px] text-ink3">{t.presentes} de {t.marcados}</span>
                  </button>
                );
              })}
            {(historico.data ?? []).filter((t) => t.status === 'realizado' && t.id !== treino.id).length === 0 && (
              <p className="px-1 py-3 text-[13px] text-ink3">Esta é a primeira chamada da turma.</p>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}

function Atleta({ a, travado, marca, motivo, onMarcar, onMotivo }) {
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-l-[3px] border-b-line p-3 last:border-b-0 ${
        BORDA[marca]
      } ${marca ? '' : 'bg-surface2/40'}`}
    >
      <Foto num={a.numero} nome={a.nome} />

      <div className="min-w-0 flex-1">
        <b className="block truncate text-[13.5px] font-semibold">{a.nome}</b>
        <small className="text-xs text-ink3">{a.posicao || '—'}</small>
        {travado ? (
          <Tag tom="bad" className="ml-2">Bloqueado</Tag>
        ) : a.liberacao ? (
          <Tag tom="warn" className="ml-2">Liberado</Tag>
        ) : (
          a.em_atraso && <Tag tom="bad" className="ml-2">Pagamento em atraso</Tag>
        )}
        {/* Tag é whitespace-nowrap: um motivo de 200 caracteres dentro
            dela estouraria a linha no celular. Aqui embaixo, quebra. */}
        {a.liberacao && !travado && (
          <small className="mt-1 block text-[11px] text-ink3">{a.liberacao.motivo}</small>
        )}
        {a.frequencia != null && (
          <div className="mt-1.5 flex max-w-52 items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface2">
              <i
                className={`block h-full ${a.frequencia < 70 ? 'bg-bad' : 'bg-accent'}`}
                style={{ width: `${a.frequencia}%` }}
              />
            </span>
            <em className="tnum text-[11px] font-semibold text-ink3 not-italic">{a.frequencia}% no mês</em>
          </div>
        )}
      </div>

      {!marca && <Tag>a marcar</Tag>}

      {/* No celular ocupa a linha inteira; no desktop fica à direita. */}
      <div className="grid w-full grid-cols-3 overflow-hidden rounded-xl border border-line sm:flex sm:w-auto sm:rounded-lg">
        {['P', 'F', 'J'].map((v) => {
          /* O cadeado continua clicável: é o toque que explica por que
             não dá, e é por ele que o gestor abre a liberação. Botão
             morto só faria o professor achar que a tela travou. */
          const preso = travado && v === 'P';
          return (
            <button
              key={v}
              type="button"
              aria-pressed={marca === v}
              aria-label={
                preso
                  ? `${ROTULO_MARCA[v]}: ${a.nome} — bloqueado por mensalidade em atraso`
                  : `${ROTULO_MARCA[v]}: ${a.nome}`
              }
              onClick={() => onMarcar(a.id, marca === v ? '' : v)}
              className={`flex min-h-11 items-center justify-center gap-1.5 border-r border-line text-xs font-semibold transition last:border-r-0 sm:px-3.5 ${
                marca === v
                  ? ATIVO[v]
                  : preso
                    ? 'text-bad/55 hover:bg-badbg'
                    : 'text-ink3 hover:bg-surface2 hover:text-ink'
              }`}
            >
              <i
                className={`grid size-4 place-items-center rounded-full border-[1.5px] border-current text-[9px] not-italic ${
                  marca === v ? 'bg-white/20' : 'opacity-55'
                }`}
              >
                {preso ? '🔒' : ICONE_MARCA[v]}
              </i>
              {MARCA_CURTA[v]}
            </button>
          );
        })}
      </div>

      {marca === 'J' && (
        <Select
          value={motivo || ''}
          onChange={(e) => onMotivo(a.id, e.target.value)}
          aria-label={`Motivo da ausência de ${a.nome}`}
          className="w-full py-2 text-xs sm:w-52"
        >
          <option value="">Motivo da falta…</option>
          {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
        </Select>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------
   Liberar um atleta bloqueado
   Só o gestor chega aqui — o professor recebe o aviso e segue. O
   motivo é obrigatório porque é ele que a ficha vai mostrar depois:
   uma liberação sem motivo não explica nada a ninguém.
   --------------------------------------------------------------- */
function LiberarAtleta({ aluno, treinoId, onFechar, aoLiberar }) {
  const toast = useToast();
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState(null);

  const liberar = useAcao((texto) => apiChamada.liberar(treinoId, aluno.id, texto));

  /* Cada atleta abre a folha limpa — senão o motivo do anterior fica. */
  useEffect(() => {
    setMotivo('');
    setErro(null);
  }, [aluno?.id]);

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    const texto = motivo.trim();
    if (texto.length < 3) return setErro('Escreva o motivo — ele fica na ficha do atleta.');

    liberar.mutate(texto, {
      onSuccess: () => {
        toast(`${primeiroNome(aluno.nome)} liberado para este treino`);
        aoLiberar(aluno.id);
      },
      onError: (err) => setErro(err.message),
    });
  };

  return (
    <Sheet
      aberto={Boolean(aluno)}
      onFechar={onFechar}
      largura="max-w-md"
      rotulo="Liberar atleta bloqueado"
    >
      {aluno && (
        <form onSubmit={enviar}>
          <div className="px-5 pt-5 pb-1">
            <h3 className="text-lg">Liberar {primeiroNome(aluno.nome)}?</h3>
            <p className="mt-1.5 text-[13px] text-ink3">
              A mensalidade está em atraso. A liberação vale só para o treino de hoje — no
              próximo, o bloqueio volta enquanto a mensalidade não for paga.
            </p>

            <div className="mt-4">
              <Field
                label="Motivo"
                dica="Fica registrado com o seu nome e a data, na ficha do atleta."
                erro={erro}
              >
                <Textarea
                  rows={3}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  maxLength={200}
                  autoFocus
                  placeholder="O pai disse que paga na sexta"
                />
              </Field>
            </div>
          </div>
          <SheetFoot>
            <Btn variante="ghost" type="button" onClick={onFechar}>Cancelar</Btn>
            <Btn type="submit" carregando={liberar.isPending}>Liberar e marcar presente</Btn>
          </SheetFoot>
        </form>
      )}
    </Sheet>
  );
}
