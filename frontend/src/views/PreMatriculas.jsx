import { useEffect, useState } from 'react';
import {
  Alerta, Btn, Erro, Esqueleto, Field, Input, Panel, Select, Sheet, SheetFoot, Tag, Vazio, useToast,
} from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { useAcao, usePreMatriculas, useTurmas } from '../hooks/dados.js';
import * as apiMatriculas from '../api/matriculas.js';
import * as apiAlunos from '../api/alunos.js';
import { useSessao } from '../estado/Sessao.jsx';
import { dataBR, idade, linkWhatsApp, primeiroNome } from '../lib/format.js';
import LinkMatricula from './LinkMatricula.jsx';

export default function PreMatriculas() {
  const toast = useToast();
  const pendentes = usePreMatriculas();
  const [analisando, setAnalisando] = useState(null);

  return (
    <>
      <PageHead
        titulo="Matrículas"
        sub="Fichas que os responsáveis enviaram pelo link público, esperando a sua conferência."
      />

      <div className="mb-4">
        <LinkMatricula />
      </div>

      <Panel
        titulo="Fichas para analisar"
        extra={<Tag tom={pendentes.data?.length ? 'warn' : 'ok'}>{pendentes.data?.length ?? 0}</Tag>}
      >
        {pendentes.isPending ? (
          <Esqueleto linhas={3} />
        ) : pendentes.isError ? (
          <Erro erro={pendentes.error} aoTentar={pendentes.refetch} />
        ) : !pendentes.data.length ? (
          <Vazio
            icone="📨"
            titulo="Nenhuma ficha esperando"
            texto="Compartilhe o link acima no grupo dos pais. O que eles preencherem aparece aqui antes de virar matrícula."
          />
        ) : (
          <ul>
            {pendentes.data.map((p) => (
              <li key={p.id} className="border-b border-line p-3 last:border-b-0 sm:px-4">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accentsoft text-base">
                    📝
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13.5px] font-semibold">{p.aluno_nome}</b>
                    <small className="block text-xs text-ink3">
                      {[
                        p.nascimento && `${idade(p.nascimento)} anos`,
                        p.turma?.nome ? `quer ${p.turma.nome}` : 'sem turma escolhida',
                        p.posicao,
                      ].filter(Boolean).join(' · ')}
                    </small>
                    <small className="mt-1 block text-xs text-ink3">
                      {p.resp_nome} ({p.resp_parentesco}) · <span className="tnum">{p.resp_telefone}</span>
                    </small>
                    {p.observacoes && (
                      <p className="mt-1.5 rounded-lg bg-surface2 px-2.5 py-1.5 text-[12px] text-ink2">
                        {p.observacoes}
                      </p>
                    )}
                  </div>
                  <small className="shrink-0 text-[11px] text-ink3">{dataBR(p.enviada_em)}</small>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:ml-12 sm:flex">
                  <Btn onClick={() => setAnalisando(p)}>Analisar</Btn>
                  {p.resp_telefone && (
                    <Btn
                      variante="ghost"
                      onClick={() =>
                        window.open(
                          linkWhatsApp(
                            p.resp_telefone,
                            `Olá, ${primeiroNome(p.resp_nome)}! Recebemos a ficha do(a) ${primeiroNome(p.aluno_nome)}. `
                          ),
                          '_blank'
                        )
                      }
                    >
                      WhatsApp
                    </Btn>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {analisando && <Analise ficha={analisando} onFechar={() => setAnalisando(null)} />}
    </>
  );
}

function Analise({ ficha, onFechar }) {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const turmas = useTurmas();
  const [turmaId, setTurmaId] = useState(ficha.turma_id ?? '');
  const [numero, setNumero] = useState('');
  const [motivo, setMotivo] = useState('');
  const [recusando, setRecusando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    apiAlunos.proximoNumero(escolinhaId).then((n) => setNumero(String(n))).catch(() => {});
  }, [escolinhaId]);

  const aprovar = useAcao(
    () => apiMatriculas.aprovar(ficha.id, { turmaId: turmaId || null, numero: numero ? Number(numero) : null }),
    {
      sucesso: () => {
        toast(`${primeiroNome(ficha.aluno_nome)} matriculado — a mensalidade do mês já foi gerada`);
        onFechar();
      },
    }
  );

  const recusar = useAcao(() => apiMatriculas.recusar(ficha.id, motivo), {
    sucesso: () => { toast('Ficha recusada'); onFechar(); },
  });

  const turma = (turmas.data ?? []).find((t) => t.id === turmaId);

  return (
    <Sheet aberto onFechar={onFechar} largura="max-w-lg" rotulo={`Analisar ${ficha.aluno_nome}`}>
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg sm:text-xl">{ficha.aluno_nome}</h3>
        <p className="mt-1 text-[13px] text-ink3">
          Enviada por {ficha.resp_nome} em {dataBR(ficha.enviada_em)}
        </p>
      </header>

      <div className="flex-1 space-y-3.5 overflow-y-auto p-4 sm:px-5">
        <dl className="grid grid-cols-[minmax(92px,auto)_1fr] gap-x-3.5 gap-y-2 text-[13px]">
          <dt className="text-ink3">Nascimento</dt>
          <dd className="m-0 font-medium">
            {ficha.nascimento ? `${dataBR(ficha.nascimento)} · ${idade(ficha.nascimento)} anos` : 'não informado'}
          </dd>
          <dt className="text-ink3">Posição</dt>
          <dd className="m-0 font-medium">{ficha.posicao || 'não informada'}</dd>
          <dt className="text-ink3">Responsável</dt>
          <dd className="m-0 font-medium">{ficha.resp_nome} ({ficha.resp_parentesco})</dd>
          <dt className="text-ink3">WhatsApp</dt>
          <dd className="m-0 font-medium tnum">{ficha.resp_telefone}</dd>
          {ficha.resp_email && (<><dt className="text-ink3">E-mail</dt><dd className="m-0 font-medium">{ficha.resp_email}</dd></>)}
          <dt className="text-ink3">Uso de imagem</dt>
          <dd className="m-0 font-medium">{ficha.autoriza_imagem ? 'autorizado' : 'não autorizado'}</dd>
          <dt className="text-ink3">Observações</dt>
          <dd className="m-0 font-medium">{ficha.observacoes || '—'}</dd>
        </dl>

        {!recusando ? (
          <>
            <hr className="border-line" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Turma" dica={turma ? `${turma.vagas} vaga${turma.vagas === 1 ? '' : 's'}` : null}>
                <Select value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
                  <option value="">Sem turma</option>
                  {(turmas.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}{t.vagas <= 0 ? ' (lotada)' : ''}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Número da camisa">
                <Input type="number" min="1" max="99" value={numero} onChange={(e) => setNumero(e.target.value)} />
              </Field>
            </div>
            <Alerta>{erro}</Alerta>
          </>
        ) : (
          <>
            <hr className="border-line" />
            <Field label="Motivo (opcional)" dica="Fica registrado no histórico; o responsável não vê.">
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Sem vaga na categoria" />
            </Field>
          </>
        )}
      </div>

      <SheetFoot>
        {recusando ? (
          <>
            <Btn variante="ghost" onClick={() => setRecusando(false)}>Voltar</Btn>
            <Btn variante="perigo" onClick={() => recusar.mutate()} carregando={recusar.isPending}>
              Confirmar recusa
            </Btn>
          </>
        ) : (
          <>
            <Btn variante="ghost" onClick={() => setRecusando(true)}>Recusar</Btn>
            <Btn
              onClick={() => aprovar.mutate(undefined, { onError: (e) => setErro(e.message) })}
              carregando={aprovar.isPending}
            >
              Aprovar e matricular
            </Btn>
          </>
        )}
      </SheetFoot>
    </Sheet>
  );
}
