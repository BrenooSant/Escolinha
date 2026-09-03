import { useState } from 'react';
import { Btn, Jersey, Panel, Sheet, SheetFoot, Tag, Textarea, useToast } from '../ui.jsx';
import { PageHead } from '../Shell.jsx';
import { MENS, brl, primeiroNome } from '../data.js';

const mensagem = (a) =>
  `Olá, ${primeiroNome(a.resp)}! Aqui é da Escolinha Craque do Amanhã ⚽\n\n` +
  `Passando para lembrar que a mensalidade do(a) ${primeiroNome(a.n)} (${a.cat}), referente a setembro, ` +
  `venceu em 05/09 e está com ${a.dias} dias de atraso.\n\n` +
  `Valor: R$ ${MENS[a.cat]},00\nPIX (CNPJ): 12.345.678/0001-90\n\n` +
  `Assim que pagar, é só mandar o comprovante por aqui. Qualquer dificuldade a gente conversa e parcela. Obrigado!\n\n— Prof. Ricardo`;

export function ModalCobranca({ aluno, onFechar }) {
  const toast = useToast();
  const [texto, setTexto] = useState(() => (aluno ? mensagem(aluno) : ''));
  if (!aluno) return null;

  return (
    <Sheet aberto onFechar={onFechar} rotulo={`Lembrete para ${aluno.resp}`}>
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg">Lembrete para {aluno.resp}</h3>
        <p className="mt-1 text-[13px] text-ink3">
          WhatsApp {aluno.tel} · responsável por {aluno.n}
        </p>
      </header>
      <div className="flex-1 overflow-y-auto p-4 sm:px-5">
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-40 text-[13px]" />
      </div>
      <SheetFoot>
        <Btn variante="ghost" onClick={onFechar}>Cancelar</Btn>
        <Btn onClick={() => { onFechar(); toast('Mensagem enviada para ' + primeiroNome(aluno.resp)); }}>
          Enviar no WhatsApp
        </Btn>
      </SheetFoot>
    </Sheet>
  );
}

export default function Cobrancas({ alunos, resumo, onCobrar }) {
  const toast = useToast();
  const devedores = alunos.filter((a) => a.st === 'atraso');

  return (
    <>
      <PageHead
        titulo="Cobranças"
        sub={`${resumo.devedores} responsáveis com mensalidade vencida — total de ${brl(resumo.atrasado)},00`}
      >
        <Btn onClick={() => toast('Lembrete enviado para todos os responsáveis em atraso')}>Cobrar todos</Btn>
      </PageHead>

      <Panel titulo="Em aberto" extra={<Tag tom="bad">Vencidas</Tag>}>
        <ul>
          {devedores.map((a) => (
            <li key={a.n} className="border-b border-line p-3 last:border-b-0 sm:px-4">
              <div className="flex items-start gap-3">
                <Jersey num={a.num} />
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-semibold">{a.n}</b>
                  <small className="block text-xs text-ink3">
                    {a.cat} · {a.resp}
                  </small>
                  <small className="tnum block text-xs text-ink3">{a.tel}</small>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Tag tom={a.dias > 14 ? 'bad' : 'warn'}>{a.dias} dias</Tag>
                    <span className="text-[11px] text-ink3">venceu em 05/09/2026</span>
                  </div>
                </div>
                <b className="tnum shrink-0 text-[15px]">R$ {MENS[a.cat]}</b>
              </div>
              <Btn onClick={() => onCobrar(a)} className="mt-3 w-full sm:ml-12 sm:w-auto">
                Enviar lembrete
              </Btn>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
