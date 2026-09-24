import { useMemo, useState } from 'react';
import {
  Alerta, Btn, Chips, Erro, Esqueleto, Field, Panel, Select, Sheet, SheetFoot, Tag, Textarea,
  Vazio, useToast,
} from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useSessao } from '../estado/Sessao.jsx';
import { useAcao, useFilaMensagens, useModelosMensagem } from '../hooks/dados.js';
import * as apiMensagens from '../api/mensagens.js';
import { ROTULO_TIPO, TOM_TIPO, origemDoSite, textoFinal } from '../lib/mensagens.js';
import { dataBR, linkWhatsApp, primeiroNome } from '../lib/format.js';

const ABAS = ['Para enviar', 'Enviadas', 'Modelos'];

/* A fila é montada pelo banco de manhã; aqui o gestor só revisa e
   manda. O WhatsApp não envia sozinho — precisa da Cloud API da Meta,
   com conta verificada e modelo aprovado. Até lá, o ganho está em não
   precisar mais descobrir *quem* cobrar: isso já vem pronto. */
export default function Mensagens() {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const [aba, setAba] = useState('Para enviar');
  const [aberta, setAberta] = useState(null);

  const pendentes = useFilaMensagens('pendente');
  const enviadas = useFilaMensagens('enviada');

  const montar = useAcao(() => apiMensagens.montarAgora(escolinhaId), {
    sucesso: (n) =>
      toast(
        n > 0
          ? `${n} mensagem${n > 1 ? 's' : ''} na fila`
          : 'Nada novo para hoje — a fila já estava em dia'
      ),
  });

  const consulta = aba === 'Enviadas' ? enviadas : pendentes;
  const lista = consulta.data ?? [];
  const nPendentes = pendentes.data?.length ?? 0;

  return (
    <>
      <PageHead
        titulo="Mensagens"
        sub={
          pendentes.isPending
            ? 'carregando…'
            : nPendentes > 0
              ? `${nPendentes} mensagem${nPendentes > 1 ? 's' : ''} esperando para sair`
              : 'Nenhuma mensagem esperando. A fila do dia é montada toda manhã.'
        }
      >
        <Btn variante="ghost" onClick={() => montar.mutate()} carregando={montar.isPending}>
          Montar a fila de hoje
        </Btn>
      </PageHead>

      <Chips opcoes={ABAS} valor={aba} onChange={setAba} className="mb-4" />

      {aba === 'Modelos' ? (
        <Modelos />
      ) : consulta.isPending ? (
        <Esqueleto linhas={5} />
      ) : consulta.isError ? (
        <Erro erro={consulta.error} aoTentar={consulta.refetch} />
      ) : lista.length === 0 ? (
        <Panel>
          <Vazio
            icone={aba === 'Enviadas' ? '📨' : '💬'}
            titulo={aba === 'Enviadas' ? 'Nada enviado ainda' : 'Fila vazia'}
            texto={
              aba === 'Enviadas'
                ? 'O que você mandar por aqui fica registrado nesta aba.'
                : 'Ligue os avisos em Modelos e monte a fila — ou espere a rotina da manhã.'
            }
          >
            {aba !== 'Enviadas' && <Btn onClick={() => setAba('Modelos')}>Ver os modelos</Btn>}
          </Vazio>
        </Panel>
      ) : (
        <Panel>
          <ul>
            {lista.map((m) => (
              <Linha key={m.id} m={m} enviada={aba === 'Enviadas'} onAbrir={() => setAberta(m)} />
            ))}
          </ul>
        </Panel>
      )}

      {aberta && <Revisar m={aberta} onFechar={() => setAberta(null)} />}
    </>
  );
}

function Linha({ m, enviada, onAbrir }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        onClick={onAbrir}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 p-3 text-left transition hover:bg-surface2 sm:px-4"
      >
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[13.5px] font-semibold">{m.aluno_nome || '—'}</b>
          <small className="block truncate text-xs text-ink3">
            {m.responsavel_nome || 'sem responsável'}
            {m.telefone ? ` · ${m.telefone}` : ' · sem WhatsApp'}
            {m.vencimento ? ` · vence ${dataBR(m.vencimento)}` : ''}
          </small>
        </div>
        <Tag tom={TOM_TIPO[m.tipo]}>{ROTULO_TIPO[m.tipo]}</Tag>
        {enviada && m.enviada_em && (
          <small className="tnum text-[11px] text-ink3">{dataBR(m.enviada_em.slice(0, 10))}</small>
        )}
      </button>
    </li>
  );
}

/* Revisar antes de mandar — o mesmo desenho do lembrete avulso de
   Cobranças, porque é o mesmo gesto. */
function Revisar({ m, onFechar }) {
  const toast = useToast();
  const [texto, setTexto] = useState(() => textoFinal(m, origemDoSite()));
  const [erro, setErro] = useState(null);
  const enviada = m.status === 'enviada';

  const acao = useAcao(async () => {
    /* Só grava se mexeram: o texto que vai para o histórico da cobrança
       precisa ser o que o responsável recebeu, não o do modelo. */
    if (texto !== textoFinal(m, origemDoSite())) await apiMensagens.salvarTexto(m.id, texto);
    return apiMensagens.marcarEnviada(m.id);
  });

  const dispensar = useAcao(() => apiMensagens.dispensar(m.id), {
    sucesso: () => { toast('Mensagem dispensada'); onFechar(); },
  });

  const enviar = () => {
    setErro(null);
    if (!m.telefone) return setErro('Este responsável não tem WhatsApp cadastrado.');
    // abre antes do await: navegadores bloqueiam popup fora do clique
    window.open(linkWhatsApp(m.telefone, texto), '_blank', 'noopener');
    acao.mutate(undefined, {
      onSuccess: () => {
        toast(`Registrada para ${primeiroNome(m.responsavel_nome || m.aluno_nome || '')}`);
        onFechar();
      },
      onError: (e) => setErro(e.message),
    });
  };

  return (
    <Sheet aberto onFechar={onFechar} rotulo={`Mensagem para ${m.aluno_nome}`}>
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg">{ROTULO_TIPO[m.tipo]}</h3>
        <p className="mt-1 text-[13px] text-ink3">
          {m.responsavel_nome ? `${m.responsavel_nome} · ` : ''}
          {m.telefone || 'sem WhatsApp cadastrado'} · sobre {m.aluno_nome}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:px-5">
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          readOnly={enviada}
          className="min-h-52 text-[13px]"
        />
        <p className="mt-2 text-[11.5px] text-ink3">
          {enviada
            ? 'Já enviada. O texto fica guardado como saiu.'
            : 'Dá para ajustar antes de mandar. O envio abre o WhatsApp com a mensagem pronta.'}
        </p>
        <div className="mt-3"><Alerta>{erro}</Alerta></div>
      </div>

      {!enviada && (
        <SheetFoot>
          <Btn variante="ghost" onClick={() => dispensar.mutate()} carregando={dispensar.isPending}>
            Dispensar
          </Btn>
          <Btn onClick={enviar} carregando={acao.isPending}>Abrir no WhatsApp</Btn>
        </SheetFoot>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------
   Modelos
   --------------------------------------------------------------- */
const DICA_DIAS = {
  lembrete_vencendo: 'Quantos dias antes do vencimento o aviso sai.',
  lembrete_atrasado: 'Quantos dias depois do vencimento a cobrança sai.',
};

const CAMPOS = '{{aluno}} · {{responsavel}} · {{escolinha}} · {{turma}} · {{valor}} · {{vencimento}} · {{dias_atraso}} · {{pix}} · {{link}}';

function Modelos() {
  const consulta = useModelosMensagem();

  if (consulta.isPending) return <Esqueleto linhas={6} />;
  if (consulta.isError) return <Erro erro={consulta.error} aoTentar={consulta.refetch} />;

  return (
    <div className="space-y-4">
      <Alerta tom="ok">
        Os campos entre chaves se preenchem sozinhos: {CAMPOS}
      </Alerta>
      {(consulta.data ?? []).map((m) => <Modelo key={m.tipo} m={m} />)}
    </div>
  );
}

function Modelo({ m }) {
  const toast = useToast();
  const [texto, setTexto] = useState(m.texto);
  const [ativo, setAtivo] = useState(m.ativo);
  const [dias, setDias] = useState(m.dias);
  const [erro, setErro] = useState(null);

  const salvar = useAcao(
    ({ escolinhaId }) => apiMensagens.salvarModelo(escolinhaId, m.tipo, { texto, ativo, dias }),
    { sucesso: () => toast(`${ROTULO_TIPO[m.tipo]} salvo`) }
  );

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    if (texto.trim().length < 10) return setErro('O texto está curto demais.');
    salvar.mutate({ escolinhaId: m.escolinha_id }, { onError: (err) => setErro(err.message) });
  };

  return (
    <Panel
      titulo={ROTULO_TIPO[m.tipo]}
      extra={<Tag tom={ativo ? 'ok' : 'neutro'}>{ativo ? 'ligado' : 'desligado'}</Tag>}
      corpo
    >
      <form onSubmit={enviar} className="space-y-3">
        <label className="flex items-center gap-2.5 text-[13px] font-semibold">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="size-4 accent-[var(--c-accent)]"
          />
          Entrar na fila de todo dia
        </label>

        {DICA_DIAS[m.tipo] && (
          <Field label="Quando" dica={DICA_DIAS[m.tipo]}>
            <Select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {[0, 1, 2, 3, 5, 7, 10, 15, 30].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? 'No dia do vencimento' : `${d} dia${d > 1 ? 's' : ''}`}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Texto">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="min-h-44 text-[13px]"
          />
        </Field>

        <Alerta>{erro}</Alerta>
        <Btn type="submit" carregando={salvar.isPending}>Salvar</Btn>
      </form>
    </Panel>
  );
}
