import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alerta, Btn, Esqueleto, Panel, Sheet, SheetFoot, Tag, Textarea, useToast } from '../ui.jsx';
import { useAcao, useAlunos } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiContrato from '../api/contrato.js';
import { salvarEscolinha } from '../api/escolinha.js';
import { CAMPOS_CONTRATO, MODELO_PADRAO } from '../lib/contrato.js';
import { dataBR } from '../lib/format.js';

/* Contrato de matrícula. Salvar cria versão nova — quem já aceitou fica
   com o texto que leu. Ligar o aceite faz o link de matrícula e o portal
   do responsável pedirem a assinatura. */
export default function ContratoAjustes() {
  const toast = useToast();
  const { escolinha, escolinhaId, recarregar } = useSessao();
  const vigente = useQuery({
    queryKey: ['contrato', escolinhaId],
    queryFn: () => apiContrato.vigente(escolinhaId),
    enabled: Boolean(escolinhaId),
  });
  const alunos = useAlunos();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState(null);
  const [previa, setPrevia] = useState(null);

  useEffect(() => {
    if (vigente.isSuccess) setTexto(vigente.data?.texto ?? MODELO_PADRAO);
  }, [vigente.isSuccess, vigente.data]);

  const publicar = useAcao((t) => apiContrato.publicar(escolinhaId, t), {
    sucesso: (m) => { vigente.refetch(); toast(`Versão ${m.versao} salva — vale para os próximos aceites`); },
  });
  const alternar = useAcao((exige) => salvarEscolinha(escolinhaId, { exige_contrato: exige }), {
    sucesso: async (_, exige) => {
      await recarregar();
      toast(exige ? 'O aceite do contrato passou a ser pedido' : 'O contrato deixou de ser pedido');
    },
  });
  const verPrevia = useAcao((t) => apiContrato.previa(escolinhaId, t), { sucesso: setPrevia });

  const situacao = useMemo(() => {
    const lista = alunos.data ?? [];
    const assinados = lista.filter((a) => a.contrato_assinado).length;
    return { assinados, pendentes: lista.length - assinados };
  }, [alunos.data]);

  if (vigente.isPending) return <Panel titulo="Contrato de matrícula"><Esqueleto linhas={3} /></Panel>;

  const mudou = texto.trim() !== (vigente.data?.texto ?? '').trim();
  const salvar = () => {
    setErro(null);
    if (texto.trim().length < 50) return setErro('O contrato precisa ter pelo menos algumas linhas.');
    publicar.mutate(texto.trim(), { onError: (e) => setErro(e.message) });
  };

  return (
    <>
      <Panel
        titulo="Contrato de matrícula"
        extra={
          vigente.data ? (
            <Tag tom={escolinha?.exige_contrato ? 'ok' : 'neutro'}>
              {escolinha?.exige_contrato ? 'pedindo aceite' : 'desligado'}
            </Tag>
          ) : null
        }
        corpo
      >
        <p className="mb-3 text-xs text-ink3">
          O responsável lê e aceita pelo link de matrícula (quem está entrando) ou pelo link dele (quem
          já é aluno). Fica guardado o texto exato que ele leu, com nome, CPF, IP, data e hora.
          {!vigente.data && (
            <b className="mt-1 block text-ink2">
              O texto abaixo é um modelo de exemplo — revise com quem assessora a escolinha antes de usar.
            </b>
          )}
        </p>

        {vigente.data && escolinha?.exige_contrato && (
          <p className="mb-3 flex flex-wrap gap-2 text-xs">
            <Tag tom="ok">{situacao.assinados} assinaram</Tag>
            {situacao.pendentes > 0 && <Tag tom="warn">{situacao.pendentes} pendentes</Tag>}
            <span className="text-ink3">— os pendentes assinam pelo link do responsável, na ficha do atleta.</span>
          </p>
        )}

        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="min-h-72 font-mono text-[12px] leading-relaxed"
          aria-label="Texto do contrato"
        />
        <details className="mt-2 text-xs text-ink3">
          <summary className="cursor-pointer font-semibold text-ink2">Campos que se preenchem sozinhos</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {CAMPOS_CONTRATO.map(([campo, o]) => (
              <li key={campo}><code className="text-accentink">{campo}</code> — {o}</li>
            ))}
          </ul>
        </details>

        {vigente.data && (
          <p className="mt-3 text-xs text-ink3">
            Em uso: versão {vigente.data.versao}, de {dataBR(vigente.data.criado_em)}.
          </p>
        )}
        <div className="mt-3"><Alerta>{erro}</Alerta></div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Btn variante="ghost" onClick={() => verPrevia.mutate(texto)} carregando={verPrevia.isPending}>
            Ver preenchido
          </Btn>
          <Btn onClick={salvar} disabled={!mudou} carregando={publicar.isPending}>
            {vigente.data ? 'Salvar nova versão' : 'Salvar contrato'}
          </Btn>
          {vigente.data && (
            <Btn
              variante={escolinha?.exige_contrato ? 'ghost' : 'cheio'}
              onClick={() => alternar.mutate(!escolinha?.exige_contrato)}
              carregando={alternar.isPending}
            >
              {escolinha?.exige_contrato ? 'Parar de pedir aceite' : 'Pedir aceite'}
            </Btn>
          )}
        </div>
      </Panel>

      <Sheet aberto={Boolean(previa)} onFechar={() => setPrevia(null)} rotulo="Contrato preenchido">
        <header className="px-5 pt-5">
          <h3 className="text-lg">Como o responsável vai ler</h3>
          <p className="mt-1 text-[13px] text-ink3">Com dados de exemplo no lugar dos campos.</p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed whitespace-pre-wrap">
          {previa}
        </div>
        <SheetFoot>
          <Btn variante="ghost" onClick={() => setPrevia(null)}>Fechar</Btn>
        </SheetFoot>
      </Sheet>
    </>
  );
}
