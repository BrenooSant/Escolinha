import { useMemo, useState } from 'react';
import { Btn, Chips, Erro, Esqueleto, Jersey, Panel, Tag, Tile, Vazio, useToast } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useAcao, useAtrasos, useMensalidades, usePainel } from '../hooks/dados.js';
import * as apiFinanceiro from '../api/financeiro.js';
import { brl, brlCurto, dataBR, hojeISO } from '../lib/format.js';
import { exportarCSV } from '../lib/csv.js';
import ModalCobranca, { cobrancaDeMensalidade } from './ModalCobranca.jsx';

const ABAS = ['Atrasadas', 'A vencer', 'Pagas'];

export default function Cobrancas() {
  const toast = useToast();
  const painel = usePainel();
  const atrasos = useAtrasos();
  const [aba, setAba] = useState('Atrasadas');
  const [cobranca, setCobranca] = useState(null);

  const competencia = painel.data?.competencia;
  const doMes = useMensalidades(competencia);
  const hoje = hojeISO();

  const baixar = useAcao((id) => apiFinanceiro.registrarPagamento(id), {
    sucesso: () => toast('Pagamento registrado — já entrou no caixa'),
  });

  const lista = useMemo(() => {
    if (aba === 'Atrasadas') return atrasos.data ?? [];
    const mes = doMes.data ?? [];
    if (aba === 'A vencer') return mes.filter((m) => m.status === 'aberta' && m.vencimento >= hoje);
    return mes.filter((m) => m.status === 'paga');
  }, [aba, atrasos.data, doMes.data, hoje]);

  const carregando = aba === 'Atrasadas' ? atrasos.isPending : doMes.isPending;
  const consulta = aba === 'Atrasadas' ? atrasos : doMes;

  const exportar = () => {
    exportarCSV(
      `cobrancas-${aba.toLowerCase()}-${hoje}.csv`,
      ['Atleta', 'Turma', 'Responsável', 'WhatsApp', 'Vencimento', 'Dias de atraso', 'Valor', 'Lembretes'],
      lista.map((m) => [
        m.aluno_nome, m.turma_nome, m.responsavel_nome, m.responsavel_telefone,
        dataBR(m.vencimento), m.dias_atraso || 0,
        (m.valor_centavos / 100).toFixed(2).replace('.', ','), m.lembretes,
      ])
    );
    toast(`${lista.length} cobranças exportadas`);
  };

  const r = painel.data;

  return (
    <>
      <PageHead
        titulo="Cobranças"
        sub={
          r
            ? r.devedores > 0
              ? `${r.devedores} responsáve${r.devedores === 1 ? 'l' : 'is'} com mensalidade vencida — ${brlCurto(r.atrasado)} em aberto`
              : 'Nenhuma mensalidade vencida. Bom trabalho.'
            : 'carregando…'
        }
      >
        <Btn variante="ghost" onClick={exportar} disabled={!lista.length}>Exportar CSV</Btn>
      </PageHead>

      {r && (
        <div className="mb-4 grid grid-cols-3 gap-2.5 sm:gap-3">
          <Tile rotulo="Em atraso" valor={brlCurto(r.atrasado)} nota={`${r.devedores} responsáveis`} alerta />
          <Tile rotulo="A vencer" valor={brlCurto(Math.max(r.aberto - r.atrasado, 0))} nota="ainda no prazo" />
          <Tile rotulo="Recebido" valor={brlCurto(r.recebido)} nota={`${r.pagas} mensalidades`} cor="text-ok" />
        </div>
      )}

      <Panel
        titulo={<Chips opcoes={ABAS} valor={aba} onChange={setAba} />}
        extra={<Tag tom={aba === 'Atrasadas' ? 'bad' : aba === 'Pagas' ? 'ok' : 'warn'}>{lista.length}</Tag>}
      >
        {carregando ? (
          <Esqueleto linhas={4} />
        ) : consulta.isError ? (
          <Erro erro={consulta.error} aoTentar={consulta.refetch} />
        ) : lista.length === 0 ? (
          <Vazio
            icone={aba === 'Atrasadas' ? '🎉' : aba === 'Pagas' ? '💤' : '👌'}
            titulo={
              aba === 'Atrasadas'
                ? 'Ninguém em atraso'
                : aba === 'Pagas'
                ? 'Nenhuma mensalidade paga ainda neste mês'
                : 'Nada a vencer'
            }
            texto={
              aba === 'Atrasadas'
                ? 'Todas as mensalidades vencidas foram quitadas.'
                : 'As mensalidades do mês aparecem aqui assim que forem geradas.'
            }
          />
        ) : (
          <ul>
            {lista.map((m) => (
              <li key={m.id} className="border-b border-line p-3 last:border-b-0 sm:px-4">
                <div className="flex items-start gap-3">
                  <Jersey num={m.aluno_numero ?? '·'} />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-semibold">{m.aluno_nome}</b>
                    <small className="block text-xs text-ink3">
                      {[m.turma_nome, m.responsavel_nome].filter(Boolean).join(' · ')}
                    </small>
                    {m.responsavel_telefone && (
                      <small className="tnum block text-xs text-ink3">{m.responsavel_telefone}</small>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {m.dias_atraso > 0 ? (
                        <Tag tom={m.dias_atraso > 14 ? 'bad' : 'warn'}>{m.dias_atraso} dias</Tag>
                      ) : m.status === 'paga' ? (
                        <Tag tom="ok">paga em {dataBR(m.pago_em)}</Tag>
                      ) : (
                        <Tag tom="warn">vence {dataBR(m.vencimento)}</Tag>
                      )}
                      {m.dias_atraso > 0 && (
                        <span className="text-[11px] text-ink3">venceu em {dataBR(m.vencimento)}</span>
                      )}
                      {m.lembretes > 0 && (
                        <span className="text-[11px] text-ink3">
                          {m.lembretes} lembrete{m.lembretes > 1 ? 's' : ''} enviado{m.lembretes > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <b className="tnum shrink-0 text-[15px]">{brl(m.valor_centavos)}</b>
                </div>

                {m.status === 'aberta' && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:ml-12 sm:flex">
                    <Btn variante="ghost" onClick={() => setCobranca(cobrancaDeMensalidade(m))}>
                      Enviar lembrete
                    </Btn>
                    <Btn
                      variante="ghost"
                      onClick={() => baixar.mutate(m.id)}
                      carregando={baixar.isPending && baixar.variables === m.id}
                    >
                      Marcar como paga
                    </Btn>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {aba === 'Atrasadas' && lista.length > 0 && (
        <p className="mt-2.5 px-1 text-xs text-ink3">
          O lembrete abre o WhatsApp do responsável com a mensagem pronta — e fica registrado aqui,
          para você saber quem já foi cobrado.
        </p>
      )}

      {cobranca && <ModalCobranca cobranca={cobranca} onFechar={() => setCobranca(null)} />}
    </>
  );
}
