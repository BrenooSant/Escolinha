import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alerta, Btn, Carregando, Field, Input, Select, Textarea } from '../ui.jsx';
import { escolinhaPorCodigo } from '../api/matriculas.js';
import { registrarInteresse } from '../api/leads.js';
import { mascaraTelefone } from '../lib/format.js';
import { Moldura } from './Matricula.jsx';

/* "Quero uma aula experimental": o formulário curto da bio do Instagram.
   Três campos e pronto — quem quer conhecer não preenche ficha. Vira um
   lead no funil do gestor, para retornar no mesmo dia. */
export default function Interesse() {
  const { codigo } = useParams();
  const [escolinha, setEscolinha] = useState(undefined);
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    escolinhaPorCodigo(codigo)
      .then((e) => vivo && setEscolinha(e ?? null))
      .catch(() => vivo && setEscolinha(null));
    return () => { vivo = false; };
  }, [codigo]);

  const enviar = async (e) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const f = new FormData(e.currentTarget);
    try {
      await registrarInteresse(codigo, {
        aluno_nome: f.get('aluno_nome'),
        nascimento: f.get('nascimento') || null,
        resp_nome: f.get('resp_nome'),
        telefone,
        turma_id: f.get('turma_id') || null,
        observacoes: f.get('observacoes'),
      });
      setPronto(true);
      window.scrollTo(0, 0);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (escolinha === undefined) {
    return <div className="grid min-h-dvh place-items-center"><Carregando texto="Abrindo…" /></div>;
  }

  if (escolinha === null) {
    return (
      <Moldura titulo="Link indisponível" rotulo="Aula experimental">
        <div className="p-6 text-center">
          <span className="mb-3 block text-3xl" aria-hidden="true">🔒</span>
          <b className="block text-[15px]">Este link não está valendo</b>
          <p className="mx-auto mt-2 max-w-[38ch] text-[13px] text-ink3">
            Fale com a escolinha pelo WhatsApp ou pelo Instagram.
          </p>
        </div>
      </Moldura>
    );
  }

  if (pronto) {
    return (
      <Moldura titulo={escolinha.nome} rotulo="Aula experimental">
        <div className="p-6 text-center">
          <span className="mb-3 block text-3xl" aria-hidden="true">⚽</span>
          <b className="block text-lg">Pedido recebido!</b>
          <p className="mx-auto mt-2 max-w-[40ch] text-[13px] text-ink3">
            A {escolinha.nome} vai chamar você no WhatsApp para combinar o dia da aula experimental.
          </p>
        </div>
      </Moldura>
    );
  }

  return (
    <Moldura titulo={escolinha.nome} sub={escolinha.cidade} rotulo="Aula experimental">
      <form onSubmit={enviar} className="grid grid-cols-1 gap-3.5 p-5 sm:grid-cols-2">
        <p className="col-span-full text-[13px] text-ink3">
          Quer conhecer a escolinha? Deixe o contato e a gente chama você para marcar uma aula
          experimental.
        </p>
        <Field label="Nome da criança" className="sm:col-span-2">
          <Input name="aluno_nome" required minLength={2} maxLength={80} placeholder="Gabriel" />
        </Field>
        <Field label="Data de nascimento (opcional)">
          <Input name="nascimento" type="date" max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Turma de interesse (opcional)">
          <Select name="turma_id" defaultValue="">
            <option value="">Não sei ainda</option>
            {escolinha.turmas.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </Select>
        </Field>
        <Field label="Seu nome">
          <Input name="resp_nome" maxLength={80} placeholder="Cristiane" />
        </Field>
        <Field label="WhatsApp com DDD">
          <Input
            name="telefone"
            required
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            placeholder="(62) 99000-0000"
          />
        </Field>
        <Field label="Melhor dia ou horário (opcional)" className="sm:col-span-2">
          <Textarea name="observacoes" maxLength={500} className="min-h-16" placeholder="Só depois das 17h, sábado de manhã…" />
        </Field>
        <div className="col-span-full"><Alerta>{erro}</Alerta></div>
        <Btn type="submit" carregando={enviando} className="col-span-full w-full">Quero uma aula experimental</Btn>
      </form>
    </Moldura>
  );
}
