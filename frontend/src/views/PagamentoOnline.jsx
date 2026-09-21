import { useState } from 'react';
import { Alerta, Btn, Confirmar, Esqueleto, Field, Input, Panel, Tag, useToast } from '../ui.jsx';
import { useAcao, useConexaoAsaas } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiAsaas from '../api/asaas.js';
import { dataBR } from '../lib/format.js';

/* Conexão com o Asaas.

   A escolinha usa a conta dela: o dinheiro cai direto lá, e a
   plataforma não entra no caminho. O que o app faz é mostrar boleto,
   Pix e cartão no link do responsável e dar baixa sozinho quando o
   pagamento entra. */
export default function PagamentoOnline() {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const conexao = useConexaoAsaas();
  const [chave, setChave] = useState('');
  const [erro, setErro] = useState(null);
  const [desconectando, setDesconectando] = useState(false);

  const conectar = useAcao((c) => apiAsaas.conectar(escolinhaId, c), {
    sucesso: (r) => {
      setChave('');
      conexao.refetch();
      toast(`Conta ${r.conta?.nome ?? ''} conectada — o link do responsável já mostra o boleto`);
    },
  });

  const desconectar = useAcao(() => apiAsaas.desconectar(escolinhaId), {
    sucesso: () => { setDesconectando(false); conexao.refetch(); toast('Conta desconectada'); },
  });

  if (conexao.isPending) return <Panel titulo="Pagamento pelo link"><Esqueleto linhas={3} /></Panel>;

  const c = conexao.data;

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    if (!chave.trim().startsWith('$aact_')) {
      return setErro('A chave do Asaas começa com $aact_. Copie a chave inteira, sem espaços.');
    }
    conectar.mutate(chave.trim(), { onError: (err) => setErro(err.message) });
  };

  return (
    <>
      <Panel
        titulo="Pagamento pelo link"
        extra={c ? <Tag tom="ok">conectado</Tag> : <Tag>desligado</Tag>}
        corpo
      >
        {c ? (
          <>
            <p className="text-[13px] text-ink2">
              O responsável abre o link do filho e paga por boleto, Pix ou cartão. Quando o pagamento
              entra, a mensalidade é quitada sozinha aqui e o dinheiro fica na conta da escolinha.
            </p>
            <dl className="mt-3 grid grid-cols-[minmax(92px,auto)_1fr] gap-x-3.5 gap-y-2 text-[13px]">
              <dt className="text-ink3">Conta</dt>
              <dd>{c.conta_nome || '—'}{c.conta_email ? ` · ${c.conta_email}` : ''}</dd>
              <dt className="text-ink3">Chave</dt>
              <dd className="tnum">••••{c.chave_final}{c.ambiente === 'sandbox' ? ' · ambiente de testes' : ''}</dd>
              <dt className="text-ink3">Conectada em</dt>
              <dd>{dataBR(c.conectada_em)}</dd>
              <dt className="text-ink3">Último aviso</dt>
              <dd>{c.ultimo_evento_em ? dataBR(c.ultimo_evento_em) : 'nenhum ainda'}</dd>
            </dl>

            {c.ultimo_erro && (
              <div className="mt-3">
                <Alerta tom="warn">
                  A última conversa com o Asaas falhou ({dataBR(c.ultimo_erro_em)}): {c.ultimo_erro}
                </Alerta>
              </div>
            )}

            <p className="mt-3 rounded-lg bg-surface2 px-3 py-2.5 text-[12.5px] text-ink2">
              <b className="block">Falta um passo, no painel do Asaas</b>
              Ligue a transferência automática para a conta bancária da escolinha. Sem isso, o dinheiro
              fica parado no saldo do Asaas esperando você mandar para o banco.
            </p>

            <Btn variante="perigo" className="mt-4" onClick={() => setDesconectando(true)}>
              Desconectar
            </Btn>
          </>
        ) : (
          <>
            <p className="text-[13px] text-ink2">
              Com a conta do Asaas conectada, o link do responsável passa a mostrar boleto, Pix e
              cartão — e a baixa acontece sozinha. O dinheiro cai na conta da escolinha; a plataforma
              não toca nele.
            </p>
            <ol className="mt-3 space-y-1.5 text-[13px] text-ink2">
              <li>1. Crie a conta em <b>asaas.com</b> (grátis) e conclua o cadastro.</li>
              <li>2. No painel do Asaas, vá em <b>Integrações → Chave de API</b> e gere a chave.</li>
              <li>3. Cole a chave aqui embaixo.</li>
            </ol>
            <p className="mt-2 text-xs text-ink3">
              A chave dá acesso à conta, então ela fica guardada no servidor e não aparece mais nesta
              tela. Deixe ligada a <b>autorização de ação crítica</b> no Asaas: assim nenhuma
              transferência sai sem a sua confirmação.
            </p>

            <form onSubmit={enviar} className="mt-4 space-y-3">
              <Field label="Chave de API do Asaas">
                <Input
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  type="password"
                  autoComplete="off"
                  placeholder="$aact_..."
                />
              </Field>
              <Alerta>{erro}</Alerta>
              <Btn type="submit" carregando={conectar.isPending}>Conectar conta</Btn>
            </form>
          </>
        )}
      </Panel>

      <Confirmar
        aberto={desconectando}
        titulo="Desconectar a conta do Asaas?"
        texto="O link do responsável volta a mostrar só o Pix da escolinha, e as baixas deixam de ser automáticas. As cobranças já criadas continuam valendo no Asaas."
        rotulo="Desconectar"
        carregando={desconectar.isPending}
        onConfirmar={() => desconectar.mutate()}
        onFechar={() => setDesconectando(false)}
      />
    </>
  );
}
