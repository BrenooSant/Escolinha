import { useEffect, useState } from 'react';
import {
  Alerta, Btn, Confirmar, Erro, Esqueleto, Field, Input, Panel, Select, Sheet,
  SheetFoot, Tag, useToast,
} from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useAcao, useConvites, useEquipe, useQuesitos, useTurmas } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import { apagar as apagarEscolinha, salvarEscolinha } from '../api/escolinha.js';
import * as apiTurmas from '../api/turmas.js';
import * as apiEquipe from '../api/equipe.js';
import * as apiAvaliacoes from '../api/avaliacoes.js';
import * as apiAuth from '../api/auth.js';
import { brl, deCentavos, DIAS_SEMANA, DIAS_CURTOS, hora, iniciais, mascaraTelefone, paraCentavos } from '../lib/format.js';
import LinkMatricula from './LinkMatricula.jsx';

export default function Ajustes() {
  const { escolinha } = useSessao();

  return (
    <>
      <PageHead titulo="Ajustes" sub="Dados da escolinha, turmas, equipe e a sua conta." />

      <div className="space-y-4">
        <DadosEscolinha />
        <LinkMatricula />
        <Turmas />
        <Quesitos />
        <Equipe />
        <Conta />
        {escolinha?.papel === 'dono' && <ZonaDeRisco />}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- */
function DadosEscolinha() {
  const toast = useToast();
  const { escolinha, recarregar } = useSessao();
  const [erro, setErro] = useState(null);

  const salvar = useAcao((dados) => salvarEscolinha(escolinha.id, dados), {
    sucesso: async () => { await recarregar(); toast('Dados da escolinha salvos'); },
  });

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);
    salvar.mutate(
      {
        nome: f.get('nome').trim(),
        cidade: f.get('cidade').trim() || null,
        local_padrao: f.get('local_padrao').trim() || null,
        chave_pix: f.get('chave_pix').trim() || null,
        dia_vencimento: Number(f.get('dia_vencimento')),
      },
      { onError: (err) => setErro(err.message) }
    );
  };

  if (!escolinha) return null;

  return (
    <Panel titulo="A escolinha" corpo>
      <form onSubmit={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" className="sm:col-span-2">
          <Input name="nome" required minLength={2} defaultValue={escolinha.nome} />
        </Field>
        <Field label="Cidade">
          <Input name="cidade" defaultValue={escolinha.cidade ?? ''} placeholder="Goiânia, GO" />
        </Field>
        <Field label="Local padrão dos treinos">
          <Input name="local_padrao" defaultValue={escolinha.local_padrao ?? ''} placeholder="Campo do Bosque" />
        </Field>
        <Field label="Chave PIX" dica="Entra automaticamente na mensagem de cobrança.">
          <Input name="chave_pix" defaultValue={escolinha.chave_pix ?? ''} placeholder="12.345.678/0001-90" />
        </Field>
        <Field label="Mensalidade vence todo dia">
          <Select name="dia_vencimento" defaultValue={String(escolinha.dia_vencimento)}>
            {[5, 10, 15, 20, 25].map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2"><Alerta>{erro}</Alerta></div>
        <div className="sm:col-span-2">
          <Btn type="submit" carregando={salvar.isPending}>Salvar</Btn>
        </div>
      </form>
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
function Turmas() {
  const toast = useToast();
  const turmas = useTurmas();
  const [editando, setEditando] = useState(null);
  const [nova, setNova] = useState(false);
  const [apagando, setApagando] = useState(null);

  const apagar = useAcao(() => apiTurmas.apagar(apagando.id), {
    sucesso: () => { toast('Turma removida'); setApagando(null); },
  });

  return (
    <>
      <Panel
        titulo="Turmas"
        extra={<Btn variante="ghost" className="!min-h-8 !px-3 !text-xs" onClick={() => setNova(true)}>+ Nova turma</Btn>}
      >
        {turmas.isPending ? (
          <Esqueleto linhas={4} />
        ) : turmas.isError ? (
          <Erro erro={turmas.error} aoTentar={turmas.refetch} />
        ) : (
          <ul>
            {(turmas.data ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <b className="block text-[13px] font-semibold">{t.nome}</b>
                  <small className="block text-xs text-ink3">
                    {t.horarios?.length
                      ? t.horarios.map((h) => `${DIAS_CURTOS[h.dia_semana]} ${hora(h.hora)}`).join(' · ')
                      : 'sem grade — os treinos não serão gerados sozinhos'}
                  </small>
                </div>
                <span className="tnum text-xs text-ink2">{brl(t.mensalidade_centavos)}</span>
                <Tag>{t.atletas}/{t.capacidade}</Tag>
                <Btn variante="ghost" className="!min-h-9 !px-3 !text-xs" onClick={() => setEditando(t)}>Editar</Btn>
                <button
                  onClick={() => setApagando(t)}
                  className="px-1 text-ink3 transition hover:text-bad"
                  title="Apagar turma"
                  aria-label={`Apagar ${t.nome}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <FormTurma
        aberto={nova || Boolean(editando)}
        turma={editando}
        onFechar={() => { setNova(false); setEditando(null); }}
      />

      <Confirmar
        aberto={Boolean(apagando)}
        titulo={`Apagar a turma ${apagando?.nome}?`}
        texto={
          apagando?.atletas
            ? `${apagando.atletas} atleta(s) ficam sem turma, e os treinos dela somem da agenda.`
            : 'Os treinos dela somem da agenda.'
        }
        rotulo="Apagar turma"
        carregando={apagar.isPending}
        onConfirmar={() => apagar.mutate()}
        onFechar={() => setApagando(null)}
      />
    </>
  );
}

function FormTurma({ aberto, turma, onFechar }) {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const [horarios, setHorarios] = useState([]);
  const [erro, setErro] = useState(null);
  const editando = Boolean(turma);

  useEffect(() => {
    if (aberto) {
      setErro(null);
      setHorarios(
        (turma?.horarios ?? []).map((h) => ({ dia_semana: h.dia_semana, hora: h.hora.slice(0, 5), local: h.local ?? '' }))
      );
    }
  }, [aberto, turma]);

  const salvar = useAcao(
    async ({ dados, grade }) => {
      const t = editando
        ? await apiTurmas.salvar(turma.id, dados)
        : await apiTurmas.criar(escolinhaId, dados);
      await apiTurmas.definirHorarios(t.id, grade);
      return t;
    },
    { sucesso: () => { toast(editando ? 'Turma atualizada' : 'Turma criada'); onFechar(); } }
  );

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);
    salvar.mutate(
      {
        dados: {
          nome: f.get('nome').trim(),
          mensalidade_centavos: paraCentavos(f.get('valor')),
          capacidade: Number(f.get('capacidade')),
          professor: f.get('professor').trim() || null,
        },
        grade: horarios
          .filter((h) => h.hora)
          .map((h) => ({ dia_semana: Number(h.dia_semana), hora: h.hora, local: h.local || null })),
      },
      { onError: (err) => setErro(err.message) }
    );
  };

  return (
    <Sheet aberto={aberto} onFechar={onFechar} rotulo={editando ? `Editar ${turma?.nome}` : 'Nova turma'}>
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg sm:text-xl">{editando ? 'Editar turma' : 'Nova turma'}</h3>
        <p className="mt-1 text-[13px] text-ink3">
          A grade semanal é o que a agenda usa para gerar os treinos automaticamente.
        </p>
      </header>

      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:px-5">
          <Field label="Nome da turma">
            <Input name="nome" required defaultValue={turma?.nome ?? ''} placeholder="Sub-11" />
          </Field>
          <Field label="Mensalidade">
            <Input
              name="valor"
              required
              inputMode="decimal"
              defaultValue={turma ? deCentavos(turma.mensalidade_centavos) : ''}
              placeholder="130,00"
            />
          </Field>
          <Field label="Capacidade">
            <Input type="number" name="capacidade" min="1" max="99" required defaultValue={turma?.capacidade ?? 12} />
          </Field>
          <Field label="Professor responsável">
            <Input name="professor" defaultValue={turma?.professor ?? ''} placeholder="Prof. Ricardo" />
          </Field>

          <div className="col-span-full mt-1 flex items-center gap-3">
            <span className="text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap text-ink3 uppercase">
              Grade semanal
            </span>
            <hr className="flex-1 border-line" />
          </div>

          {horarios.map((h, i) => (
            <div key={i} className="col-span-full flex items-end gap-2">
              <Field label={i === 0 ? 'Dia' : ''} className="flex-1">
                <Select
                  value={h.dia_semana}
                  onChange={(e) =>
                    setHorarios((l) => l.map((x, j) => (j === i ? { ...x, dia_semana: e.target.value } : x)))
                  }
                >
                  {DIAS_SEMANA.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
                </Select>
              </Field>
              <Field label={i === 0 ? 'Hora' : ''} className="w-28">
                <Input
                  type="time"
                  value={h.hora}
                  onChange={(e) => setHorarios((l) => l.map((x, j) => (j === i ? { ...x, hora: e.target.value } : x)))}
                />
              </Field>
              <button
                type="button"
                onClick={() => setHorarios((l) => l.filter((_, j) => j !== i))}
                className="mb-1 px-2 py-2.5 text-ink3 transition hover:text-bad"
                aria-label="Remover horário"
              >
                ✕
              </button>
            </div>
          ))}

          <div className="col-span-full">
            <Btn
              type="button"
              variante="ghost"
              onClick={() => setHorarios((l) => [...l, { dia_semana: 1, hora: '18:00', local: '' }])}
            >
              + Adicionar horário
            </Btn>
          </div>

          <div className="col-span-full"><Alerta>{erro}</Alerta></div>
        </div>

        <SheetFoot>
          <Btn type="button" variante="ghost" onClick={onFechar}>Cancelar</Btn>
          <Btn type="submit" carregando={salvar.isPending}>{editando ? 'Salvar turma' : 'Criar turma'}</Btn>
        </SheetFoot>
      </form>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- */
function Quesitos() {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const quesitos = useQuesitos();
  const [novo, setNovo] = useState('');
  const [apagando, setApagando] = useState(null);
  const [erro, setErro] = useState(null);

  const criar = useAcao(
    (nome) => apiAvaliacoes.criarQuesito(escolinhaId, nome, (quesitos.data?.length ?? 0) + 1),
    { sucesso: () => { setNovo(''); toast('Quesito criado'); } }
  );

  const apagar = useAcao(() => apiAvaliacoes.apagarQuesito(apagando.id), {
    sucesso: () => { toast('Quesito removido'); setApagando(null); },
  });

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    if (novo.trim().length < 2) return setErro('Escreva o nome do quesito.');
    criar.mutate(novo.trim(), { onError: (err) => setErro(err.message) });
  };

  return (
    <>
      <Panel titulo="Quesitos de avaliação" extra={<Tag>{quesitos.data?.length ?? 0}</Tag>}>
        <p className="border-b border-line px-4 py-2.5 text-xs text-ink3">
          O que você olha quando avalia um atleta. Cada avaliação dá nota de 1 a 5 em cada um.
        </p>

        {quesitos.isPending ? (
          <Esqueleto linhas={3} />
        ) : (
          <ul>
            {(quesitos.data ?? []).map((q) => (
              <li key={q.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                <b className="min-w-0 flex-1 truncate text-[13px] font-semibold">{q.nome}</b>
                <button
                  onClick={() => setApagando(q)}
                  className="px-1 text-ink3 transition hover:text-bad"
                  aria-label={`Apagar ${q.nome}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={enviar} className="flex flex-wrap gap-2 border-t border-line p-4">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Cabeceio, visão de jogo, pontualidade…"
            maxLength={40}
            className="min-w-0 flex-1"
          />
          <Btn type="submit" carregando={criar.isPending}>Adicionar</Btn>
          {erro && <div className="w-full"><Alerta>{erro}</Alerta></div>}
        </form>
      </Panel>

      <Confirmar
        aberto={Boolean(apagando)}
        titulo={`Apagar o quesito ${apagando?.nome}?`}
        texto="As notas já dadas nesse quesito somem das avaliações anteriores."
        rotulo="Apagar"
        carregando={apagar.isPending}
        onConfirmar={() => apagar.mutate()}
        onFechar={() => setApagando(null)}
      />
    </>
  );
}

/* ---------------------------------------------------------------- */
function Equipe() {
  const toast = useToast();
  const { escolinha, escolinhaId, perfil } = useSessao();
  const equipe = useEquipe();
  const convites = useConvites();
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState(null);
  const [removendo, setRemovendo] = useState(null);

  const dono = escolinha?.papel === 'dono';

  const convidar = useAcao((dados) => apiEquipe.convidar(escolinhaId, dados), {
    sucesso: (c) => {
      setEmail('');
      copiarLink(c.token);
    },
  });

  const cancelar = useAcao((id) => apiEquipe.cancelarConvite(id), {
    sucesso: () => toast('Convite cancelado'),
  });

  const remover = useAcao(() => apiEquipe.remover(escolinhaId, removendo.perfil.id), {
    sucesso: () => { toast('Removido da equipe'); setRemovendo(null); },
  });

  const trocarPapel = useAcao(
    ({ perfilId, papel }) => apiEquipe.trocarPapel(escolinhaId, perfilId, papel),
    { sucesso: () => toast('Papel atualizado') }
  );

  const urlConvite = (token) => {
    const { origin, pathname } = window.location;
    return `${origin}${pathname}#/convite/${token}`;
  };

  const copiarLink = async (token) => {
    try {
      await navigator.clipboard.writeText(urlConvite(token));
      toast('Link do convite copiado — mande para o professor');
    } catch {
      toast('Convite criado. Copie o link na lista abaixo.');
    }
  };

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    convidar.mutate({ email: email.trim() || null }, { onError: (err) => setErro(err.message) });
  };

  return (
    <>
      <Panel titulo="Equipe técnica" extra={<Tag>{equipe.data?.length ?? 0}</Tag>}>
        {equipe.isPending ? (
          <Esqueleto linhas={2} />
        ) : (
          <ul>
            {(equipe.data ?? []).map((m) => (
              <li key={m.perfil?.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface2 text-xs font-bold text-ink2">
                  {iniciais(m.perfil?.nome)}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-semibold">
                    {m.perfil?.nome}
                    {m.perfil?.id === perfil?.id && <span className="text-ink3"> (você)</span>}
                  </b>
                  <small className="text-xs text-ink3">{m.perfil?.telefone || 'sem telefone'}</small>
                </div>

                {dono && m.perfil?.id !== perfil?.id ? (
                  <Select
                    value={m.papel}
                    onChange={(e) => trocarPapel.mutate({ perfilId: m.perfil.id, papel: e.target.value })}
                    className="!w-auto !py-1.5 !text-xs"
                    aria-label={`Papel de ${m.perfil?.nome}`}
                  >
                    <option value="professor">Professor</option>
                    <option value="dono">Coordenação</option>
                  </Select>
                ) : (
                  <Tag tom={m.papel === 'dono' ? 'ok' : 'neutro'}>
                    {m.papel === 'dono' ? 'Coordenação' : 'Professor'}
                  </Tag>
                )}

                {dono && m.perfil?.id !== perfil?.id && (
                  <button
                    onClick={() => setRemovendo(m)}
                    className="px-1 text-ink3 transition hover:text-bad"
                    aria-label={`Remover ${m.perfil?.nome}`}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {dono ? (
          <>
            <form onSubmit={enviar} className="border-t border-line p-4">
              <p className="mb-2.5 text-xs text-ink3">
                Gere um link de convite e mande para o professor. Ele cria a conta (ou entra na
                dele) e o link o coloca na equipe. Vale 14 dias, e serve uma vez só.
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="E-mail dele (opcional, só para você lembrar)"
                  className="min-w-0 flex-1"
                />
                <Btn type="submit" carregando={convidar.isPending}>Gerar convite</Btn>
              </div>
              {erro && <div className="mt-2"><Alerta>{erro}</Alerta></div>}
            </form>

            {convites.data?.length > 0 && (
              <ul className="border-t border-line">
                {convites.data.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-[12.5px] font-semibold">
                        {c.email || 'Convite sem e-mail'}
                      </b>
                      <small className="text-[11px] text-ink3">
                        {new Date(c.expira_em) < new Date()
                          ? 'expirado'
                          : `expira em ${new Date(c.expira_em).toLocaleDateString('pt-BR')}`}
                      </small>
                    </div>
                    <Btn variante="ghost" className="!min-h-9 !text-xs" onClick={() => copiarLink(c.token)}>
                      Copiar link
                    </Btn>
                    <button
                      onClick={() => cancelar.mutate(c.id)}
                      className="px-1 text-ink3 transition hover:text-bad"
                      aria-label="Cancelar convite"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="border-t border-line px-4 py-3 text-xs text-ink3">
            Só a coordenação pode convidar ou remover gente da equipe.
          </p>
        )}
      </Panel>

      <Confirmar
        aberto={Boolean(removendo)}
        titulo={`Tirar ${removendo?.perfil?.nome} da equipe?`}
        texto="Ele perde o acesso a esta escolinha na hora. O que ele já registrou continua onde está."
        rotulo="Remover"
        carregando={remover.isPending}
        onConfirmar={() => remover.mutate()}
        onFechar={() => setRemovendo(null)}
      />
    </>
  );
}

/* ---------------------------------------------------------------- */
/* Apagar leva tudo em cascata, então o botão pede o nome digitado —
   fricção proposital, do tamanho do estrago. */
function ZonaDeRisco() {
  const toast = useToast();
  const { escolinha, escolinhas, recarregar, trocarEscolinha } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState(null);

  const apagar = useAcao(() => apagarEscolinha(escolinha.id), {
    sucesso: async () => {
      const sobraram = escolinhas.filter((e) => e.id !== escolinha.id);
      await recarregar();
      if (sobraram[0]) trocarEscolinha(sobraram[0].id);
      toast(`${escolinha.nome} foi apagada.`);
      setAberto(false);
      setConfirmacao('');
    },
  });

  if (!escolinha) return null;
  const confere = confirmacao.trim() === escolinha.nome;

  return (
    <Panel titulo="Apagar a escolinha" corpo className="!border-bad/40">
      <p className="text-[13px] text-ink2">
        Some com tudo: atletas, responsáveis, chamadas, mensalidades, caixa e as fotos. Não há
        como desfazer. Serve para tirar uma escolinha criada por engano.
      </p>

      {!aberto ? (
        <Btn variante="perigo" className="mt-3.5" onClick={() => setAberto(true)}>
          Apagar {escolinha.nome}
        </Btn>
      ) : (
        <div className="mt-3.5 space-y-3">
          <Field
            label={`Digite "${escolinha.nome}" para confirmar`}
            erro={erro}
          >
            <Input
              value={confirmacao}
              onChange={(e) => { setConfirmacao(e.target.value); setErro(null); }}
              placeholder={escolinha.nome}
              autoFocus
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Btn variante="ghost" onClick={() => { setAberto(false); setConfirmacao(''); setErro(null); }}>
              Cancelar
            </Btn>
            <Btn
              variante="perigo"
              disabled={!confere}
              carregando={apagar.isPending}
              onClick={() => apagar.mutate(undefined, { onError: (e) => setErro(e.message) })}
            >
              Apagar para sempre
            </Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
function Conta() {
  const toast = useToast();
  const { perfil, recarregar, sair } = useSessao();
  const [erro, setErro] = useState(null);
  const [telefone, setTelefone] = useState('');

  useEffect(() => setTelefone(perfil?.telefone ?? ''), [perfil]);

  const salvar = useAcao((dados) => apiAuth.salvarPerfil(dados), {
    sucesso: async () => { await recarregar(); toast('Perfil salvo'); },
  });

  const trocar = useAcao((senha) => apiAuth.trocarSenha(senha), {
    sucesso: () => toast('Senha alterada'),
  });

  const enviarPerfil = (e) => {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);
    salvar.mutate({ nome: f.get('nome').trim(), telefone }, { onError: (err) => setErro(err.message) });
  };

  const enviarSenha = (e) => {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);
    const nova = f.get('senha');
    if (nova.length < 6) return setErro('A senha precisa ter ao menos 6 caracteres.');
    e.currentTarget.reset();
    trocar.mutate(nova, { onError: (err) => setErro(err.message) });
  };

  return (
    <Panel titulo="Sua conta" corpo>
      <form onSubmit={enviarPerfil} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Seu nome">
          <Input name="nome" required defaultValue={perfil?.nome ?? ''} key={perfil?.nome} />
        </Field>
        <Field label="Telefone">
          <Input value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} inputMode="tel" />
        </Field>
        <Field label="E-mail" className="sm:col-span-2">
          <Input value={perfil?.email ?? ''} disabled />
        </Field>
        <div className="sm:col-span-2">
          <Btn type="submit" carregando={salvar.isPending}>Salvar perfil</Btn>
        </div>
      </form>

      <hr className="my-5 border-line" />

      <form onSubmit={enviarSenha} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nova senha" className="sm:col-span-2" dica="Mínimo de 6 caracteres.">
          <Input type="password" name="senha" minLength={6} autoComplete="new-password" placeholder="••••••••" />
        </Field>
        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <Btn type="submit" variante="ghost" carregando={trocar.isPending}>Trocar senha</Btn>
          <Btn type="button" variante="perigo" onClick={sair}>Sair da conta</Btn>
        </div>
      </form>

      <div className="mt-4"><Alerta>{erro}</Alerta></div>
    </Panel>
  );
}
