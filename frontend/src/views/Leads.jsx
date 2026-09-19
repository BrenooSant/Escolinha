import { useMemo, useState } from 'react';
import {
  Alerta, Btn, Chips, Confirmar, Erro, Esqueleto, Field, Input, Panel, Select, Sheet, SheetFoot,
  Tag, Textarea, Tile, Vazio, useToast,
} from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useAcao, useLeads, useNotasLead, useTurmas } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiLeads from '../api/leads.js';
import {
  ETAPAS, MOTIVOS_PERDA, ORIGENS, conversao, emAberto, etapa, origem, paraRetornar,
} from '../lib/leads.js';
import {
  dataBR, dataCurta, hojeISO, idade, linkWhatsApp, mascaraTelefone, primeiroNome,
} from '../lib/format.js';
import { urlMatricula } from './LinkMatricula.jsx';
import FormAluno from './FormAluno.jsx';

const FILTROS = ['Em aberto', ...ETAPAS.map((e) => e.rotulo)];

export const urlAula = (codigo) => {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/aula/${codigo}`;
};

const somarDias = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* "2026-09-20T18:30" no fuso de quem usa, para o input datetime-local. */
const paraInputDataHora = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const dataHora = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/* Quem ainda não é aluno: do primeiro contato à matrícula. A lista abre
   no que está em aberto, e o topo mostra o que é para hoje. */
export default function Leads() {
  const leads = useLeads();
  const [filtro, setFiltro] = useState('Em aberto');
  const [termo, setTermo] = useState('');
  const [abertoId, setAbertoId] = useState(null);
  const [novo, setNovo] = useState(false);
  const hoje = hojeISO();

  const lista = useMemo(() => {
    const t = termo.trim().toLowerCase();
    return (leads.data ?? []).filter((l) => {
      const naEtapa =
        filtro === 'Em aberto' ? emAberto(l) : etapa(l.etapa).rotulo === filtro;
      const naBusca =
        !t ||
        l.aluno_nome.toLowerCase().includes(t) ||
        (l.resp_nome || '').toLowerCase().includes(t) ||
        l.telefone.replace(/\D/g, '').includes(t.replace(/\D/g, '') || '§');
      return naEtapa && naBusca;
    });
  }, [leads.data, filtro, termo]);

  const numeros = useMemo(() => {
    const todos = leads.data ?? [];
    return {
      abertos: todos.filter(emAberto).length,
      retornar: todos.filter((l) => paraRetornar(l, hoje)),
      aulasHoje: todos.filter(
        (l) => l.etapa === 'experimental' && l.aula_em && paraInputDataHora(l.aula_em).slice(0, 10) === hoje
      ),
      experimentais: todos.filter((l) => l.etapa === 'experimental').length,
      conversao: conversao(todos),
    };
  }, [leads.data, hoje]);

  const aberto = (leads.data ?? []).find((l) => l.id === abertoId);

  if (leads.isPending) return <Esqueleto linhas={6} />;
  if (leads.isError) return <Erro erro={leads.error} aoTentar={leads.refetch} />;

  const paraHoje = [...numeros.aulasHoje, ...numeros.retornar.filter((l) => !numeros.aulasHoje.includes(l))];

  return (
    <>
      <PageHead titulo="Leads" sub="Quem ainda não é aluno — do primeiro contato à matrícula.">
        <Btn onClick={() => setNovo(true)}>+ Lead</Btn>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Tile rotulo="Em aberto" valor={numeros.abertos} nota="no funil agora" />
        <Tile
          rotulo="Retornar"
          valor={numeros.retornar.length}
          nota="com data vencida ou de hoje"
          alerta={numeros.retornar.length > 0}
        />
        <Tile rotulo="Aula experimental" valor={numeros.experimentais} nota={`${numeros.aulasHoje.length} hoje`} />
        <Tile
          rotulo="Conversão"
          valor={numeros.conversao.pct != null ? `${numeros.conversao.pct}%` : '—'}
          nota={`${numeros.conversao.matriculados} de ${numeros.conversao.total} nos últimos 90 dias`}
        />
      </div>

      {paraHoje.length > 0 && (
        <Panel titulo="Para hoje" extra={<Tag tom="warn">{paraHoje.length}</Tag>} className="mb-4">
          <ul>
            {paraHoje.map((l) => (
              <ItemLead key={l.id} l={l} hoje={hoje} onAbrir={() => setAbertoId(l.id)} />
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        titulo={
          <div className="relative w-full sm:max-w-72">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink3">⌕</span>
            <input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar nome ou telefone..."
              aria-label="Buscar lead"
              className="w-full rounded-lg border border-line bg-surface py-2 pr-3 pl-8 text-ink placeholder:text-ink3"
            />
          </div>
        }
      >
        <div className="border-b border-line px-4 py-3">
          <Chips opcoes={FILTROS} valor={filtro} onChange={setFiltro} />
        </div>
        {lista.length === 0 ? (
          <Vazio
            icone="🎯"
            titulo={termo ? 'Ninguém nesta busca' : 'Nenhum lead aqui'}
            texto={
              termo
                ? 'Tente outro nome ou telefone.'
                : 'Cadastre quem chamou no Instagram ou no WhatsApp, ou divulgue o link de aula experimental abaixo.'
            }
          >
            {!termo && <Btn onClick={() => setNovo(true)}>+ Lead</Btn>}
          </Vazio>
        ) : (
          <ul>
            {lista.map((l) => (
              <ItemLead key={l.id} l={l} hoje={hoje} onAbrir={() => setAbertoId(l.id)} />
            ))}
          </ul>
        )}
      </Panel>

      <LinkAula />

      {aberto && <FichaLead lead={aberto} onFechar={() => setAbertoId(null)} />}
      <FormLead aberto={novo} onFechar={() => setNovo(false)} onCriado={(l) => { setNovo(false); setAbertoId(l.id); }} />
    </>
  );
}

/* ---------------------------------------------------------------- */
function ItemLead({ l, hoje, onAbrir }) {
  const e = etapa(l.etapa);
  const atrasado = paraRetornar(l, hoje) && l.proximo_contato < hoje;
  return (
    <li className="border-b border-line last:border-b-0">
      <button onClick={onAbrir} className="flex w-full items-start gap-3 p-3 text-left active:bg-surface2 sm:px-4">
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[13.5px] font-semibold">{l.aluno_nome}</b>
          <small className="block truncate text-xs text-ink3">
            {[l.resp_nome, l.telefone, l.nascimento && `${idade(l.nascimento)} anos`, l.turma?.nome]
              .filter(Boolean)
              .join(' · ')}
          </small>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Tag tom={e.tom}>{e.rotulo}</Tag>
            <span className="text-[11px] text-ink3">{origem(l.origem)}</span>
            {l.etapa === 'experimental' && l.aula_em && (
              <span className="text-[11px] font-semibold text-ink2">aula {dataHora(l.aula_em)}</span>
            )}
            {emAberto(l) && l.proximo_contato && (
              <span className={`text-[11px] font-semibold ${atrasado ? 'text-bad' : 'text-ink2'}`}>
                {l.proximo_contato === hoje ? 'retornar hoje' : `retornar ${dataCurta(l.proximo_contato)}`}
              </span>
            )}
            {l.etapa === 'perdido' && l.motivo_perda && (
              <span className="text-[11px] text-ink3">{l.motivo_perda}</span>
            )}
          </div>
        </div>
        <small className="shrink-0 text-[11px] text-ink3">{dataCurta(l.criado_em)}</small>
      </button>
    </li>
  );
}

/* ---------------------------------------------------------------- */
/* Tudo do lead num lugar só: etapa, retorno, aula, histórico e o que
   fazer em seguida (chamar, mandar o link, matricular). */
function FichaLead({ lead, onFechar }) {
  const toast = useToast();
  const { escolinha } = useSessao();
  const notas = useNotasLead(lead.id);
  const [nota, setNota] = useState('');
  const [editando, setEditando] = useState(false);
  const [perdendo, setPerdendo] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [matriculando, setMatriculando] = useState(false);

  const salvar = useAcao((dados) => apiLeads.salvar(lead.id, dados));
  const anotar = useAcao((t) => apiLeads.anotar(lead.id, t), { sucesso: () => setNota('') });
  const apagar = useAcao(() => apiLeads.apagar(lead.id), {
    sucesso: () => { toast('Lead apagado'); onFechar(); },
  });

  const e = etapa(lead.etapa);
  const nome = primeiroNome(lead.resp_nome || '');
  const chamar = (texto) => window.open(linkWhatsApp(lead.telefone, texto), '_blank');

  const mensagens = [
    {
      rotulo: 'Convidar para aula experimental',
      texto:
        `Olá${nome ? `, ${nome}` : ''}! Aqui é da ${escolinha?.nome}. ⚽ ` +
        `Que tal o(a) ${primeiroNome(lead.aluno_nome)} vir fazer uma aula experimental com a gente? ` +
        'Me diga o melhor dia e horário que eu reservo a vaga.',
    },
    {
      rotulo: 'Mandar o link de matrícula',
      texto:
        `Olá${nome ? `, ${nome}` : ''}! Para matricular o(a) ${primeiroNome(lead.aluno_nome)} ` +
        `é só preencher a ficha por aqui: ${urlMatricula(escolinha?.codigo_matricula)}`,
      depois: () => lead.etapa !== 'ficha' && salvar.mutate({ etapa: 'ficha' }),
    },
  ];

  const inicialAluno = useMemo(
    () => ({
      nome: lead.aluno_nome,
      nascimento: lead.nascimento ?? '',
      turma_id: lead.turma_id ?? '',
      resp_nome: lead.resp_nome ?? '',
      resp_telefone: mascaraTelefone(lead.telefone),
      resp_email: lead.email ?? '',
      // a observação do lead ("só à tarde") não é de saúde: não vai para a ficha
    }),
    // pelo id: a lista recarrega ao voltar para a aba, e um objeto novo
    // aqui apagaria o que já foi digitado no formulário aberto
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lead.id]
  );

  return (
    <>
      <Sheet aberto onFechar={onFechar} largura="max-w-xl" rotulo={`Lead ${lead.aluno_nome}`}>
        <header className="flex items-start gap-3 border-b border-line px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg sm:text-xl">{lead.aluno_nome}</h3>
            <small className="block text-[12.5px] text-ink3">
              {[lead.nascimento && `${idade(lead.nascimento)} anos`, lead.turma?.nome, origem(lead.origem)]
                .filter(Boolean)
                .join(' · ')}
            </small>
            <small className="block text-[12.5px] text-ink3">
              {[lead.resp_nome, lead.telefone].filter(Boolean).join(' · ')}
            </small>
          </div>
          <Tag tom={e.tom}>{e.rotulo}</Tag>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div>
            <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.12em] text-ink3 uppercase">Etapa</span>
            <div className="flex flex-wrap gap-1.5">
              {ETAPAS.filter((x) => x.id !== 'perdido').map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={lead.etapa === x.id}
                  onClick={() => lead.etapa !== x.id && salvar.mutate({ etapa: x.id })}
                  className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition ${
                    lead.etapa === x.id ? 'border-ink bg-ink text-ground' : 'border-line text-ink2 hover:bg-surface2'
                  }`}
                >
                  {x.rotulo}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={lead.etapa === 'perdido'}
                onClick={() => setPerdendo(true)}
                className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition ${
                  lead.etapa === 'perdido' ? 'border-bad bg-bad text-white' : 'border-line text-bad hover:bg-surface2'
                }`}
              >
                Perdido
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Retornar em">
              <Input
                type="date"
                value={lead.proximo_contato ?? ''}
                onChange={(ev) => salvar.mutate({ proximo_contato: ev.target.value || null })}
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[['Amanhã', 1], ['3 dias', 3], ['1 semana', 7]].map(([r, n]) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => salvar.mutate({ proximo_contato: somarDias(n) })}
                    className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-ink2 hover:bg-surface2"
                  >
                    {r}
                  </button>
                ))}
                {lead.proximo_contato && (
                  <button
                    type="button"
                    onClick={() => salvar.mutate({ proximo_contato: null })}
                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink3 hover:text-ink"
                  >
                    limpar
                  </button>
                )}
              </div>
            </Field>
            <Field label="Aula experimental">
              <Input
                type="datetime-local"
                value={paraInputDataHora(lead.aula_em)}
                onChange={(ev) =>
                  salvar.mutate({
                    aula_em: ev.target.value ? new Date(ev.target.value).toISOString() : null,
                    ...(ev.target.value && ['novo', 'contato'].includes(lead.etapa) ? { etapa: 'experimental' } : {}),
                  })
                }
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {mensagens.map((m) => (
              <Btn
                key={m.rotulo}
                variante="ghost"
                className="!min-h-10 !text-xs"
                onClick={() => { chamar(m.texto); m.depois?.(); }}
              >
                {m.rotulo}
              </Btn>
            ))}
            {lead.etapa !== 'matriculado' && (
              <Btn className="!min-h-10 !text-xs" onClick={() => setMatriculando(true)}>Matricular agora</Btn>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.12em] text-ink3 uppercase">Histórico</span>
            <form
              onSubmit={(ev) => { ev.preventDefault(); if (nota.trim()) anotar.mutate(nota.trim()); }}
              className="mb-3 flex gap-2"
            >
              <Input
                value={nota}
                onChange={(ev) => setNota(ev.target.value)}
                maxLength={1000}
                placeholder="Ligou, mãe pediu retorno sábado…"
                className="min-w-0 flex-1"
              />
              <Btn type="submit" carregando={anotar.isPending}>Anotar</Btn>
            </form>
            {lead.observacoes && (
              <p className="mb-2 rounded-lg bg-surface2 px-3 py-2 text-[12.5px] text-ink2">{lead.observacoes}</p>
            )}
            <ul className="space-y-2">
              {(notas.data ?? []).map((n) => (
                <li key={n.id} className="flex gap-2.5 text-[12.5px]">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.sistema ? 'bg-ink3/50' : 'bg-accent'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={n.sistema ? 'text-ink3' : 'text-ink'}>{n.texto}</span>
                    <small className="block text-[11px] text-ink3">{dataHora(n.criado_em)}</small>
                  </span>
                </li>
              ))}
              <li className="flex gap-2.5 text-[12.5px] text-ink3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink3/50" />
                Chegou em {dataBR(lead.criado_em)} · {origem(lead.origem)}
              </li>
            </ul>
          </div>

          <div className="flex gap-4 pt-1">
            <button onClick={() => setEditando(true)} className="text-xs font-semibold text-accent hover:underline">
              Editar dados
            </button>
            <button onClick={() => setApagando(true)} className="text-xs font-semibold text-bad hover:underline">
              Apagar lead
            </button>
          </div>
        </div>

        <SheetFoot>
          <Btn variante="ghost" onClick={onFechar}>Fechar</Btn>
          <Btn variante="ghost" onClick={() => chamar(`Olá${nome ? `, ${nome}` : ''}! Aqui é da ${escolinha?.nome}.`)}>
            Chamar no WhatsApp
          </Btn>
        </SheetFoot>
      </Sheet>

      <FormLead aberto={editando} lead={lead} onFechar={() => setEditando(false)} />
      <MarcarPerdido
        aberto={perdendo}
        onFechar={() => setPerdendo(false)}
        onConfirmar={(motivo) =>
          salvar.mutate(
            { etapa: 'perdido', motivo_perda: motivo, proximo_contato: null },
            { onSuccess: () => setPerdendo(false) }
          )
        }
        carregando={salvar.isPending}
      />
      <Confirmar
        aberto={apagando}
        titulo={`Apagar ${lead.aluno_nome}?`}
        texto="Some do funil e da conta de conversão, com o histórico. Para quem desistiu, prefira marcar como perdido."
        rotulo="Apagar"
        carregando={apagar.isPending}
        onConfirmar={() => apagar.mutate()}
        onFechar={() => setApagando(false)}
      />
      <FormAluno
        aberto={matriculando}
        inicial={inicialAluno}
        onFechar={() => setMatriculando(false)}
        onSalvo={(aluno) => salvar.mutate({ etapa: 'matriculado', aluno_id: aluno.id, proximo_contato: null })}
      />
    </>
  );
}

function MarcarPerdido({ aberto, onFechar, onConfirmar, carregando }) {
  const [motivo, setMotivo] = useState(MOTIVOS_PERDA[0]);
  const [outro, setOutro] = useState('');
  return (
    <Sheet aberto={aberto} onFechar={onFechar} largura="max-w-sm" rotulo="Marcar como perdido">
      <div className="px-5 pt-5">
        <h3 className="text-lg">Por que não fechou?</h3>
        <p className="mt-1 text-[13px] text-ink3">O motivo ajuda a ver onde o funil perde gente.</p>
      </div>
      <div className="space-y-3 px-5 py-4">
        <Select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo">
          {MOTIVOS_PERDA.map((m) => <option key={m}>{m}</option>)}
          <option value="">Outro motivo…</option>
        </Select>
        {motivo === '' && (
          <Input value={outro} onChange={(e) => setOutro(e.target.value)} maxLength={200} placeholder="Qual?" />
        )}
      </div>
      <SheetFoot>
        <Btn variante="ghost" onClick={onFechar}>Voltar</Btn>
        <Btn
          variante="perigo"
          carregando={carregando}
          onClick={() => onConfirmar((motivo || outro).trim() || 'Sem motivo informado')}
        >
          Marcar como perdido
        </Btn>
      </SheetFoot>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- */
function FormLead({ aberto, lead, onFechar, onCriado }) {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const turmas = useTurmas();
  const [telefone, setTelefone] = useState('');
  const [erro, setErro] = useState(null);
  const editando = Boolean(lead);

  const salvar = useAcao(
    (dados) => (editando ? apiLeads.salvar(lead.id, dados) : apiLeads.criar(escolinhaId, dados)),
    {
      sucesso: (l) => {
        toast(editando ? 'Lead atualizado' : 'Lead cadastrado');
        if (editando) onFechar();
        else onCriado?.(l);
      },
    }
  );

  if (!aberto) return null;

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);
    const tel = telefone || f.get('telefone');
    if (tel.replace(/\D/g, '').length < 10) return setErro('WhatsApp com DDD.');
    salvar.mutate(
      {
        aluno_nome: f.get('aluno_nome').trim(),
        nascimento: f.get('nascimento') || null,
        resp_nome: f.get('resp_nome').trim() || null,
        telefone: tel,
        origem: f.get('origem'),
        turma_id: f.get('turma_id') || null,
        observacoes: f.get('observacoes').trim() || null,
        ...(editando ? {} : { proximo_contato: hojeISO() }),
      },
      { onError: (err) => setErro(err.message) }
    );
  };

  return (
    <Sheet aberto onFechar={onFechar} rotulo={editando ? 'Editar lead' : 'Novo lead'}>
      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="px-5 pt-5">
          <h3 className="text-lg">{editando ? 'Editar lead' : 'Novo lead'}</h3>
          <p className="mt-1 text-[13px] text-ink3">
            {editando ? 'Os dados de contato.' : 'Quem chamou e ainda não é aluno. Entra para retornar hoje.'}
          </p>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          <Field label="Nome da criança" className="sm:col-span-2">
            <Input name="aluno_nome" required minLength={2} maxLength={80} defaultValue={lead?.aluno_nome ?? ''} />
          </Field>
          <Field label="Responsável">
            <Input name="resp_nome" maxLength={80} defaultValue={lead?.resp_nome ?? ''} />
          </Field>
          <Field label="WhatsApp com DDD">
            <Input
              name="telefone"
              inputMode="tel"
              required
              defaultValue={lead?.telefone ?? ''}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
              placeholder="(62) 99000-0000"
            />
          </Field>
          <Field label="Nascimento">
            <Input name="nascimento" type="date" defaultValue={lead?.nascimento ?? ''} />
          </Field>
          <Field label="Turma de interesse">
            <Select name="turma_id" defaultValue={lead?.turma_id ?? ''}>
              <option value="">Não sabe ainda</option>
              {(turmas.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Select>
          </Field>
          <Field label="Como chegou" className="sm:col-span-2">
            <Select name="origem" defaultValue={lead?.origem ?? 'instagram'}>
              {ORIGENS.filter(([o]) => o !== 'link_matricula' || lead?.origem === o).map(([o, r]) => (
                <option key={o} value={o}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Observações" className="sm:col-span-2">
            <Textarea name="observacoes" maxLength={500} className="min-h-16" defaultValue={lead?.observacoes ?? ''} />
          </Field>
          <div className="sm:col-span-2"><Alerta>{erro}</Alerta></div>
        </div>
        <SheetFoot>
          <Btn variante="ghost" type="button" onClick={onFechar}>Cancelar</Btn>
          <Btn type="submit" carregando={salvar.isPending}>{editando ? 'Salvar' : 'Cadastrar'}</Btn>
        </SheetFoot>
      </form>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- */
function LinkAula() {
  const toast = useToast();
  const { escolinha } = useSessao();
  if (!escolinha) return null;
  const url = urlAula(escolinha.codigo_matricula);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado — cole na bio do Instagram');
    } catch {
      toast('Não deu para copiar. Selecione o link e copie na mão.');
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
      <b className="mb-1 block text-[13px] font-semibold">Link de aula experimental</b>
      <p className="mb-3 text-[12.5px] text-ink3">
        Para a bio do Instagram e o status do WhatsApp. É um formulário curto — nome, idade e
        WhatsApp — e quem preenche entra aqui como lead novo, para retornar no mesmo dia.
        {!escolinha.matriculas_abertas && ' Está fora do ar enquanto o link de matrícula estiver encerrado.'}
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface2 px-3 py-2.5">
        <code className="min-w-0 flex-1 truncate text-[12px] text-ink2">{url}</code>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
        <Btn variante="ghost" onClick={copiar}>Copiar link</Btn>
        <Btn variante="ghost" onClick={() => window.open(url, '_blank')}>Ver como fica</Btn>
      </div>
    </div>
  );
}
