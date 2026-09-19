import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alerta, Btn, Carregando, Jersey, Sheet, SheetFoot, Tag, Textarea } from '../ui.jsx';
import * as apiPortal from '../api/portal.js';
import { brl, corFreq, dataBR, dataCurta, diaDaSemana, hora } from '../lib/format.js';
import { tituloCobranca, valorCobranca } from '../lib/constantes.js';
import { pixCopiaECola } from '../lib/pix.js';

/* Página do responsável. Sem login: tudo sai do token que está no link,
   e o servidor só devolve os filhos daquele responsável. Só leitura,
   com uma exceção — avisar que pagou. */
export default function Portal() {
  const { token } = useParams();
  const [dados, setDados] = useState(undefined);
  const [avisando, setAvisando] = useState(null);
  const [pagando, setPagando] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setDados((await apiPortal.abrir(token)) ?? null);
    } catch {
      setDados(null);
    }
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  if (dados === undefined) {
    return <div className="grid min-h-dvh place-items-center"><Carregando texto="Abrindo…" /></div>;
  }

  if (dados === null) {
    return (
      <Moldura titulo="Link indisponível">
        <div className="p-6 text-center">
          <span className="mb-3 block text-3xl" aria-hidden="true">🔒</span>
          <b className="block text-[15px]">Este link não está valendo</b>
          <p className="mx-auto mt-2 max-w-[38ch] text-[13px] text-ink3">
            Ele pode ter sido trocado pela escolinha. Peça o link novo pelo WhatsApp da escolinha.
          </p>
        </div>
      </Moldura>
    );
  }

  const { escolinha, responsavel, filhos } = dados;

  return (
    <Moldura titulo={escolinha.nome} sub={`Olá, ${responsavel.nome.split(' ')[0]}`}>
      {filhos.length === 0 ? (
        <p className="p-6 text-center text-[13px] text-ink3">
          Nenhum atleta ativo ligado a este cadastro.
        </p>
      ) : (
        <div className="space-y-4">
          {filhos.map((f) => (
            <Filho
              key={f.nome}
              f={f}
              escolinha={escolinha}
              responsavel={responsavel}
              onAvisar={setAvisando}
              onPagar={setPagando}
            />
          ))}
        </div>
      )}

      {pagando && (
        <PagarPix
          escolinha={escolinha}
          mensalidade={pagando}
          onFechar={() => setPagando(null)}
          onAvisar={() => { setAvisando(pagando); setPagando(null); }}
        />
      )}

      {avisando && (
        <AvisarPagamento
          token={token}
          mensalidade={avisando}
          onFechar={() => setAvisando(null)}
          onPronto={() => { setAvisando(null); carregar(); }}
        />
      )}
    </Moldura>
  );
}

function Filho({ f, escolinha, responsavel, onAvisar, onPagar }) {
  const pix = escolinha.chave_pix;
  const abertas = f.mensalidades.filter((m) => m.status === 'aberta');

  // o jsPDF só entra para quem de fato baixa o recibo
  const recibo = async (m) => {
    const { reciboPDF } = await import('../lib/pdf.js');
    reciboPDF({
      escolinha,
      aluno: { nome: f.nome, turma_nome: f.turma, responsavel_nome: responsavel.nome },
      mensalidade: m,
    });
  };

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-center gap-3.5 border-b border-line p-4">
        <Jersey num={f.numero ?? '·'} tamanho="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg">{f.nome}</h2>
          <small className="text-[12.5px] text-ink3">
            {[f.turma, f.posicao].filter(Boolean).join(' · ') || 'sem turma'}
          </small>
        </div>
      </header>

      {/* Vale a tolerância que a escolinha configurou: aparece só depois de
          alguns dias vencida, não no dia seguinte ao vencimento. */}
      {f.em_atraso && (
        <p role="alert" className="flex items-start gap-2.5 border-b border-bad/30 bg-bad/10 px-4 py-3 text-[13px]">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-bad" aria-hidden="true" />
          <span>
            <b className="block font-semibold text-bad">Pagamento em atraso</b>
            <span className="text-ink2">
              Tem mensalidade vencida. Se já pagou, toque em “Já paguei” abaixo para avisar a escolinha.
            </span>
          </span>
        </p>
      )}

      <div className="grid grid-cols-3 border-b border-line">
        {[
          ['Presença', f.frequencia != null ? `${f.frequencia}%` : '—', corFreq(f.frequencia)],
          ['Treinos', `${f.presencas}/${f.treinos}`, ''],
          ['Faltas', String(f.faltas), f.faltas > 0 ? 'text-bad' : ''],
        ].map(([rot, val, cor], i) => (
          <div key={rot} className={`px-4 py-3 ${i < 2 ? 'border-r border-line' : ''}`}>
            <span className="text-[10px] font-semibold tracking-[0.09em] text-ink3 uppercase">{rot}</span>
            <b className={`tnum block font-display text-lg leading-tight font-semibold sm:text-2xl ${cor}`}>{val}</b>
          </div>
        ))}
      </div>

      <Bloco titulo="Pagamentos">
        <ul className="-mx-4">
          {f.mensalidades.length === 0 && (
            <li className="px-4 text-[13px] text-ink3">Nenhuma cobrança lançada ainda.</li>
          )}
          {f.mensalidades.filter((m) => m.status !== 'cancelada').map((m) => {
            const { valor, nota } = valorCobranca(m);
            return (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <b className="block text-[13px] font-semibold first-letter:uppercase">{tituloCobranca(m)}</b>
                <small className="block text-xs text-ink3">
                  {m.status === 'paga'
                    ? `pago em ${dataBR(m.pago_em)}`
                    : `vence em ${dataBR(m.vencimento)}`}
                </small>
                {nota && <small className="block text-xs text-ink3">{nota}</small>}
              </div>
              <b className="tnum text-[13px]">{brl(valor)}</b>
              {m.status === 'paga' ? (
                <Tag tom="ok">Quitada</Tag>
              ) : m.status === 'isenta' ? (
                <Tag>Isento</Tag>
              ) : m.avisado_em ? (
                <Tag tom="warn">Aguardando confirmação</Tag>
              ) : m.dias_atraso > 0 ? (
                <Tag tom="bad">{m.dias_atraso} dias de atraso</Tag>
              ) : (
                <Tag tom="warn">Em aberto</Tag>
              )}
              {m.status === 'aberta' && !m.avisado_em && (
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                  {pix ? (
                    <Btn className="!min-h-9 !text-xs" onClick={() => onPagar(m)}>Pagar com Pix</Btn>
                  ) : null}
                  <Btn
                    variante="ghost"
                    className={`!min-h-9 !text-xs ${pix ? '' : 'col-span-2'}`}
                    onClick={() => onAvisar(m)}
                  >
                    Já paguei
                  </Btn>
                </div>
              )}
              {m.status === 'paga' && (
                <Btn variante="ghost" className="w-full !min-h-9 !text-xs sm:w-auto" onClick={() => recibo(m)}>
                  Recibo
                </Btn>
              )}
            </li>
            );
          })}
        </ul>

        {pix && abertas.length > 0 && (
          <p className="mt-3 rounded-lg bg-surface2 px-3 py-2.5 text-[12.5px] text-ink2">
            <b className="block text-[11px] tracking-[0.12em] text-ink3 uppercase">PIX da escolinha</b>
            <span className="tnum break-all">{pix}</span>
          </p>
        )}
      </Bloco>

      {f.proximos_treinos.length > 0 && (
        <Bloco titulo="Próximos treinos">
          <ul className="space-y-2">
            {f.proximos_treinos.slice(0, 5).map((t, i) => (
              <li key={i} className="flex items-center gap-3">
                <span className="w-11 shrink-0 text-center">
                  <b className="tnum block font-display text-base leading-none">{dataCurta(t.data).split('/')[0]}</b>
                  <small className="text-[10px] tracking-wide text-ink3 uppercase">
                    {diaDaSemana(t.data).slice(0, 3)}
                  </small>
                </span>
                <span className="min-w-0 text-[13px]">
                  <b className="font-semibold">{hora(t.hora)}</b>
                  {t.adversario ? (
                    <span className="text-ink2"> · amistoso vs. {t.adversario}</span>
                  ) : t.local ? (
                    <span className="text-ink2"> · {t.local}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Bloco>
      )}

      {f.avaliacao && (
        <Bloco titulo={`Avaliação de ${dataBR(f.avaliacao.data)}`}>
          <div className="mb-2.5 flex items-baseline gap-2">
            <b className="font-display text-2xl font-semibold text-accent">{f.avaliacao.media}</b>
            <span className="text-xs text-ink3">de 5</span>
          </div>
          <ul className="space-y-2">
            {f.avaliacao.notas.map((n) => (
              <li key={n.quesito} className="flex items-center gap-3">
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
        </Bloco>
      )}
    </section>
  );
}

function Bloco({ titulo, children }) {
  return (
    <div className="border-b border-line p-4 last:border-b-0">
      <span className="mb-2.5 block text-[11px] font-semibold tracking-[0.14em] text-ink3 uppercase">
        {titulo}
      </span>
      {children}
    </div>
  );
}

function AvisarPagamento({ token, mensalidade, onFechar, onPronto }) {
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    setErro(null);
    setEnviando(true);
    try {
      await apiPortal.avisarPagamento(token, mensalidade.id, obs);
      onPronto();
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <Sheet aberto onFechar={onFechar} largura="max-w-sm" rotulo="Avisar pagamento">
      <header className="px-5 pt-5">
        <h3 className="text-lg">Avisar que pagou</h3>
        <p className="mt-1.5 text-[13px] text-ink3">
          <b className="inline-block first-letter:uppercase">{tituloCobranca(mensalidade)}</b>,{' '}
          {brl(valorCobranca(mensalidade).valor)}. A coordenação confere no extrato e confirma —
          até lá ela fica marcada como aguardando.
        </p>
      </header>
      <div className="p-5 pt-3">
        <Textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          maxLength={300}
          className="min-h-20 text-[13px]"
          placeholder="Se quiser, diga como pagou — PIX no dia 5, dinheiro no treino…"
        />
        <div className="mt-3"><Alerta>{erro}</Alerta></div>
      </div>
      <SheetFoot>
        <Btn variante="ghost" onClick={onFechar}>Cancelar</Btn>
        <Btn onClick={enviar} carregando={enviando}>Avisar</Btn>
      </SheetFoot>
    </Sheet>
  );
}

function Moldura({ titulo, sub, children }) {
  return (
    <div className="min-h-dvh bg-ground">
      <header className="bg-accent px-5 py-7 text-[#EFF6F0] sm:py-9">
        <div className="mx-auto max-w-[640px]">
          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase opacity-75">
            Acompanhamento
          </span>
          <h1 className="mt-1 font-display text-3xl leading-tight font-semibold">{titulo}</h1>
          {sub && <p className="mt-1 text-sm text-[#CFE3D6]">{sub}</p>}
        </div>
      </header>
      <main className="mx-auto max-w-[640px] px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5">
        {children}
        <p className="mt-4 text-center text-[11.5px] text-ink3">
          Este link é pessoal — mostra só os seus filhos. Não repasse.
        </p>
      </main>
    </div>
  );
}

/* Pix copia e cola da cobrança, no valor de hoje (com o desconto se
   ainda vale, com multa se atrasou). O dinheiro cai direto na chave da
   escolinha; quem confirma é a coordenação — por isso o "Já paguei". */
function PagarPix({ escolinha, mensalidade, onFechar, onAvisar }) {
  const { valor, nota } = valorCobranca(mensalidade);
  const codigo = pixCopiaECola({
    chave: escolinha.chave_pix,
    nome: escolinha.razao_social || escolinha.nome,
    cidade: (escolinha.cidade || '').split(',')[0],
    valorCentavos: valor,
    txid: mensalidade.id,
  });
  const [svg, setSvg] = useState(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    import('qrcode-generator').then(({ default: qrcode }) => {
      const qr = qrcode(0, 'M');
      qr.addData(codigo);
      qr.make();
      if (vivo) setSvg(qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }));
    });
    return () => { vivo = false; };
  }, [codigo]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <Sheet aberto onFechar={onFechar} largura="max-w-sm" rotulo="Pagar com Pix">
      <header className="px-5 pt-5">
        <h3 className="text-lg">Pagar com Pix</h3>
        <p className="mt-1 text-[13px] text-ink3">
          <span className="inline-block first-letter:uppercase">{tituloCobranca(mensalidade)}</span> ·{' '}
          <b className="tnum text-ink">{brl(valor)}</b>
          {nota && <span className="block text-xs">{nota}</span>}
        </p>
      </header>
      <div className="space-y-3 p-5 pt-4">
        {/* O SVG sai da biblioteca a partir do nosso próprio texto. */}
        <div
          className="mx-auto aspect-square w-52 rounded-lg bg-white p-1 [&>svg]:size-full"
          aria-label="QR code do Pix"
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />
        <p className="text-center text-xs text-ink3">
          Abra o app do banco, escolha Pix → ler QR code, ou copie o código abaixo.
        </p>
        <p className="tnum max-h-20 overflow-y-auto rounded-lg bg-surface2 px-3 py-2 text-[11px] break-all text-ink2">
          {codigo}
        </p>
        <Btn className="w-full" onClick={copiar}>{copiado ? 'Código copiado ✓' : 'Copiar código Pix'}</Btn>
        <p className="text-center text-xs text-ink3">
          Pagou? Toque em “Já paguei” para avisar a escolinha — ela confere e confirma.
        </p>
      </div>
      <SheetFoot>
        <Btn variante="ghost" onClick={onFechar}>Fechar</Btn>
        <Btn variante="ghost" onClick={onAvisar}>Já paguei</Btn>
      </SheetFoot>
    </Sheet>
  );
}
