import { useEffect, useRef, useState } from 'react';
import {
  Alerta, Btn, Confirmar, Erro, Esqueleto, Field, Foto, Input, Sheet, SheetFoot, Tag, Vazio, useToast,
} from '../ui.jsx';
import {
  useAcao, useAvaliacoes, useHistoricoAluno, useLiberacoesAluno, useMensalidadesDoAluno,
  useResponsavel,
} from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiAlunos from '../api/alunos.js';
import * as apiAvaliacoes from '../api/avaliacoes.js';
import * as apiFinanceiro from '../api/financeiro.js';
import * as apiCobranca from '../api/cobranca.js';
import * as apiContrato from '../api/contrato.js';
import { useQuery } from '@tanstack/react-query';
import * as apiFotos from '../api/fotos.js';
import { situacaoMensalidade, tituloCobranca, valorCobranca, ROTULO_MARCA } from '../lib/constantes.js';
import {
  brl, corFreq, dataBR, dataCurta, idade, linkWhatsApp, paraCentavos, primeiroNome,
} from '../lib/format.js';
import FormAvaliacao from './FormAvaliacao.jsx';

const PONTO = { P: 'bg-ok', F: 'bg-bad', J: 'bg-warn' };
const ABAS = [['ficha', 'Ficha'], ['mensalidades', 'Mensalidades'], ['avaliacoes', 'Avaliações']];

function Linha({ termo, children }) {
  return (
    <>
      <dt className="text-ink3">{termo}</dt>
      <dd className="m-0 font-medium">{children}</dd>
    </>
  );
}

/* URL assinada da foto. O bucket é privado, então o link vale uma hora
   e é pedido de novo a cada abertura da ficha. */
function useFotoUrl(caminho) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivo = true;
    setUrl(null);
    if (caminho) apiFotos.url(caminho).then((u) => vivo && setUrl(u));
    return () => { vivo = false; };
  }, [caminho]);
  return url;
}

export default function Ficha({ aluno, onFechar, onEditar, onCobrar }) {
  const toast = useToast();
  const { escolinhaId, gestor } = useSessao();
  const [aba, setAba] = useState('ficha');
  const foto = useFotoUrl(aluno?.foto_path);
  const arquivo = useRef(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erro, setErro] = useState(null);
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  const [avaliando, setAvaliando] = useState(null);
  const [avulsa, setAvulsa] = useState(false);
  const [cancelando, setCancelando] = useState(null);

  const cancelar = useAcao(() => apiCobranca.cancelar(cancelando.id), {
    sucesso: () => { toast('Cobrança cancelada'); setCancelando(null); },
  });

  const arquivar = useAcao(() => apiAlunos.arquivar(aluno.id), {
    sucesso: () => {
      toast(primeiroNome(aluno.nome) + ' foi arquivado');
      setConfirmarArquivo(false);
      onFechar();
    },
  });

  const reativar = useAcao(() => apiAlunos.reativar(aluno.id), {
    sucesso: () => toast(primeiroNome(aluno.nome) + ' voltou para a turma'),
  });

  const trocarFoto = useAcao(async (f) => apiFotos.enviar(escolinhaId, aluno.id, f), {
    sucesso: () => toast('Foto atualizada'),
  });

  if (!aluno) return null;

  const situacao = situacaoMensalidade(aluno);
  const anos = idade(aluno.nascimento);

  const enviarFoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) return setErro('A foto precisa ter menos de 3 MB.');
    setErro(null);
    setEnviandoFoto(true);
    try {
      await trocarFoto.mutateAsync(f);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviandoFoto(false);
    }
  };

  const mensagemWhats =
    `Olá, ${primeiroNome(aluno.responsavel_nome || '')}! Aqui é da escolinha. ` +
    `Passando para falar do(a) ${primeiroNome(aluno.nome)}.`;

  return (
    <>
      <Sheet aberto onFechar={onFechar} largura="max-w-xl" rotulo={`Ficha de ${aluno.nome}`}>
        <header className="flex items-center gap-3.5 border-b border-line px-4 py-4 sm:px-5">
          {gestor ? (
            <>
              <button
                onClick={() => arquivo.current?.click()}
                title="Trocar foto"
                className="relative shrink-0 rounded-xl transition hover:opacity-80"
              >
                <Foto src={foto} num={aluno.numero} nome={aluno.nome} tamanho="lg" />
                <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border border-surface bg-accent text-[10px] text-white">
                  {enviandoFoto ? '…' : '📷'}
                </span>
              </button>
              <input ref={arquivo} type="file" accept="image/*" onChange={enviarFoto} className="hidden" />
            </>
          ) : (
            <Foto src={foto} num={aluno.numero} nome={aluno.nome} tamanho="lg" />
          )}

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg sm:text-xl">{aluno.nome}</h3>
            <small className="text-[12.5px] text-ink3">
              {[aluno.turma_nome, aluno.posicao, aluno.numero && `camisa ${aluno.numero}`]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </div>
          {!aluno.ativo ? (
            <Tag>Arquivado</Tag>
          ) : (
            gestor && <Tag tom={situacao.tom}>{situacao.rotulo}</Tag>
          )}
        </header>

        <div className="grid grid-cols-3 border-b border-line">
          {[
            ['Frequência', aluno.frequencia != null ? `${aluno.frequencia}%` : '—', corFreq(aluno.frequencia)],
            ['Treinos', `${aluno.presencas}/${aluno.treinos}`, ''],
            gestor
              ? ['Mensalidade', brl(aluno.valor_centavos), '']
              : ['Faltas', aluno.faltas, aluno.faltas > 0 ? 'text-bad' : ''],
          ].map(([rot, val, cor], i) => (
            <div key={rot} className={`px-4 py-3 ${i < 2 ? 'border-r border-line' : ''}`}>
              <span className="text-[10px] font-semibold tracking-[0.09em] text-ink3 uppercase sm:text-[11px]">
                {rot}
              </span>
              <b className={`tnum block font-display text-lg leading-tight font-semibold sm:text-2xl ${cor}`}>
                {val}
              </b>
            </div>
          ))}
        </div>

        <div role="tablist" className="flex gap-0.5 border-b border-line bg-surface2/50 p-1">
          {ABAS.filter(([v]) => gestor || v !== 'mensalidades').map(([v, rot]) => (
            <button
              key={v}
              role="tab"
              aria-selected={aba === v}
              onClick={() => setAba(v)}
              className={`min-h-10 flex-1 rounded-lg text-[12.5px] font-semibold transition ${
                aba === v ? 'bg-surface text-ink shadow-sm' : 'text-ink2'
              }`}
            >
              {rot}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {erro && <div className="mb-3"><Alerta>{erro}</Alerta></div>}

          {aba === 'ficha' && (
            <AbaFicha
              aluno={aluno}
              anos={anos}
              situacao={situacao}
              onArquivar={() => setConfirmarArquivo(true)}
              onReativar={() => reativar.mutate()}
              reativando={reativar.isPending}
              gestor={gestor}
            />
          )}
          {gestor && aba === 'mensalidades' && (
            <AbaMensalidades aluno={aluno} onNovaAvulsa={() => setAvulsa(true)} onCancelar={setCancelando} />
          )}
          {aba === 'avaliacoes' && <AbaAvaliacoes aluno={aluno} onAvaliar={setAvaliando} />}
        </div>

        <SheetFoot>
          <Btn variante="ghost" onClick={onFechar}>Fechar</Btn>
          {aba === 'avaliacoes' ? (
            <Btn onClick={() => setAvaliando({ novo: true })}>+ Nova avaliação</Btn>
          ) : (
            <>
              {aluno.ativo && aluno.responsavel_telefone && (
                <Btn
                  variante="ghost"
                  onClick={() => window.open(linkWhatsApp(aluno.responsavel_telefone, mensagemWhats), '_blank')}
                >
                  Chamar no WhatsApp
                </Btn>
              )}
              {gestor && (aluno.ativo && situacao.dias > 0 ? (
                <Btn onClick={() => { onFechar(); onCobrar?.(aluno); }}>Enviar cobrança</Btn>
              ) : (
                <Btn onClick={() => { onFechar(); onEditar?.(aluno); }}>Editar ficha</Btn>
              ))}
            </>
          )}
        </SheetFoot>
      </Sheet>

      <FormAvaliacao
        aberto={Boolean(avaliando)}
        aluno={aluno}
        avaliacao={avaliando?.novo ? null : avaliando}
        onFechar={() => setAvaliando(null)}
      />

      {gestor && <NovaAvulsa aberto={avulsa} aluno={aluno} onFechar={() => setAvulsa(false)} />}

      <Confirmar
        aberto={Boolean(cancelando)}
        titulo={`Cancelar ${cancelando ? tituloCobranca(cancelando) : ''}?`}
        texto="Ela sai da cobrança e do link do responsável, mas continua no histórico. Use para bolsa, erro de lançamento ou taxa que não vale para este atleta."
        rotulo="Cancelar cobrança"
        carregando={cancelar.isPending}
        onConfirmar={() => cancelar.mutate()}
        onFechar={() => setCancelando(null)}
      />

      <Confirmar
        aberto={confirmarArquivo}
        titulo={`Arquivar ${primeiroNome(aluno.nome)}?`}
        texto="Ele sai das listas e das chamadas, mas o histórico de presença e as mensalidades ficam guardados. Dá para reativar depois."
        rotulo="Arquivar"
        carregando={arquivar.isPending}
        onConfirmar={() => arquivar.mutate()}
        onFechar={() => setConfirmarArquivo(false)}
      />
    </>
  );
}

/* ---------------------------------------------------------------- */
function AbaFicha({ aluno, anos, situacao, onArquivar, onReativar, reativando, gestor }) {
  const historico = useHistoricoAluno(aluno.id);

  return (
    <>
      <Secao>Últimos treinos</Secao>
      {historico.isPending ? (
        <div className="h-5 w-40 animate-pulse rounded bg-surface2" />
      ) : historico.data?.length ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {historico.data.map((t) => (
              <span
                key={t.id}
                title={`${dataCurta(t.data)} — ${ROTULO_MARCA[t.marca]}${t.motivo ? ` (${t.motivo})` : ''}`}
                className={`block size-5 rounded ${PONTO[t.marca]}`}
              />
            ))}
          </div>
          <p className="mt-2 mb-5 text-[11.5px] text-ink3">
            Verde presente · vermelho falta · amarelo justificada
          </p>
        </>
      ) : (
        <p className="mb-5 text-[13px] text-ink3">Ainda sem treinos registrados.</p>
      )}

      <Secao>Dados</Secao>
      <dl className="grid grid-cols-[minmax(92px,auto)_1fr] gap-x-3.5 gap-y-2.5 text-[13px]">
        <Linha termo="Nascimento">
          {aluno.nascimento ? `${dataBR(aluno.nascimento)}${anos != null ? ` · ${anos} anos` : ''}` : '—'}
        </Linha>
        <Linha termo="Responsável">
          {aluno.responsavel_nome || '—'}
          {aluno.responsavel_parentesco && <span className="text-ink3"> ({aluno.responsavel_parentesco})</span>}
        </Linha>
        <Linha termo="WhatsApp">
          <span className="tnum">{aluno.responsavel_telefone || '—'}</span>
        </Linha>
        {aluno.responsavel_email && <Linha termo="E-mail">{aluno.responsavel_email}</Linha>}
        {gestor && (
          <Linha termo="Vencimento">
            Todo dia {aluno.dia_vencimento}
            {situacao.dias > 0 && <Tag tom="bad" className="ml-2">{situacao.dias} dias de atraso</Tag>}
          </Linha>
        )}
        <Linha termo="Matrícula">{dataBR(aluno.matriculado_em)}</Linha>
        {gestor && <LinhaContrato aluno={aluno} />}
        <Linha termo="Uso de imagem">{aluno.autoriza_imagem ? 'Autorizado' : 'Não autorizado'}</Linha>
        <Linha termo="Observações">{aluno.observacoes || '—'}</Linha>
      </dl>

      {gestor && <Liberacoes aluno={aluno} />}

      {/* o portal mostra as mensalidades: o link é coisa do gestor */}
      {gestor && <LinkDoResponsavel aluno={aluno} />}

      {!gestor ? null : aluno.ativo ? (
        <button onClick={onArquivar} className="mt-6 text-xs font-semibold text-bad hover:underline">
          Arquivar atleta
        </button>
      ) : (
        <Btn variante="ghost" className="mt-6" onClick={onReativar} carregando={reativando}>
          Reativar atleta
        </Btn>
      )}
    </>
  );
}

/* Treinos em que o atleta entrou devendo, com o motivo de quem liberou.
   Some quando não houve nenhuma — é a exceção, não uma seção fixa. */
function Liberacoes({ aluno }) {
  const consulta = useLiberacoesAluno(aluno.id);
  if (!consulta.data?.length) return null;

  return (
    <>
      <Secao>Liberações com mensalidade em atraso</Secao>
      <ul className="mb-5 space-y-2">
        {consulta.data.map((l) => (
          <li key={l.id} className="rounded-lg bg-surface2 px-3 py-2 text-[12.5px]">
            <b className="tnum font-semibold">
              {l.treino?.data ? dataBR(l.treino.data) : dataBR(l.criado_em.slice(0, 10))}
            </b>
            <span className="text-ink2"> · {l.motivo}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* Link pessoal do responsável: mostra frequência e mensalidades dos
   filhos, sem senha. Trocar o código mata o link antigo. */
function LinkDoResponsavel({ aluno }) {
  const toast = useToast();
  const responsavel = useResponsavel(aluno.responsavel_id);
  const [confirmar, setConfirmar] = useState(false);

  const trocar = useAcao(() => apiAlunos.trocarTokenResponsavel(aluno.responsavel_id), {
    sucesso: () => { setConfirmar(false); toast('Link trocado — o antigo parou de funcionar'); },
  });

  if (!aluno.responsavel_id) return null;
  if (responsavel.isPending) return null;
  if (!responsavel.data?.token) return null;

  const { origin, pathname } = window.location;
  const url = `${origin}${pathname}#/portal/${responsavel.data.token}`;

  const compartilhar = async () => {
    const texto =
      `Olá, ${primeiroNome(aluno.responsavel_nome || '')}! Este é o link para acompanhar ` +
      `${primeiroNome(aluno.nome)} na escolinha — frequência, mensalidades e avaliações:\n${url}`;
    if (aluno.responsavel_telefone) {
      window.open(linkWhatsApp(aluno.responsavel_telefone, texto), '_blank');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado');
    } catch {
      toast('Não deu para copiar. Selecione o link e copie na mão.');
    }
  };

  return (
    <>
      <Secao>Acompanhamento do responsável</Secao>
      <p className="mb-2.5 text-[12.5px] text-ink3">
        Link pessoal, sem senha. Mostra os filhos deste responsável — frequência, mensalidades e
        as notas da avaliação (a sua observação não aparece).
      </p>
      <div className="rounded-lg border border-line bg-surface2 px-3 py-2.5">
        <code className="block truncate text-[11.5px] text-ink2">{url}</code>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Btn variante="ghost" className="!min-h-9 !text-xs" onClick={compartilhar}>
          {aluno.responsavel_telefone ? 'Mandar no WhatsApp' : 'Copiar link'}
        </Btn>
        <Btn variante="ghost" className="!min-h-9 !text-xs" onClick={() => window.open(url, '_blank')}>
          Ver como o pai vê
        </Btn>
        <Btn variante="perigo" className="!min-h-9 !text-xs" onClick={() => setConfirmar(true)}>
          Trocar link
        </Btn>
      </div>

      <Confirmar
        aberto={confirmar}
        titulo="Trocar o link do responsável?"
        texto="O link atual para de funcionar na hora, para todos os filhos dele. Use se ele tiver ido parar em grupo errado."
        rotulo="Trocar link"
        carregando={trocar.isPending}
        onConfirmar={() => trocar.mutate()}
        onFechar={() => setConfirmar(false)}
      />
    </>
  );
}

/* ---------------------------------------------------------------- */
function AbaMensalidades({ aluno, onNovaAvulsa, onCancelar }) {
  const toast = useToast();
  const { escolinha } = useSessao();
  const consulta = useMensalidadesDoAluno(aluno.id);

  const baixar = useAcao((id) => apiFinanceiro.registrarPagamento(id), {
    sucesso: (valor) => toast(`Pagamento de ${brl(valor)} registrado — já entrou no caixa`),
  });
  const estornar = useAcao((id) => apiFinanceiro.estornarPagamento(id), {
    sucesso: () => toast('Pagamento estornado'),
  });
  const recibo = async (m) => {
    const { reciboPDF } = await import('../lib/pdf.js');
    reciboPDF({ escolinha, aluno, mensalidade: m });
  };

  if (consulta.isPending) return <Esqueleto linhas={4} className="!p-0" />;
  if (consulta.isError) return <Erro erro={consulta.error} aoTentar={consulta.refetch} />;

  const botaoNova = aluno.ativo && (
    <Btn variante="ghost" className="mb-3 w-full !min-h-9 !text-xs sm:w-auto" onClick={onNovaAvulsa}>
      + Cobrança avulsa
    </Btn>
  );

  return (
    <>
      {botaoNova}
      {!consulta.data.length ? (
        <Vazio
          icone="💸"
          titulo="Nenhuma cobrança"
          texto="As mensalidades são geradas todo dia 1º, ou pelo botão “Gerar as do mês” no Financeiro."
        />
      ) : (
        <ul className="-mx-4 border-t border-line sm:-mx-5">
          {consulta.data.map((m) => {
            const { valor, nota } = valorCobranca(m);
            return (
              <li key={m.id} className="border-b border-line px-4 py-3 last:border-b-0 sm:px-5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <b className="block text-[13px] font-semibold first-letter:uppercase">{tituloCobranca(m)}</b>
                    <small className="block text-xs text-ink3">
                      {m.status === 'paga'
                        ? `pago em ${dataBR(m.pago_em)}${m.metodo ? ` · ${m.metodo}` : ''}`
                        : m.status === 'cancelada'
                          ? 'cancelada'
                          : `vence em ${dataBR(m.vencimento)}`}
                    </small>
                    {m.tipo === 'mensalidade' && m.descricao && (
                      <small className="block text-xs text-ink3">{m.descricao}</small>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <b className="tnum block text-[13px]">{brl(valor)}</b>
                    {nota && <small className="block text-[11px] text-ink3">{nota}</small>}
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {m.status === 'paga' ? (
                    <Tag tom="ok">Quitada</Tag>
                  ) : m.status === 'cancelada' ? (
                    <Tag>Cancelada</Tag>
                  ) : m.status === 'isenta' ? (
                    <Tag>Isento</Tag>
                  ) : m.avisado_em ? (
                    <Tag tom="warn">Avisou que pagou</Tag>
                  ) : m.dias_atraso > 0 ? (
                    <Tag tom="bad">{m.dias_atraso} dias</Tag>
                  ) : (
                    <Tag tom="warn">Em aberto</Tag>
                  )}
                  <span className="flex-1" />
                  {m.status === 'paga' ? (
                    <>
                      <Btn variante="ghost" className="!min-h-9 !text-xs" onClick={() => recibo(m)}>
                        Recibo em PDF
                      </Btn>
                      <Btn
                        variante="ghost"
                        className="!min-h-9 !text-xs"
                        onClick={() => estornar.mutate(m.id)}
                        carregando={estornar.isPending && estornar.variables === m.id}
                      >
                        Estornar
                      </Btn>
                    </>
                  ) : m.status === 'aberta' ? (
                    <>
                      <Btn variante="ghost" className="!min-h-9 !text-xs" onClick={() => onCancelar(m)}>
                        Cancelar
                      </Btn>
                      <Btn
                        variante="ghost"
                        className="!min-h-9 !text-xs"
                        onClick={() => baixar.mutate(m.id)}
                        carregando={baixar.isPending && baixar.variables === m.id}
                      >
                        Marcar como paga
                      </Btn>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/* Uniforme, campeonato, excursão: cobrança avulsa, com multa e juros da
   escolinha se atrasar, mas sem o desconto de pontualidade. */
function NovaAvulsa({ aberto, aluno, onFechar }) {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const [erro, setErro] = useState(null);

  const criar = useAcao((dados) => apiCobranca.criarAvulsa(escolinhaId, aluno.id, dados), {
    sucesso: () => { toast('Cobrança lançada — já aparece para o responsável'); onFechar(); },
  });

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);
    const valor = paraCentavos(f.get('valor'));
    if (f.get('descricao').trim().length < 2) return setErro('Diga o que está sendo cobrado.');
    if (!valor) return setErro('Informe o valor.');
    criar.mutate(
      { descricao: f.get('descricao').trim(), valor_centavos: valor, vencimento: f.get('vencimento') },
      { onError: (err) => setErro(err.message) }
    );
  };

  const emUmaSemana = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  return (
    <Sheet aberto={aberto} onFechar={onFechar} largura="max-w-md" rotulo="Nova cobrança avulsa">
      <form onSubmit={enviar}>
        <div className="px-5 pt-5 pb-1">
          <h3 className="text-lg">Cobrança avulsa</h3>
          <p className="mt-1.5 text-[13px] text-ink3">Para {primeiroNome(aluno.nome)}, fora da mensalidade.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          <Field label="O que é" className="col-span-2">
            <Input name="descricao" maxLength={120} placeholder="Uniforme 2026" required />
          </Field>
          <Field label="Valor (R$)">
            <Input name="valor" inputMode="decimal" placeholder="90,00" required />
          </Field>
          <Field label="Vencimento">
            <Input name="vencimento" type="date" defaultValue={emUmaSemana} required />
          </Field>
          <div className="col-span-2"><Alerta>{erro}</Alerta></div>
        </div>
        <SheetFoot>
          <Btn variante="ghost" type="button" onClick={onFechar}>Voltar</Btn>
          <Btn type="submit" carregando={criar.isPending}>Lançar cobrança</Btn>
        </SheetFoot>
      </form>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- */
function AbaAvaliacoes({ aluno, onAvaliar }) {
  const toast = useToast();
  const consulta = useAvaliacoes(aluno.id);
  const [apagando, setApagando] = useState(null);

  const apagar = useAcao(() => apiAvaliacoes.apagar(apagando.id), {
    sucesso: () => { toast('Avaliação apagada'); setApagando(null); },
  });

  if (consulta.isPending) return <Esqueleto linhas={3} className="!p-0" />;
  if (consulta.isError) return <Erro erro={consulta.error} aoTentar={consulta.refetch} />;
  if (!consulta.data.length) {
    return (
      <Vazio
        icone="⭐"
        titulo="Nenhuma avaliação ainda"
        texto="Dê notas de 1 a 5 por quesito de tempos em tempos. A evolução aparece aqui, e o responsável vê as notas no portal dele."
      >
        <Btn onClick={() => onAvaliar({ novo: true })}>Avaliar agora</Btn>
      </Vazio>
    );
  }

  const [atual, anterior] = consulta.data;
  const evolucao = anterior ? (atual.media - anterior.media).toFixed(1) : null;

  return (
    <>
      {evolucao != null && (
        <p className="mb-4 rounded-lg bg-surface2 px-3 py-2.5 text-[12.5px] text-ink2">
          Desde {dataBR(anterior.data)}, a média{' '}
          {Number(evolucao) > 0 ? (
            <b className="text-ok">subiu {evolucao} ponto{Math.abs(evolucao) === 1 ? '' : 's'}</b>
          ) : Number(evolucao) < 0 ? (
            <b className="text-bad">caiu {Math.abs(evolucao)} ponto{Math.abs(evolucao) === 1 ? '' : 's'}</b>
          ) : (
            <b>ficou igual</b>
          )}
          .
        </p>
      )}

      <ul className="-mx-4 sm:-mx-5">
        {consulta.data.map((a) => (
          <li key={a.id} className="border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5">
            <div className="mb-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <b className="block text-[13px] font-semibold">{dataBR(a.data)}</b>
                {a.avaliador_nome && (
                  <small className="text-xs text-ink3">por {a.avaliador_nome}</small>
                )}
              </div>
              <b className="font-display text-2xl font-semibold text-accent">{a.media}</b>
              <span className="text-xs text-ink3">de 5</span>
            </div>

            <ul className="space-y-1.5">
              {a.notas.map((n) => (
                <li key={n.quesito_id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink2">{n.quesito}</span>
                  <span className="flex gap-0.5" aria-label={`${n.nota} de 5`}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <i key={i} className={`block size-2 rounded-full ${i <= n.nota ? 'bg-accent' : 'bg-surface2'}`} />
                    ))}
                  </span>
                  <b className="tnum w-3 text-right text-[12.5px]">{n.nota}</b>
                </li>
              ))}
            </ul>

            {a.observacao && (
              <p className="mt-2.5 rounded-lg bg-surface2 px-2.5 py-2 text-[12.5px] text-ink2">
                {a.observacao}
              </p>
            )}

            <div className="mt-2.5 flex gap-2">
              <Btn variante="ghost" className="!min-h-9 !text-xs" onClick={() => onAvaliar(a)}>
                Editar
              </Btn>
              <button
                onClick={() => setApagando(a)}
                className="px-2 text-xs font-semibold text-ink3 transition hover:text-bad"
              >
                Apagar
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Confirmar
        aberto={Boolean(apagando)}
        titulo="Apagar avaliação?"
        texto={apagando ? `A avaliação de ${dataBR(apagando.data)} some, com as notas.` : ''}
        rotulo="Apagar"
        carregando={apagar.isPending}
        onConfirmar={() => apagar.mutate()}
        onFechar={() => setApagando(null)}
      />
    </>
  );
}

function Secao({ children }) {
  return (
    <div className="mb-3 flex items-center gap-3 [&:not(:first-child)]:mt-6">
      <span className="text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap text-ink3 uppercase">
        {children}
      </span>
      <hr className="flex-1 border-line" />
    </div>
  );
}

/* Situação do contrato do atleta, com o PDF do aceite para quem assinou.
   Só o gestor chega aqui: o aceite tem o CPF do responsável. */
function LinhaContrato({ aluno }) {
  const { escolinha } = useSessao();
  const aceite = useQuery({
    queryKey: ['contrato-aceite', aluno.id],
    queryFn: () => apiContrato.aceiteDoAluno(aluno.id),
  });

  if (aceite.isPending) return null;
  if (!aceite.data && !escolinha?.exige_contrato) return null;

  const baixar = async () => {
    const { contratoPDF } = await import('../lib/pdf.js');
    contratoPDF({ escolinha, aceite: aceite.data });
  };

  return (
    <Linha termo="Contrato">
      {aceite.data ? (
        <>
          Aceito em {dataBR(aceite.data.aceito_em)} por {aceite.data.assinante_nome}
          <button onClick={baixar} className="ml-2 font-semibold text-accent hover:underline">
            Baixar PDF
          </button>
        </>
      ) : (
        <>
          <Tag tom="warn">pendente</Tag>
          <span className="ml-2 text-ink3">o responsável aceita pelo link dele, logo abaixo</span>
        </>
      )}
    </Linha>
  );
}
