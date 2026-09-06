import { useEffect, useRef, useState } from 'react';
import { Alerta, Btn, Confirmar, Foto, Sheet, SheetFoot, Tag, useToast } from '../ui.jsx';
import { useAcao, useHistoricoAluno } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiAlunos from '../api/alunos.js';
import * as apiFotos from '../api/fotos.js';
import { situacaoMensalidade, ROTULO_MARCA } from '../lib/constantes.js';
import { brl, corFreq, dataBR, dataCurta, idade, linkWhatsApp, primeiroNome } from '../lib/format.js';

const PONTO = { P: 'bg-ok', F: 'bg-bad', J: 'bg-warn' };

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
  const { escolinhaId } = useSessao();
  const historico = useHistoricoAluno(aluno?.id);
  const foto = useFotoUrl(aluno?.foto_path);
  const arquivo = useRef(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erro, setErro] = useState(null);
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);

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

  const trocarFoto = useAcao(
    async (f) => apiFotos.enviar(escolinhaId, aluno.id, f),
    { sucesso: () => toast('Foto atualizada') }
  );

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

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg sm:text-xl">{aluno.nome}</h3>
            <small className="text-[12.5px] text-ink3">
              {[aluno.turma_nome, aluno.posicao, aluno.numero && `camisa ${aluno.numero}`]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </div>
          <Tag tom={aluno.ativo ? situacao.tom : 'neutro'}>
            {aluno.ativo ? situacao.rotulo : 'Arquivado'}
          </Tag>
        </header>

        <div className="grid grid-cols-3 border-b border-line">
          {[
            ['Frequência', aluno.frequencia != null ? `${aluno.frequencia}%` : '—', corFreq(aluno.frequencia)],
            ['Treinos', `${aluno.presencas}/${aluno.treinos}`, ''],
            ['Mensalidade', brl(aluno.valor_centavos), ''],
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

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {erro && <div className="mb-3"><Alerta>{erro}</Alerta></div>}

          <div className="mb-3 flex items-center gap-3">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-ink3 uppercase">
              Últimos treinos
            </span>
            <hr className="flex-1 border-line" />
          </div>

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

          <div className="mb-3 flex items-center gap-3">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-ink3 uppercase">Dados</span>
            <hr className="flex-1 border-line" />
          </div>
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
            <Linha termo="Vencimento">
              Todo dia {aluno.dia_vencimento}
              {situacao.dias > 0 && <Tag tom="bad" className="ml-2">{situacao.dias} dias de atraso</Tag>}
            </Linha>
            <Linha termo="Matrícula">{dataBR(aluno.matriculado_em)}</Linha>
            <Linha termo="Uso de imagem">{aluno.autoriza_imagem ? 'Autorizado' : 'Não autorizado'}</Linha>
            <Linha termo="Observações">{aluno.observacoes || '—'}</Linha>
          </dl>

          {aluno.ativo ? (
            <button
              onClick={() => setConfirmarArquivo(true)}
              className="mt-6 text-xs font-semibold text-bad hover:underline"
            >
              Arquivar atleta
            </button>
          ) : (
            <Btn
              variante="ghost"
              className="mt-6"
              onClick={() => reativar.mutate()}
              carregando={reativar.isPending}
            >
              Reativar atleta
            </Btn>
          )}
        </div>

        <SheetFoot>
          <Btn variante="ghost" onClick={onFechar}>Fechar</Btn>
          {aluno.ativo && aluno.responsavel_telefone && (
            <Btn
              variante="ghost"
              onClick={() => window.open(linkWhatsApp(aluno.responsavel_telefone, mensagemWhats), '_blank')}
            >
              Chamar no WhatsApp
            </Btn>
          )}
          {aluno.ativo && situacao.dias > 0 ? (
            <Btn onClick={() => { onFechar(); onCobrar?.(aluno); }}>Enviar cobrança</Btn>
          ) : (
            <Btn onClick={() => { onFechar(); onEditar?.(aluno); }}>Editar ficha</Btn>
          )}
        </SheetFoot>
      </Sheet>

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
