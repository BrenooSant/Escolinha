import { Btn, Jersey, Sheet, SheetFoot, Tag, useToast } from '../ui.jsx';
import { MENS, STATUS, corFreq, pct, primeiroNome } from '../data.js';

const PONTO = { P: 'bg-ok', F: 'bg-bad', J: 'bg-warn' };
const NOME_MARCA = { P: 'Presente', F: 'Falta', J: 'Justificada' };

function Linha({ termo, children }) {
  return (
    <>
      <dt className="text-ink3">{termo}</dt>
      <dd className="m-0 font-medium">{children}</dd>
    </>
  );
}

export default function Ficha({ aluno, onFechar, onCobrar }) {
  const toast = useToast();
  if (!aluno) return null;

  const [tom, rotulo] = STATUS[aluno.st];
  const f = pct(aluno);

  return (
    <Sheet aberto onFechar={onFechar} largura="max-w-xl" rotulo={`Ficha de ${aluno.n}`}>
      <header className="flex items-center gap-3.5 border-b border-line px-4 py-4 sm:px-5">
        <Jersey num={aluno.num} tamanho="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg sm:text-xl">{aluno.n}</h3>
          <small className="text-[12.5px] text-ink3">
            {aluno.cat} · {aluno.pos} · camisa {aluno.num}
          </small>
        </div>
        <Tag tom={tom}>{rotulo}</Tag>
      </header>

      <div className="grid grid-cols-3 border-b border-line">
        {[
          ['Frequência', `${f}%`, corFreq(f)],
          ['Treinos no mês', aluno.freq, ''],
          ['Mensalidade', `R$ ${MENS[aluno.cat]}`, ''],
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
        <div className="mb-3 flex items-center gap-3">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-ink3 uppercase">
            Últimos 8 treinos
          </span>
          <hr className="flex-1 border-line" />
        </div>
        {aluno.h ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {aluno.h.split('').map((m, i) => (
                <span key={i} title={NOME_MARCA[m]} className={`block size-5 rounded ${PONTO[m]}`} />
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
        <dl className="grid grid-cols-[minmax(88px,auto)_1fr] gap-x-3.5 gap-y-2.5 text-[13px]">
          <Linha termo="Nascimento">{aluno.nasc}</Linha>
          <Linha termo="Responsável">
            {aluno.resp} <span className="text-ink3">({aluno.par})</span>
          </Linha>
          <Linha termo="WhatsApp">
            <span className="tnum">{aluno.tel}</span>
          </Linha>
          <Linha termo="Vencimento">
            Todo dia 05 {aluno.dias > 0 && <Tag tom="bad">{aluno.dias} dias de atraso</Tag>}
          </Linha>
          <Linha termo="Observações">{aluno.obs}</Linha>
        </dl>
      </div>

      <SheetFoot>
        <Btn variante="ghost" onClick={onFechar}>
          Fechar
        </Btn>
        <Btn variante="ghost" onClick={() => { onFechar(); toast('Abrindo conversa com ' + primeiroNome(aluno.resp)); }}>
          Chamar no WhatsApp
        </Btn>
        {aluno.st === 'atraso' ? (
          <Btn onClick={() => { onFechar(); onCobrar(); }}>Enviar cobrança</Btn>
        ) : (
          <Btn onClick={() => { onFechar(); toast('Ficha de ' + primeiroNome(aluno.n) + ' aberta para edição'); }}>
            Editar ficha
          </Btn>
        )}
      </SheetFoot>
    </Sheet>
  );
}
