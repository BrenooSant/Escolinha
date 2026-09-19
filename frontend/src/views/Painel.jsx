import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barra, Btn, Erro, Esqueleto, Jersey, Panel, Tag, Tile, Vazio, useToast } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { usePainel, useTurmas } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import { brlCurto, corFreq, dataCurta, diaDaSemana, hora, mesExtenso } from '../lib/format.js';
import * as apiAlunos from '../api/alunos.js';
import * as apiFinanceiro from '../api/financeiro.js';

/* O painel responde a uma pergunta só: o que precisa de mim agora?
   Daí a ordem — pendências, depois números, depois a semana. E cada coisa
   aparece uma vez: o valor no tile, a ação no alerta ou na própria lista.
   O caixa do mês vive em /financeiro; repeti-lo aqui só alongava a rolagem. */

export default function Painel() {
  const navegar = useNavigate();
  const toast = useToast();
  const { escolinha, escolinhaId, gestor } = useSessao();
  const painel = usePainel();
  const turmas = useTurmas();
  const [gerando, setGerando] = useState(false);

  if (painel.isPending) return <Esqueleto linhas={6} />;
  if (painel.isError) return <Erro erro={painel.error} aoTentar={painel.refetch} />;

  const r = painel.data;

  const gerarRelatorio = async () => {
    setGerando(true);
    try {
      const [alunos, mensalidades, lancamentos] = await Promise.all([
        apiAlunos.listar(escolinhaId),
        apiFinanceiro.mensalidades(escolinhaId, { competencia: r.competencia }),
        apiFinanceiro.lancamentos(escolinhaId, { de: r.competencia }),
      ]);
      // o jsPDF só entra no bundle de quem realmente gera o relatório
      const { relatorioMensalPDF } = await import('../lib/pdf.js');
      relatorioMensalPDF({
        escolinha,
        competencia: r.competencia,
        resumo: r,
        alunos,
        mensalidades,
        lancamentos,
      });
      toast('Relatório de ' + mesExtenso(r.competencia) + ' baixado');
    } catch (e) {
      toast(e.message);
    } finally {
      setGerando(false);
    }
  };

  const sub = `${mesExtenso(r.competencia)}${escolinha?.cidade ? ' · ' + escolinha.cidade : ''}`;

  /* Escolinha recém-criada: uma parede de zeros e cinco painéis vazios não
     ensinam nada. Enquanto não há elenco, o painel tem um passo só. */
  if (r.atletas === 0) {
    return (
      <>
        <PageHead titulo="Painel" sub={sub} />
        <Panel>
          <Vazio
            icone="⚽"
            titulo="Sua escolinha está pronta"
            texto={
              gestor
                ? 'Matricule o primeiro atleta para começar a fazer chamada, cobrar mensalidade e acompanhar a frequência.'
                : 'Assim que o gestor matricular os atletas, eles aparecem aqui e na chamada.'
            }
          >
            {gestor && (
              <>
                <Btn onClick={() => navegar('/alunos?novo=1')}>Matricular atleta</Btn>
                <Btn variante="ghost" onClick={() => navegar('/ajustes')}>Criar turmas</Btn>
              </>
            )}
          </Vazio>
        </Panel>
      </>
    );
  }

  /* Os avisos saem do próprio banco: só aparece o que de fato existe. */
  const alertas = [
    r.devedores > 0 && {
      tom: 'bad',
      titulo: `${r.devedores} mensalidade${r.devedores > 1 ? 's' : ''} vencida${r.devedores > 1 ? 's' : ''}`,
      nota: `${brlCurto(r.atrasado)} em aberto esperando cobrança.`,
      cta: 'Cobrar',
      destino: '/cobrancas',
    },
    r.contas_vencidas > 0 && {
      tom: 'bad',
      titulo: `${r.contas_vencidas} conta${r.contas_vencidas > 1 ? 's' : ''} vencida${r.contas_vencidas > 1 ? 's' : ''}`,
      nota: 'A pagar ou a receber, lançadas como pendentes no Financeiro.',
      cta: 'Ver contas',
      destino: '/financeiro',
    },
    !r.contas_vencidas && r.contas_semana > 0 && {
      tom: 'warn',
      titulo: `${r.contas_semana} conta${r.contas_semana > 1 ? 's' : ''} vence${r.contas_semana > 1 ? 'm' : ''} nos próximos 7 dias`,
      nota: 'A pagar ou a receber, lançadas como pendentes no Financeiro.',
      cta: 'Ver contas',
      destino: '/financeiro',
    },
    r.aulas_experimentais_hoje > 0 && {
      tom: 'ok',
      titulo: `${r.aulas_experimentais_hoje} aula${r.aulas_experimentais_hoje > 1 ? 's' : ''} experimenta${r.aulas_experimentais_hoje > 1 ? 'is' : 'l'} hoje`,
      nota: 'Receba bem — é a hora de virar matrícula.',
      cta: 'Ver leads',
      destino: '/leads',
    },
    r.leads_retorno > 0 && {
      tom: 'warn',
      titulo: `${r.leads_retorno} lead${r.leads_retorno > 1 ? 's' : ''} para retornar`,
      nota: 'Interessados com retorno marcado para hoje ou antes.',
      cta: 'Retornar',
      destino: '/leads',
    },
    r.chamadas_pendentes?.length > 0 && {
      tom: 'warn',
      titulo: `${r.chamadas_pendentes.length} chamada${r.chamadas_pendentes.length > 1 ? 's' : ''} sem marcar`,
      nota: r.chamadas_pendentes
        .slice(0, 2)
        .map((t) => `${t.turma_nome} de ${dataCurta(t.data)}`)
        .join(' · '),
      cta: 'Fazer agora',
      destino: `/chamada/${r.chamadas_pendentes[0].id}`,
    },
    r.frequencia_baixa?.length > 0 && {
      tom: 'warn',
      titulo: `${r.frequencia_baixa.length} atleta${r.frequencia_baixa.length > 1 ? 's' : ''} com frequência baixa`,
      nota: r.frequencia_baixa.slice(0, 3).map((a) => `${a.nome.split(' ')[0]} ${a.frequencia}%`).join(' · '),
      cta: 'Ver alunos',
      destino: '/alunos',
    },
    r.pre_matriculas > 0 && {
      tom: 'ok',
      titulo: `${r.pre_matriculas} ficha${r.pre_matriculas > 1 ? 's' : ''} de matrícula esperando`,
      nota: 'Enviadas pelos responsáveis através do link público.',
      cta: 'Analisar',
      destino: '/matriculas',
    },
  ].filter(Boolean);

  const COR_DOT = { bad: 'bg-bad', warn: 'bg-warn', ok: 'bg-ok' };

  return (
    <>
      <PageHead titulo="Painel" sub={sub}>
        {gestor && (
          <>
            <Btn variante="ghost" onClick={gerarRelatorio} carregando={gerando}>
              {gerando ? 'Gerando…' : 'Relatório do mês'}
            </Btn>
            <Btn onClick={() => navegar('/alunos?novo=1')}>Matricular atleta</Btn>
          </>
        )}
      </PageHead>

      {/* Primeira coisa da tela: o que está esperando por você. */}
      {alertas.length > 0 ? (
        <Panel
          titulo="Precisa da sua atenção"
          extra={<Tag tom="bad">{alertas.length}</Tag>}
          className="mb-4"
        >
          <ul>
            {alertas.map((a) => (
              <li key={a.titulo} className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${COR_DOT[a.tom]}`} />
                <div className="min-w-0 flex-1">
                  <b className="block text-[13px] font-semibold">{a.titulo}</b>
                  <small className="text-xs text-ink3">{a.nota}</small>
                </div>
                <button
                  onClick={() => navegar(a.destino)}
                  className="-mr-2 flex min-h-10 shrink-0 items-center self-center px-2 text-xs font-semibold whitespace-nowrap text-accent hover:underline"
                >
                  {a.cta} →
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <p className="mb-4 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-ink2">
          <span className="size-2 shrink-0 rounded-full bg-ok" />
          {gestor
            ? 'Tudo em dia — nenhuma pendência de chamada, cobrança ou matrícula.'
            : 'Tudo em dia — nenhuma chamada pendente.'}
        </p>
      )}

      <div className={`mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 ${gestor ? 'lg:grid-cols-4' : ''}`}>
        <Tile rotulo="Atletas ativos" valor={r.atletas} nota={r.atletas === 1 ? 'atleta matriculado' : 'atletas matriculados'} />
        <Tile
          rotulo="Presença média"
          valor={r.frequencia_media != null ? `${r.frequencia_media}%` : '—'}
          nota="desde a matrícula de cada um"
        />
        {gestor && (
          <>
            <Tile
              rotulo="Recebido no mês"
              valor={brlCurto(r.recebido)}
              nota={`${r.pagas} de ${r.atletas} mensalidades`}
            />
            <Tile rotulo="Em atraso" valor={brlCurto(r.atrasado)} nota={`${r.devedores} responsáveis`} alerta />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        {/* O próximo treino é a primeira linha daqui, em destaque — não
            precisa de um card próprio repetindo turma, dia e hora. */}
        <Panel titulo="Próximos treinos" extra={<Btn variante="ghost" className="!min-h-8 !px-3 !text-xs" onClick={() => navegar('/agenda')}>Ver agenda</Btn>}>
          {r.proximos_treinos?.length ? (
            <ul>
              {r.proximos_treinos.map((t, i) => (
                <li
                  key={t.id}
                  className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${
                    i === 0 ? 'bg-accentsoft/50' : ''
                  }`}
                >
                  <div className="w-12 shrink-0 text-center">
                    <b className="tnum block font-display text-lg leading-none">{dataCurta(t.data).split('/')[0]}</b>
                    <small className="text-[10px] tracking-wide text-ink3 uppercase">{diaDaSemana(t.data).slice(0, 3)}</small>
                  </div>
                  <div className="min-w-0 flex-1">
                    <b className="block text-[13px] font-semibold">
                      {t.turma_nome}
                      {t.tipo === 'jogo' && <Tag tom="warn" className="ml-2">amistoso</Tag>}
                    </b>
                    <small className="block truncate text-xs text-ink3">
                      {hora(t.hora)} · {t.adversario ? `vs. ${t.adversario}` : t.local || 'local a definir'}
                    </small>
                  </div>
                  {i === 0 ? (
                    <Btn
                      onClick={() => navegar(`/chamada/${t.id}`)}
                      className="!min-h-9 shrink-0 !px-3 !text-xs"
                    >
                      Fazer a chamada
                    </Btn>
                  ) : (
                    <button
                      onClick={() => navegar(`/chamada/${t.id}`)}
                      className="-mr-2 shrink-0 px-2 text-xs font-semibold whitespace-nowrap text-accent hover:underline"
                    >
                      Chamada →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Vazio
              icone="📅"
              titulo="Nenhum treino agendado"
              texto="Monte a grade das turmas em Ajustes e gere os treinos da semana na Agenda."
            >
              <Btn variante="ghost" onClick={() => navegar('/agenda')}>Abrir agenda</Btn>
            </Vazio>
          )}
        </Panel>

        <Panel titulo="Frequência por turma" extra={<Tag>{turmas.data?.length ?? 0} turmas</Tag>} corpo>
          {turmas.isPending ? (
            <Esqueleto linhas={4} className="!p-0" />
          ) : turmas.data?.length ? (
            <div className="space-y-4">
              {turmas.data.map((t) => (
                <div key={t.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <b className="text-[13px]">{t.nome}</b>
                    <span className="text-xs text-ink3">
                      {t.atletas} atleta{t.atletas === 1 ? '' : 's'} ·{' '}
                      <b className={corFreq(t.frequencia)}>
                        {t.frequencia != null ? `${t.frequencia}%` : 'sem treino'}
                      </b>
                    </span>
                  </div>
                  <Barra fatias={[{ cor: `bg-current ${corFreq(t.frequencia)}`, pct: t.frequencia ?? 0 }]} />
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-[13px] text-ink3">Nenhuma turma cadastrada ainda.</p>
          )}
        </Panel>
      </div>

      {/* Faixa de encantamento, não de trabalho: só aparece quando tem alguém. */}
      {r.aniversariantes?.length > 0 && (
        <Panel titulo="Aniversariantes do mês" extra={<Tag>{r.aniversariantes.length}</Tag>} corpo className="mt-4">
          <div className="no-bar -mx-1 flex gap-5 overflow-x-auto px-1">
            {r.aniversariantes.map((a) => (
              <div key={a.id} className="flex shrink-0 items-center gap-2.5">
                <Jersey num={a.numero ?? '·'} tamanho="sm" />
                <div>
                  <b className="block text-[13px] font-semibold">{a.nome.split(' ')[0]}</b>
                  <small className="text-xs text-ink3">dia {a.dia} · {a.idade} anos</small>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
