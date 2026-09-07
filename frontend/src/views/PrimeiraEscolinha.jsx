import { useState } from 'react';
import { Alerta, Btn, Field, Input, useToast } from '../ui.jsx';
import { criarEscolinha } from '../api/auth.js';
import { minhasEscolinhas } from '../api/escolinha.js';
import { useSessao } from '../estado/Sessao.jsx';
import { Crest } from './Login.jsx';

/* Quem se cadastrou com confirmação de e-mail ligada chega ao primeiro
   login sem escolinha nenhuma. Só aparece quando a lista está vazia. */
export default function PrimeiraEscolinha() {
  const toast = useToast();
  const { recarregar, sair, escolinhas } = useSessao();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const f = new FormData(e.currentTarget);
    try {
      /* Esta tela só aparece com a lista vazia. Se aqui já houver uma, a
         lista estava velha — criar outra deixaria o professor com duas
         escolinhas iguais, e sem entender de onde saiu a segunda. */
      const existentes = await minhasEscolinhas();
      if (existentes.length > 0) {
        await recarregar();
        toast('Sua escolinha já estava criada.');
        return;
      }

      await criarEscolinha({ nome: f.get('nome').trim(), cidade: f.get('cidade').trim() });
      await recarregar();
      toast('Escolinha criada — as turmas iniciais já estão lá.');
    } catch (err) {
      setErro(err.message);
      setEnviando(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-ground p-5">
      <div className="w-full max-w-[400px]">
        <Crest tom="escuro" className="mb-6 justify-center text-[15px] text-ink" />
        <div className="rounded-xl border border-line bg-surface p-6">
          <h1 className="text-2xl">Crie a sua escolinha</h1>
          <p className="mt-1.5 mb-5 text-[13px] text-ink3">
            Ela já nasce com as turmas Sub-9, Sub-11, Sub-13 e Sub-15 — dá para renomear e mudar
            os valores depois, em Ajustes.
          </p>

          <form onSubmit={enviar} className="space-y-3.5">
            <Field label="Nome da escolinha">
              <Input name="nome" required minLength={2} placeholder="Craque do Amanhã" autoFocus />
            </Field>
            <Field label="Cidade">
              <Input name="cidade" placeholder="Goiânia, GO" />
            </Field>
            <Alerta>{erro}</Alerta>
            <Btn type="submit" className="w-full" carregando={enviando}>Criar escolinha</Btn>
          </form>
        </div>

        <button onClick={sair} className="mt-4 block w-full text-center text-xs font-semibold text-ink3 hover:text-accent">
          {escolinhas.length ? 'Voltar' : 'Sair da conta'}
        </button>
      </div>
    </div>
  );
}
