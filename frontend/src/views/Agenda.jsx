import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alerta, Btn, Confirmar, Erro, Esqueleto, Eyebrow, Field, Input, Jersey, Panel,
  Select, Sheet, SheetFoot, Tag, useToast,
} from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useAcao, useAgenda, useTurmas } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiAgenda from '../api/agenda.js';
import { brl, dataCurta, DIAS_CURTOS, DIAS_SEMANA, hojeISO, hora, paraData, paraISO } from '../lib/format.js';

/* Segunda-feira da semana que contém `data`. */
function inicioDaSemana(data) {
  const d = new Date(data);
  const desloca = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - desloca);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function Agenda() {
  const navegar = useNavigate();
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()));
  const [novo, setNovo] = useState(false);
  const [selecionado, setSelecionado] = useState(null);
  const [apagando, setApagando] = useState(null);

  const de = paraISO(semana);
  const fim = new Date(semana);
  fim.setDate(fim.getDate() + 6);
  const ate = paraISO(fim);

  const agenda = useAgenda(de, ate);
  const turmas = useTurmas();
  const hoje = hojeISO();

  const dias = useMemo(() => {
    const lista = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(semana);
      d.setDate(d.getDate() + i);
      const iso = paraISO(d);
      lista.push({
        iso,
        rotuloLongo: DIAS_SEMANA[d.getDay()],
        rotuloCurto: DIAS_CURTOS[d.getDay()],
        eHoje: iso === hoje,
        itens: (agenda.data ?? []).filter((t) => t.data === iso),
      });
    }
    return lista;
  }, [semana, agenda.data, hoje]);

  const gerar = useAcao(() => apiAgenda.gerarDaGrade(escolinhaId, de, ate), {
    sucesso: (n) =>
      toast(n > 0 ? `${n} treino${n > 1 ? 's' : ''} gerado${n > 1 ? 's' : ''} pela grade` : 'A semana já estava completa'),
  });

  const apagar = useAcao(() => apiAgenda.apagar(apagando.id), {
    sucesso: () => { toast('Treino removido'); setApagando(null); setSelecionado(null); },
  });

  const cancelar = useAcao(() => apiAgenda.cancelar(selecionado.id), {
    sucesso: () => { toast('Treino cancelado'); setSelecionado(null); },
  });

  const mover = (semanas) =>
    setSemana((s) => {
      const d = new Date(s);
      d.setDate(d.getDate() + semanas * 7);
      return d;
    });

  const totalTreinos = (agenda.data ?? []).filter((t) => t.status !== 'cancelado').length;

  return (
    <>
      <PageHead
        titulo="Agenda de treinos"
        sub={`Semana de ${dataCurta(de)} a ${dataCurta(ate)} · ${totalTreinos} compromisso${totalTreinos === 1 ? '' : 's'}`}
      >
        <Btn variante="ghost" onClick={() => mover(-1)} aria-label="Semana anterior">←</Btn>
        <Btn variante="ghost" onClick={() => setSemana(inicioDaSemana(new Date()))}>Hoje</Btn>
        <Btn variante="ghost" onClick={() => mover(1)} aria-label="Próxima semana">→</Btn>
        <Btn onClick={() => setNovo(true)} className="!flex-[2] sm:!flex-none">+ Agendar</Btn>
      </PageHead>

      {agenda.isError ? (
        <Erro erro={agenda.error} aoTentar={agenda.refetch} />
      ) : agenda.isPending ? (
        <Esqueleto linhas={5} />
      ) : (
        <>
          {/* celular: dias empilhados · desktop: 7 colunas */}
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-7 lg:gap-2">
            {dias.map((d) => (
              <div
                key={d.iso}
                className={`rounded-xl border bg-surface p-3 lg:min-h-40 ${
                  d.eHoje ? 'border-accent ring-1 ring-accent' : 'border-line'
                }`}
              >
                <Eyebrow className={`mb-2.5 block border-b border-line pb-2 ${d.eHoje ? '!text-accent' : ''}`}>
                  <span className="lg:hidden">{d.rotuloLongo}</span>
                  <span className="hidden lg:inline">{d.rotuloCurto}</span>
                  {' · '}{dataCurta(d.iso)}
                  {d.eHoje && ' · hoje'}
                </Eyebrow>

                {d.itens.length === 0 ? (
                  <p className="text-xs text-ink3 italic">Sem treino</p>
                ) : (
                  <div className="space-y-2">
                    {d.itens.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelecionado(t)}
                        className={`block w-full rounded-lg px-2.5 py-2 text-left transition hover:brightness-95 ${
                          t.status === 'cancelado'
                            ? 'bg-surface2 opacity-60'
                            : t.tipo === 'jogo'
                            ? 'bg-warnbg'
                            : 'bg-accentsoft'
                        }`}
                      >
                        <b
                          className={`block font-display text-[15px] font-semibold ${
                            t.status === 'cancelado'
                              ? 'text-ink3 line-through'
                              : t.tipo === 'jogo'
                              ? 'text-warn'
                              : 'text-accentink'
                          }`}
                        >
                          {t.turma_nome}
                        </b>
                        <small className="block text-[11.5px] leading-snug text-ink2">
                          {hora(t.hora)}
                          {t.adversario ? ` · vs. ${t.adversario}` : t.local ? ` · ${t.local}` : ''}
                        </small>
                        {t.status === 'realizado' && (
                          <span className="mt-1 block text-[10.5px] font-semibold text-ok">
                            ✓ {t.presentes}/{t.marcados} presentes
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Btn variante="ghost" onClick={() => gerar.mutate()} carregando={gerar.isPending}>
              Gerar treinos desta semana pela grade
            </Btn>
            <span className="text-xs text-ink3">
              Usa os horários fixos de cada turma. Não duplica o que já existe.
            </span>
          </div>
        </>
      )}

      <Panel className="mt-4" titulo="Turmas" extra={<Tag>{turmas.data?.length ?? 0} categorias</Tag>}>
        {turmas.isPending ? (
          <Esqueleto linhas={4} />
        ) : (
          <ul>
            {(turmas.data ?? []).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0"
              >
                <Jersey num={t.nome.replace(/\D/g, '') || '·'} />
                <div className="min-w-0 flex-1">
                  <b className="block text-[13px] font-semibold">{t.nome}</b>
                  <small className="block text-xs text-ink3">
                    {t.horarios?.length
                      ? t.horarios.map((h) => `${DIAS_CURTOS[h.dia_semana]} ${hora(h.hora)}`).join(' · ')
                      : 'sem grade definida'}
                    {t.professor ? ` · ${t.professor}` : ''}
                  </small>
                </div>
                <div className="flex w-full items-center gap-3 pl-12 sm:w-auto sm:gap-4 sm:pl-0">
                  <span className="tnum text-xs text-ink2">{t.atletas} atletas</span>
                  <span className="tnum text-xs text-ink2">{brl(t.mensalidade_centavos)}</span>
                  <Tag tom={t.vagas <= 0 ? 'bad' : t.vagas <= 2 ? 'warn' : 'ok'}>
                    {t.vagas <= 0 ? 'lotada' : `${t.vagas} vagas`}
                  </Tag>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <FormTreino aberto={novo} turmas={turmas.data ?? []} onFechar={() => setNovo(false)} />

      {/* ações de um treino */}
      <Sheet
        aberto={Boolean(selecionado)}
        onFechar={() => setSelecionado(null)}
        largura="max-w-sm"
        rotulo="Ações do treino"
      >
        {selecionado && (
          <>
            <header className="px-5 pt-5">
              <h3 className="text-lg">
                {selecionado.turma_nome}
                {selecionado.tipo === 'jogo' && <Tag tom="warn" className="ml-2">amistoso</Tag>}
              </h3>
              <p className="mt-1 text-[13px] text-ink3">
                {DIAS_SEMANA[paraData(selecionado.data).getDay()]}, {dataCurta(selecionado.data)} às{' '}
                {hora(selecionado.hora)}
                {selecionado.local ? ` · ${selecionado.local}` : ''}
              </p>
            </header>
            <div className="p-2">
              <button
                onClick={() => navegar(`/chamada/${selecionado.id}`)}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold hover:bg-surface2"
              >
                ✓ {selecionado.status === 'realizado' ? 'Rever a chamada' : 'Fazer a chamada'}
              </button>
              {selecionado.status !== 'cancelado' && (
                <button
                  onClick={() => cancelar.mutate()}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-ink2 hover:bg-surface2"
                >
                  ⊘ Cancelar treino
                </button>
              )}
              <button
                onClick={() => setApagando(selecionado)}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-bad hover:bg-surface2"
              >
                🗑 Apagar da agenda
              </button>
            </div>
          </>
        )}
      </Sheet>

      <Confirmar
        aberto={Boolean(apagando)}
        titulo="Apagar treino?"
        texto="As presenças marcadas nele também somem, e a frequência dos atletas é recalculada."
        rotulo="Apagar"
        carregando={apagar.isPending}
        onConfirmar={() => apagar.mutate()}
        onFechar={() => setApagando(null)}
      />
    </>
  );
}

function FormTreino({ aberto, turmas, onFechar }) {
  const toast = useToast();
  const { escolinhaId, escolinha } = useSessao();
  const [erro, setErro] = useState(null);
  const [tipo, setTipo] = useState('treino');

  const criar = useAcao((dados) => apiAgenda.criar(escolinhaId, dados), {
    sucesso: () => { toast('Agendado'); onFechar(); },
  });

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);
    criar.mutate(
      {
        turma_id: f.get('turma_id'),
        data: f.get('data'),
        hora: f.get('hora'),
        local: f.get('local').trim() || null,
        tipo,
        adversario: tipo === 'jogo' ? f.get('adversario').trim() || null : null,
      },
      { onError: (err) => setErro(err.message) }
    );
  };

  return (
    <Sheet aberto={aberto} onFechar={onFechar} rotulo="Agendar treino">
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg sm:text-xl">Agendar</h3>
        <p className="mt-1 text-[13px] text-ink3">
          Para os treinos que se repetem toda semana, use a grade da turma em Ajustes.
        </p>
      </header>

      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:px-5">
          <div className="col-span-full flex gap-0.5 rounded-xl bg-surface2 p-1">
            {[['treino', 'Treino'], ['jogo', 'Amistoso']].map(([v, rot]) => (
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

          <Field label="Turma" className="sm:col-span-2">
            <Select name="turma_id" required defaultValue={turmas[0]?.id ?? ''}>
              {turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Select>
          </Field>
          <Field label="Data">
            <Input type="date" name="data" required defaultValue={hojeISO()} />
          </Field>
          <Field label="Horário">
            <Input type="time" name="hora" required defaultValue="18:00" />
          </Field>
          <Field label="Local" className={tipo === 'jogo' ? '' : 'sm:col-span-2'}>
            <Input name="local" defaultValue={escolinha?.local_padrao ?? ''} placeholder="Campo do Bosque" />
          </Field>
          {tipo === 'jogo' && (
            <Field label="Adversário">
              <Input name="adversario" placeholder="Escolinha Bandeirante" />
            </Field>
          )}
          <div className="col-span-full"><Alerta>{erro}</Alerta></div>
        </div>

        <SheetFoot>
          <Btn type="button" variante="ghost" onClick={onFechar}>Cancelar</Btn>
          <Btn type="submit" carregando={criar.isPending}>Agendar</Btn>
        </SheetFoot>
      </form>
    </Sheet>
  );
}
