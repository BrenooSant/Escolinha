import { useState } from 'react';
import { Btn, Confirmar, Tag, useToast } from '../ui.jsx';
import { useAcao } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import { trocarCodigoMatricula, salvarEscolinha } from '../api/escolinha.js';

/* Monta o endereço público a partir da URL em que o app está rodando —
   funciona igual em localhost, no GitHub Pages ou em domínio próprio. */
export function urlMatricula(codigo) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/matricula/${codigo}`;
}

export default function LinkMatricula({ compacto = false }) {
  const toast = useToast();
  const { escolinha, recarregar } = useSessao();
  const [confirmar, setConfirmar] = useState(false);

  const trocar = useAcao(() => trocarCodigoMatricula(escolinha.id), {
    sucesso: async () => {
      await recarregar();
      setConfirmar(false);
      toast('Código trocado — o link antigo parou de funcionar');
    },
  });

  const alternar = useAcao(
    () => salvarEscolinha(escolinha.id, { matriculas_abertas: !escolinha.matriculas_abertas }),
    {
      sucesso: async () => {
        await recarregar();
        toast(escolinha.matriculas_abertas ? 'Matrículas encerradas' : 'Matrículas reabertas');
      },
    }
  );

  if (!escolinha) return null;
  const url = urlMatricula(escolinha.codigo_matricula);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado — é só colar no grupo dos pais');
    } catch {
      toast('Não deu para copiar. Selecione o link e copie na mão.');
    }
  };

  const compartilhar = async () => {
    if (!navigator.share) return copiar();
    try {
      await navigator.share({
        title: `Matrícula · ${escolinha.nome}`,
        text: `Preencha a ficha de matrícula da ${escolinha.nome}:`,
        url,
      });
    } catch {
      /* o responsável cancelou o compartilhamento */
    }
  };

  return (
    <>
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <b className="text-[13px] font-semibold">Link de matrícula</b>
          <Tag tom={escolinha.matriculas_abertas ? 'ok' : 'bad'}>
            {escolinha.matriculas_abertas ? 'aberto' : 'encerrado'}
          </Tag>
        </div>
        <p className="mb-3 text-[12.5px] text-ink3">
          Este endereço é só da {escolinha.nome}. Quem abrir preenche a ficha do filho e ela cai
          aqui para você aprovar — ninguém enxerga os dados da escolinha.
        </p>

        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface2 px-3 py-2.5">
          <code className="min-w-0 flex-1 truncate text-[12px] text-ink2">{url}</code>
          <b className="tnum shrink-0 font-display text-sm tracking-widest text-accent">
            {escolinha.codigo_matricula}
          </b>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
          <Btn onClick={compartilhar}>Compartilhar</Btn>
          <Btn variante="ghost" onClick={copiar}>Copiar link</Btn>
          {!compacto && (
            <>
              <Btn variante="ghost" onClick={() => window.open(url, '_blank')}>Ver como o pai vê</Btn>
              <Btn variante="ghost" onClick={() => alternar.mutate()} carregando={alternar.isPending}>
                {escolinha.matriculas_abertas ? 'Encerrar matrículas' : 'Reabrir matrículas'}
              </Btn>
              <Btn variante="perigo" onClick={() => setConfirmar(true)}>Trocar código</Btn>
            </>
          )}
        </div>
      </div>

      <Confirmar
        aberto={confirmar}
        titulo="Trocar o código do link?"
        texto="O link atual para de funcionar na hora. Use isso se ele acabou caindo em lugar errado — depois é só compartilhar o novo."
        rotulo="Trocar código"
        carregando={trocar.isPending}
        onConfirmar={() => trocar.mutate()}
        onFechar={() => setConfirmar(false)}
      />
    </>
  );
}
