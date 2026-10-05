import { useEffect, useRef, useState } from 'react';
import {
  Alerta, Btn, Esqueleto, Field, Input, Panel, Select, Sheet, SheetFoot, Tag, useToast,
} from '../ui.jsx';
import { useAcao, useConfigFiscal, useSituacaoFiscal } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiFiscal from '../api/fiscal.js';

/* Nota fiscal de serviço.

   A escolinha decide, não a plataforma: com CNPJ e a parte municipal
   resolvida, emite; sem CNPJ, a seção explica o que falta em vez de
   sumir calada — seção que some sem dizer nada vira mistério.

   O formulário não é fixo. Cada prefeitura exige campos diferentes, e
   quem diz quais é o próprio Asaas: a tela pergunta e se monta. */
export default function NotaFiscal() {
  const situacao = useSituacaoFiscal();
  const [abrindo, setAbrindo] = useState(false);

  if (situacao.isPending) {
    return <Panel titulo="Nota fiscal"><Esqueleto linhas={2} /></Panel>;
  }

  const s = situacao.data ?? {};
  const pronta = s.tem_cnpj && s.tem_asaas;

  return (
    <>
      <Panel
        titulo="Nota fiscal"
        extra={
          s.ativo ? <Tag tom="ok">ligada</Tag>
            : pronta ? <Tag tom="warn">a configurar</Tag>
              : <Tag>indisponível</Tag>
        }
        corpo
      >
        {!s.tem_cnpj ? (
          <p className="text-[13px] text-ink2">
            Emitir nota fiscal exige <b className="font-semibold">CNPJ</b>. Cadastre o CNPJ da
            escolinha em <b className="font-semibold">A escolinha</b>, aqui em cima, e esta seção
            se abre. Com CPF não há emissão de NFS-e.
          </p>
        ) : !s.tem_asaas ? (
          <p className="text-[13px] text-ink2">
            A nota sai pela conta Asaas da escolinha. Conecte a conta em{' '}
            <b className="font-semibold">Pagamento pelo link</b> para configurar a emissão.
          </p>
        ) : (
          <>
            <p className="text-[13px] text-ink2">
              {s.ativo
                ? 'A nota sai da mensalidade já paga, pelo botão na ficha do atleta. O número, o PDF e o XML chegam quando a prefeitura autoriza.'
                : 'Falta escolher o serviço municipal e os dados que a sua prefeitura exige. O Asaas diz quais são — a tela pergunta na hora de configurar.'}
            </p>

            {s.emitidas > 0 && (
              <p className="mt-2 text-[13px] text-ink3">
                <b className="tnum font-semibold text-ink">{s.emitidas}</b>{' '}
                nota{s.emitidas > 1 ? 's' : ''} autorizada{s.emitidas > 1 ? 's' : ''} até agora.
              </p>
            )}

            {s.ultimo_erro && (
              <div className="mt-3"><Alerta tom="warn">Último erro: {s.ultimo_erro}</Alerta></div>
            )}

            <div className="mt-4">
              <Btn variante="ghost" onClick={() => setAbrindo(true)}>
                {s.configurado ? 'Rever configuração' : 'Configurar emissão'}
              </Btn>
            </div>
          </>
        )}
      </Panel>

      {abrindo && <Configurar onFechar={() => { setAbrindo(false); situacao.refetch(); }} />}
    </>
  );
}

/* ---------------------------------------------------------------
   Configuração
   Os campos que a prefeitura exige vêm do Asaas; os nossos são o
   serviço, a descrição e os códigos da reforma tributária.
   --------------------------------------------------------------- */
function Configurar({ onFechar }) {
  const toast = useToast();
  const { escolinhaId } = useSessao();
  const config = useConfigFiscal();
  const [erro, setErro] = useState(null);
  const [opcoes, setOpcoes] = useState(null);
  const [campos, setCampos] = useState({});

  const buscar = useAcao(() => apiFiscal.opcoes(escolinhaId), {
    sucesso: (r) => setOpcoes(r),
  });

  const salvar = useAcao((dados) => apiFiscal.salvar(escolinhaId, dados), {
    sucesso: () => { toast('Configuração fiscal salva'); onFechar(); },
  });

  /* Busca as opções uma vez, ao abrir. Dentro de efeito, e não no
     corpo do componente: disparar mutação durante o render é efeito
     colateral em fase de render, e com o re-render que a resposta
     provoca viraria laço. A ref garante o "uma vez" mesmo com o
     StrictMode montando duas vezes em desenvolvimento. */
  const pediu = useRef(false);
  useEffect(() => {
    if (pediu.current) return;
    pediu.current = true;
    buscar.mutate();
  }, [buscar]);

  const c = config.data ?? {};
  const valor = (nome, padrao = '') => campos[nome] ?? c[nome] ?? padrao;
  const mudar = (nome) => (e) =>
    setCampos((v) => ({ ...v, [nome]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const enviar = (e) => {
    e.preventDefault();
    setErro(null);
    const f = new FormData(e.currentTarget);

    const servico = (opcoes?.servicos ?? []).find((s) => String(s.id) === f.get('servico'));
    if (!servico && !f.get('servico_codigo')) {
      return setErro('Escolha o serviço municipal — sem ele a prefeitura recusa a nota.');
    }

    /* O que o Asaas pede varia por município: manda o que a lista
       dele disse que é necessário, e só isso. */
    const doAsaas = {};
    for (const campo of opcoes?.municipio?.requiredFields ?? []) {
      const v = f.get(`asaas_${campo.name}`);
      if (v !== null && v !== '') doAsaas[campo.name] = v;
    }

    salvar.mutate(
      {
        asaas: doAsaas,
        servico_id: servico?.id ?? null,
        servico_codigo: f.get('servico_codigo') || null,
        servico_nome: servico?.description ?? f.get('servico_codigo') ?? null,
        descricao_servico: f.get('descricao_servico').trim(),
        iss_percentual: Number(f.get('iss_percentual') || 0),
        retem_iss: f.get('retem_iss') === 'on',
        nbs_codigo: f.get('nbs_codigo') || null,
        situacao_tributaria: f.get('situacao_tributaria') || null,
        classificacao_tributaria: f.get('classificacao_tributaria') || null,
        indicador_operacao: f.get('indicador_operacao') || null,
        ativo: f.get('ativo') === 'on',
      },
      { onError: (err) => setErro(err.message) }
    );
  };

  const lista = (nome, itens, rotulo) => (
    <Field label={rotulo} key={nome}>
      <Select name={nome} defaultValue={c[nome] ?? ''}>
        <option value="">— não informar —</option>
        {(itens ?? []).map((i) => (
          <option key={i.code ?? i.id} value={i.code ?? i.id}>
            {i.code ?? i.id} · {i.description}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Sheet aberto onFechar={onFechar} largura="max-w-xl" rotulo="Configurar nota fiscal">
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg">Configurar nota fiscal</h3>
        <p className="mt-1 text-[13px] text-ink3">
          Os campos abaixo são os que a sua prefeitura exige — quem diz quais são é o Asaas.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:px-5">
        {buscar.isPending || config.isPending ? (
          <Esqueleto linhas={6} />
        ) : buscar.isError ? (
          <Alerta>{buscar.error.message}</Alerta>
        ) : (
          <form id="form-fiscal" onSubmit={enviar} className="space-y-3">
            <span className="sobre block text-[11px] font-semibold tracking-[0.14em] text-ink3 uppercase">
              O que a prefeitura exige
            </span>
            {(opcoes?.municipio?.requiredFields ?? []).map((campo) => (
              <Field
                key={campo.name}
                label={campo.name}
                dica={campo.required ? 'Obrigatório neste município' : 'Opcional'}
              >
                <Input
                  name={`asaas_${campo.name}`}
                  type={campo.name.toLowerCase().includes('password') ? 'password' : 'text'}
                  required={campo.required}
                />
              </Field>
            ))}

            <span className="sobre block pt-2 text-[11px] font-semibold tracking-[0.14em] text-ink3 uppercase">
              O serviço
            </span>
            <Field label="Serviço municipal" dica="Quando a prefeitura publica a lista.">
              <Select name="servico" defaultValue={c.servico_id ?? ''}>
                <option value="">— informar pelo código —</option>
                {(opcoes?.servicos ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.description}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="Código do serviço"
              dica="Use quando a prefeitura não publica a lista. Ex.: 1.01"
            >
              <Input name="servico_codigo" defaultValue={c.servico_codigo ?? ''} placeholder="1.01" />
            </Field>
            <Field label="Descrição que sai na nota">
              <Input
                name="descricao_servico"
                required
                defaultValue={c.descricao_servico ?? 'Mensalidade de escolinha de futebol'}
              />
            </Field>

            <span className="sobre block pt-2 text-[11px] font-semibold tracking-[0.14em] text-ink3 uppercase">
              Impostos
            </span>
            <Field label="ISS (%)">
              <Input
                name="iss_percentual" type="number" step="0.01" min="0" max="10"
                defaultValue={c.iss_percentual ?? 0}
              />
            </Field>
            <label className="flex items-center gap-2.5 text-[13px] font-semibold">
              <input
                type="checkbox" name="retem_iss" defaultChecked={c.retem_iss}
                className="size-4 accent-[var(--c-accent)]"
              />
              O tomador retém o ISS
            </label>

            <span className="sobre block pt-2 text-[11px] font-semibold tracking-[0.14em] text-ink3 uppercase">
              Reforma tributária
            </span>
            <p className="text-[12.5px] text-ink3">
              Obrigatórios para serviços em geral desde 1º de outubro de 2026, e para quem está no
              Simples Nacional a partir de 1º de janeiro de 2027. Sem eles, a prefeitura recusa a
              nota de quem já é obrigado.
            </p>
            {lista('nbs_codigo', opcoes?.nbs, 'Código NBS')}
            {lista('situacao_tributaria', opcoes?.situacoes, 'Situação tributária')}
            {lista('classificacao_tributaria', opcoes?.classificacoes, 'Classificação tributária')}
            {lista('indicador_operacao', opcoes?.indicadores, 'Indicador de operação')}

            <label className="flex items-center gap-2.5 pt-2 text-[13px] font-semibold">
              <input
                type="checkbox" name="ativo" defaultChecked={c.ativo}
                className="size-4 accent-[var(--c-accent)]"
              />
              Ligar a emissão
            </label>

            <Alerta>{erro}</Alerta>
          </form>
        )}
      </div>

      <SheetFoot>
        <Btn variante="ghost" onClick={onFechar}>Cancelar</Btn>
        <Btn type="submit" form="form-fiscal" carregando={salvar.isPending}>Salvar</Btn>
      </SheetFoot>
    </Sheet>
  );
}
