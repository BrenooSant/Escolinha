import { useEffect, useState } from 'react';
import {
  Alerta, Btn, Confirmar, Erro, Esqueleto, Field, Input, Panel, Select, Sheet,
  SheetFoot, Tag, useToast,
} from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useAcao, useEquipe, useTurmas } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import { salvarEscolinha } from '../api/escolinha.js';
import * as apiTurmas from '../api/turmas.js';
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
        {escolinha?.papel === 'dono' && <Equipe />}
        <Conta />
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
function Equipe() {
  const equipe = useEquipe();

  return (
    <Panel titulo="Equipe técnica" extra={<Tag>{equipe.data?.length ?? 0}</Tag>}>
      {equipe.isPending ? (
        <Esqueleto linhas={2} />
      ) : (
        <>
          <ul>
            {(equipe.data ?? []).map((m) => (
              <li key={m.perfil?.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface2 text-xs font-bold text-ink2">
                  {iniciais(m.perfil?.nome)}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-semibold">{m.perfil?.nome}</b>
                  <small className="text-xs text-ink3">{m.perfil?.telefone || 'sem telefone'}</small>
                </div>
                <Tag tom={m.papel === 'dono' ? 'ok' : 'neutro'}>
                  {m.papel === 'dono' ? 'Coordenação' : 'Professor'}
                </Tag>
              </li>
            ))}
          </ul>
          <p className="px-4 py-3 text-xs text-ink3">
            Para incluir outro professor, peça que ele crie a conta e envie o e-mail — o convite por
            dentro do painel ainda não está pronto.
          </p>
        </>
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
