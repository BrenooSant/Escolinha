import { useEffect, useState } from 'react';
import { Alerta, Btn, Confirmar, Esqueleto, Field, Input, Panel, Select, Tag, useToast } from '../ui.jsx';
import { useAcao, useConfigCobranca, usePlanos } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiCobranca from '../api/cobranca.js';
import { deCentavos, dePercentual, paraCentavos, paraPercentual } from '../lib/format.js';

/* Cada escolinha cobra de um jeito. Tudo aqui nasce desligado: campo
   vazio é regra que não existe. As regras entram em cada cobrança no
   momento em que ela é criada — mudar agora não mexe no que já foi
   cobrado. */
export default function RegrasCobranca() {
  return (
    <>
      <Regras />
      <Planos />
    </>
  );
}

function Regras() {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const config = useConfigCobranca();
  const [form, setForm] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const c = config.data;
    if (!c) return;
    const temDesconto = Number(c.desconto_valor) > 0;
    setForm({
      desconto_tipo: temDesconto ? c.desconto_tipo : 'nenhum',
      desconto_valor: !temDesconto
        ? ''
        : c.desconto_tipo === 'fixo'
          ? deCentavos(Number(c.desconto_valor))
          : dePercentual(c.desconto_valor),
      desconto_dias: String(c.desconto_dias),
      multa: dePercentual(c.multa_percentual),
      juros: dePercentual(c.juros_mes_percentual),
      taxa: c.taxa_matricula_centavos ? deCentavos(c.taxa_matricula_centavos) : '',
      irmao: dePercentual(c.desconto_irmao_percentual),
    });
  }, [config.data]);

  const salvar = useAcao((dados) => apiCobranca.salvarConfig(escolinhaId, dados), {
    sucesso: () => toast('Regras de cobrança salvas — valem para as próximas cobranças'),
  });

  if (config.isPending || !form) {
    return <Panel titulo="Regras de cobrança"><Esqueleto linhas={4} /></Panel>;
  }

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    const semDesconto = form.desconto_tipo === 'nenhum';
    const desconto = semDesconto
      ? 0
      : form.desconto_tipo === 'fixo'
        ? paraCentavos(form.desconto_valor)
        : paraPercentual(form.desconto_valor);
    if (!semDesconto && !desconto) return setErro('Informe o valor do desconto, ou escolha "sem desconto".');
    if (form.desconto_tipo === 'percentual' && desconto > 100) return setErro('O desconto não passa de 100%.');

    salvar.mutate(
      {
        desconto_tipo: semDesconto ? 'fixo' : form.desconto_tipo,
        desconto_valor: desconto,
        desconto_dias: semDesconto ? 0 : Number(form.desconto_dias),
        multa_percentual: paraPercentual(form.multa),
        juros_mes_percentual: paraPercentual(form.juros),
        taxa_matricula_centavos: paraCentavos(form.taxa),
        desconto_irmao_percentual: paraPercentual(form.irmao),
      },
      { onError: (err) => setErro(err.message) }
    );
  };

  return (
    <Panel titulo="Regras de cobrança" corpo>
      <p className="mb-4 text-xs text-ink3">
        Campo vazio é regra desligada. As regras entram em cada cobrança quando ela é criada — mudar
        aqui não altera o que já foi cobrado.
      </p>
      <form onSubmit={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Desconto por pagar em dia">
          <Select value={form.desconto_tipo} onChange={set('desconto_tipo')}>
            <option value="nenhum">Sem desconto</option>
            <option value="fixo">Valor fixo (R$)</option>
            <option value="percentual">Percentual (%)</option>
          </Select>
        </Field>
        {form.desconto_tipo !== 'nenhum' ? (
          <>
            <Field label={form.desconto_tipo === 'fixo' ? 'Desconto (R$)' : 'Desconto (%)'}>
              <Input
                value={form.desconto_valor}
                onChange={set('desconto_valor')}
                inputMode="decimal"
                placeholder={form.desconto_tipo === 'fixo' ? '15,00' : '10'}
              />
            </Field>
            <Field label="Vale até" className="sm:col-span-2">
              <Select value={form.desconto_dias} onChange={set('desconto_dias')}>
                <option value="0">O dia do vencimento</option>
                {[3, 5, 10].map((d) => (
                  <option key={d} value={d}>{d} dias antes do vencimento</option>
                ))}
              </Select>
            </Field>
          </>
        ) : (
          <div className="hidden sm:block" />
        )}

        <Field label="Multa no atraso (%)" dica="Cobrada uma vez. O usual é 2%.">
          <Input value={form.multa} onChange={set('multa')} inputMode="decimal" placeholder="Sem multa" />
        </Field>
        <Field label="Juros ao mês (%)" dica="Proporcional aos dias de atraso. O usual é 1%.">
          <Input value={form.juros} onChange={set('juros')} inputMode="decimal" placeholder="Sem juros" />
        </Field>

        <Field label="Taxa de matrícula (R$)" dica="Cobrada uma vez quando o atleta entra. Aparece no link de matrícula.">
          <Input value={form.taxa} onChange={set('taxa')} inputMode="decimal" placeholder="Sem taxa" />
        </Field>
        <Field label="Desconto de irmão (%)" dica="Do segundo filho do mesmo responsável em diante.">
          <Input value={form.irmao} onChange={set('irmao')} inputMode="decimal" placeholder="Sem desconto" />
        </Field>

        <div className="sm:col-span-2"><Alerta>{erro}</Alerta></div>
        <div className="sm:col-span-2">
          <Btn type="submit" carregando={salvar.isPending}>Salvar regras</Btn>
        </div>
      </form>
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
const MESES = [[2, 'Bimestral'], [3, 'Trimestral'], [4, 'Quadrimestral'], [6, 'Semestral'], [12, 'Anual']];

function Planos() {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const planos = usePlanos();
  const [meses, setMeses] = useState('3');
  const [desconto, setDesconto] = useState('');
  const [erro, setErro] = useState(null);
  const [apagando, setApagando] = useState(null);

  const salvar = useAcao((dados) => apiCobranca.salvarPlano(escolinhaId, dados), {
    sucesso: (p) => toast(`Plano ${p.nome} ${p.ativo ? 'disponível' : 'desativado'}`),
  });
  const apagar = useAcao(() => apiCobranca.apagarPlano(apagando.id), {
    sucesso: () => { toast('Plano apagado'); setApagando(null); },
  });

  const criar = (e) => {
    e.preventDefault();
    setErro(null);
    const n = Number(meses);
    if (planos.data?.some((p) => p.meses === n)) return setErro('Já existe um plano com esse período.');
    salvar.mutate(
      { nome: MESES.find(([m]) => m === n)[1], meses: n, desconto_percentual: paraPercentual(desconto) },
      { onSuccess: () => setDesconto(''), onError: (err) => setErro(err.message) }
    );
  };

  return (
    <>
      <Panel titulo="Planos" extra={<Tag>{planos.data?.length ?? 0}</Tag>}>
        <p className="border-b border-line px-4 py-2.5 text-xs text-ink3">
          Sem plano, o atleta paga mês a mês. O plano cobra o período de uma vez, com o desconto dele —
          escolha na ficha de cada atleta.
        </p>

        {planos.isPending ? (
          <Esqueleto linhas={2} />
        ) : (
          <ul>
            {(planos.data ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <b className="block text-[13px] font-semibold">{p.nome}</b>
                  <small className="text-xs text-ink3">
                    {p.meses} meses por cobrança
                    {Number(p.desconto_percentual) > 0 ? ` · −${dePercentual(p.desconto_percentual)}%` : ' · sem desconto'}
                  </small>
                </div>
                {!p.ativo && <Tag>desativado</Tag>}
                <Btn
                  variante="ghost"
                  className="!min-h-9 !px-3 !text-xs"
                  onClick={() => salvar.mutate({ id: p.id, ativo: !p.ativo })}
                >
                  {p.ativo ? 'Desativar' : 'Reativar'}
                </Btn>
                <button
                  onClick={() => setApagando(p)}
                  className="px-1 text-ink3 transition hover:text-bad"
                  aria-label={`Apagar ${p.nome}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={criar} className="grid grid-cols-2 gap-2 border-t border-line p-4 sm:flex sm:flex-wrap sm:items-end">
          <Field label="Período" className="col-span-2 sm:w-52">
            <Select value={meses} onChange={(e) => setMeses(e.target.value)}>
              {MESES.map(([m, nome]) => <option key={m} value={m}>{nome} · {m} meses</option>)}
            </Select>
          </Field>
          <Field label="Desconto (%)" className="sm:w-32">
            <Input value={desconto} onChange={(e) => setDesconto(e.target.value)} inputMode="decimal" placeholder="0" />
          </Field>
          <Btn type="submit" className="self-end" carregando={salvar.isPending}>Criar plano</Btn>
          {erro && <div className="col-span-2 w-full"><Alerta>{erro}</Alerta></div>}
        </form>
      </Panel>

      <Confirmar
        aberto={Boolean(apagando)}
        titulo={`Apagar o plano ${apagando?.nome}?`}
        texto="Quem está nele volta a pagar mês a mês quando o período atual acabar. Para só parar de oferecer, use Desativar."
        rotulo="Apagar"
        carregando={apagar.isPending}
        onConfirmar={() => apagar.mutate()}
        onFechar={() => setApagando(null)}
      />
    </>
  );
}
