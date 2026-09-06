import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barra, Btn, Erro, Esqueleto, Jersey, Panel, Tag, Tile, Vazio, useToast } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { usePainel, useTurmas } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import { brlCurto, corFreq, dataCurta, diaDaSemana, hora, mesExtenso } from '../lib/format.js';
import * as apiAlunos from '../api/alunos.js';
import * as apiFinanceiro from '../api/financeiro.js';

export default function Painel() {
  const navegar = useNavigate();
  const toast = useToast();
  const { escolinha, escolinhaId } = useSessao();
  const painel = usePainel();
  const turmas = useTurmas();
  const [gerando, setGerando] = useState(false);

  if (painel.isPending) return <Esqueleto linhas={6} />;
  if (painel.isError) return <Erro erro={painel.error} aoTentar={painel.refetch} />;

  const r = painel.data;
  const proximo = r.proximos_treinos?.[0];

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

  /* Os avisos saem do próprio banco: só aparece o que de fato existe. */
  const alertas = [
    r.devedores > 0 && {
      tom: 'bad',
      titulo: `${r.devedores} mensalidade${r.devedores > 1 ? 's' : ''} vencida${r.devedores > 1 ? 's' : ''}`,
      nota: `${brlCurto(r.atrasado)} em aberto esperando cobrança.`,
      cta: 'Cobrar',
      destino: '/cobrancas',
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

  const atalhos = [
    proximo && {
      ic: '✓',
      titulo: 'Fazer a chamada',
      nota: `${proximo.turma_nome} · ${dataCurta(proximo.data)} ${hora(proximo.hora)}`,
      acao: () => navegar(`/chamada/${proximo.id}`),
    },
    { ic: '＋', titulo: 'Matricular atleta', nota: 'ficha completa em 1 minuto', acao: () => navegar('/alunos?novo=1') },
    {
      ic: '↗',
      titulo: 'Cobrar atrasados',
      nota: r.devedores > 0 ? `${r.devedores} responsáveis · ${brlCurto(r.atrasado)}` : 'ninguém em atraso 🎉',
      acao: () => navegar('/cobrancas'),
    },
    { ic: '▤', titulo: 'Relatório do mês', nota: 'presença + caixa em PDF', acao: gerarRelatorio, ocupado: gerando },
  ].filter(Boolean);

  return (
    <>
      <PageHead
        titulo="Painel"
        sub={`${mesExtenso(r.competencia)}${escolinha?.cidade ? ' · ' + escolinha.cidade : ''}`}
      >
        {proximo && (
          <Tag className="!py-1.5 !text-xs">
            Próximo: {diaDaSemana(proximo.data)} {hora(proximo.hora)} — {proximo.turma_nome}
          </Tag>
        )}
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Tile rotulo="Atletas ativos" valor={r.atletas} nota={r.atletas === 1 ? 'atleta matriculado' : 'atletas matriculados'} />
        <Tile
          rotulo="Presença média"
          valor={r.frequencia_media != null ? `${r.frequencia_media}%` : '—'}
          nota="desde a matrícula de cada um"
        />
        <Tile
          rotulo="Recebido no mês"
          valor={brlCurto(r.recebido)}
          nota={`${r.pagas} de ${r.atletas} mensalidades`}
        />
        <Tile rotulo="Em atraso" valor={brlCurto(r.atrasado)} nota={`${r.devedores} responsáveis`} alerta />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {atalhos.map((a) => (
          <button
            key={a.titulo}
            onClick={a.acao}
            disabled={a.ocupado}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition hover:-translate-y-px hover:border-accent disabled:opacity-60 sm:p-3.5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accentsoft text-[15px] text-accentink">
              {a.ic}
            </span>
            <span className="min-w-0">
              <b className="block text-[13px] leading-tight font-semibold">{a.titulo}</b>
              <small className="text-[11.5px] text-ink3">{a.ocupado ? 'gerando…' : a.nota}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <Panel titulo="Próximos treinos" extra={<Btn variante="ghost" className="!min-h-8 !px-3 !text-xs" onClick={() => navegar('/agenda')}>Ver agenda</Btn>}>
          {r.proximos_treinos?.length ? (
            <ul>
              {r.proximos_treinos.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
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
                  <button
                    onClick={() => navegar(`/chamada/${t.id}`)}
                    className="-mr-2 shrink-0 px-2 text-xs font-semibold whitespace-nowrap text-accent hover:underline"
                  >
                    Chamada →
                  </button>
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

        <Panel
          titulo="Precisa da sua atenção"
          extra={<Tag tom={alertas.length ? 'bad' : 'ok'}>{alertas.length}</Tag>}
        >
          {alertas.length ? (
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
          ) : (
            <Vazio icone="👌" titulo="Tudo em dia" texto="Nenhuma pendência de chamada, cobrança ou matrícula." />
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
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

        <Panel titulo="Aniversariantes do mês" corpo>
          {r.aniversariantes?.length ? (
            <div className="space-y-3.5">
              {r.aniversariantes.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <Jersey num={a.numero ?? '·'} />
                  <div className="min-w-0">
                    <b className="block truncate text-[13px] font-semibold">{a.nome}</b>
                    <small className="text-xs text-ink3">
                      {a.turma_nome || 'sem turma'} · {a.idade} anos no dia {a.dia}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-[13px] text-ink3">Ninguém faz aniversário este mês.</p>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel titulo="Caixa do mês" corpo>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Entradas', brlCurto(r.entradas_mes), 'text-ok'],
              ['Saídas', brlCurto(r.saidas_mes), ''],
              ['Saldo', brlCurto(r.entradas_mes - r.saidas_mes), r.entradas_mes - r.saidas_mes < 0 ? 'text-bad' : ''],
            ].map(([rot, val, cor]) => (
              <div key={rot}>
                <span className="text-[11px] font-semibold tracking-[0.1em] text-ink3 uppercase">{rot}</span>
                <b className={`tnum block font-display text-xl font-semibold sm:text-2xl ${cor}`}>{val}</b>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
