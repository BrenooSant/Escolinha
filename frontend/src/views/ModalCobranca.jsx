import { useState } from 'react';
import { Alerta, Btn, Sheet, SheetFoot, Textarea, useToast } from '../ui.jsx';
import { useAcao } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import { registrarLembrete } from '../api/financeiro.js';
import { brl, dataBR, linkWhatsApp, primeiroNome } from '../lib/format.js';

/* A cobrança pode ser aberta da lista de atrasos ou da ficha do atleta;
   nos dois casos parte da linha de vw_mensalidades. */
export const cobrancaDeMensalidade = (m) => ({
  mensalidadeId: m.id,
  // avulsa (uniforme, taxa) aparece pelo nome; mensalidade, pelo mês
  descricao: m.tipo === 'avulsa' ? m.descricao || 'cobrança avulsa' : null,
  valorOriginalCentavos: m.valor_centavos,
  alunoNome: m.aluno_nome,
  turmaNome: m.turma_nome,
  responsavelNome: m.responsavel_nome,
  telefone: m.responsavel_telefone,
  // com multa e juros se atrasou, com desconto se ainda dá tempo
  valorCentavos: m.valor_atualizado_centavos ?? m.valor_centavos,
  vencimento: m.vencimento,
  diasAtraso: m.dias_atraso,
});

export function textoPadrao(c, escolinha) {
  const resp = primeiroNome(c.responsavelNome) || 'tudo bem';
  const atraso = c.diasAtraso > 0
    ? `venceu em ${dataBR(c.vencimento)} e está com ${c.diasAtraso} dia${c.diasAtraso > 1 ? 's' : ''} de atraso`
    : `vence em ${dataBR(c.vencimento)}`;

  return (
    `Olá, ${resp}! Aqui é da ${escolinha?.nome || 'escolinha'} ⚽\n\n` +
    `Passando para lembrar que ${c.descricao ? `a cobrança "${c.descricao}"` : 'a mensalidade'} do(a) ` +
    `${primeiroNome(c.alunoNome)}${c.turmaNome ? ` (${c.turmaNome})` : ''} ${atraso}.\n\n` +
    `Valor: ${brl(c.valorCentavos)}` +
    (c.valorOriginalCentavos && c.valorCentavos > c.valorOriginalCentavos
      ? ` (${brl(c.valorOriginalCentavos)} + multa e juros)`
      : c.valorOriginalCentavos && c.valorCentavos < c.valorOriginalCentavos
        ? ` com o desconto de pontualidade`
        : '') +
    `\n` +
    (escolinha?.chave_pix ? `PIX: ${escolinha.chave_pix}\n` : '') +
    `\nAssim que pagar, é só mandar o comprovante por aqui. ` +
    `Qualquer dificuldade a gente conversa e parcela. Obrigado!`
  );
}

export default function ModalCobranca({ cobranca, onFechar }) {
  const toast = useToast();
  const { escolinha, escolinhaId } = useSessao();
  const [texto, setTexto] = useState(() => textoPadrao(cobranca, escolinha));
  const [erro, setErro] = useState(null);

  /* Registrar o lembrete e abrir o WhatsApp são passos separados: o
     histórico fica no banco mesmo que o professor feche a aba antes de
     apertar enviar lá no aplicativo. */
  const registrar = useAcao(
    () => registrarLembrete(escolinhaId, cobranca.mensalidadeId, texto),
    { sucesso: () => toast('Lembrete registrado para ' + primeiroNome(cobranca.responsavelNome)) }
  );

  const enviar = async () => {
    if (!cobranca.telefone) return setErro('Este responsável não tem WhatsApp cadastrado.');
    const url = linkWhatsApp(cobranca.telefone, texto);
    // abre antes do await: navegadores bloqueiam popup fora do clique
    window.open(url, '_blank', 'noopener');
    if (cobranca.mensalidadeId) {
      try {
        await registrar.mutateAsync();
      } catch (e) {
        setErro(e.message);
        return;
      }
    }
    onFechar();
  };

  return (
    <Sheet aberto onFechar={onFechar} rotulo={`Lembrete para ${cobranca.responsavelNome || cobranca.alunoNome}`}>
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg">Lembrete para {cobranca.responsavelNome || 'o responsável'}</h3>
        <p className="mt-1 text-[13px] text-ink3">
          {cobranca.telefone ? `WhatsApp ${cobranca.telefone} · ` : ''}responsável por {cobranca.alunoNome}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:px-5">
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-44 text-[13px]" />
        <p className="mt-2 text-[11.5px] text-ink3">
          Dá para editar o texto antes de mandar. O envio abre o WhatsApp com a mensagem pronta.
        </p>
        <div className="mt-3"><Alerta>{erro}</Alerta></div>
      </div>

      <SheetFoot>
        <Btn variante="ghost" onClick={onFechar}>Cancelar</Btn>
        <Btn onClick={enviar} carregando={registrar.isPending}>Abrir no WhatsApp</Btn>
      </SheetFoot>
    </Sheet>
  );
}
