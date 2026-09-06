import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alerta, Btn, Carregando, Field, Input, Select, Textarea } from '../ui.jsx';
import { escolinhaPorCodigo, enviarFicha } from '../api/matriculas.js';
import { POSICOES, PARENTESCOS } from '../lib/constantes.js';
import { brl, mascaraTelefone } from '../lib/format.js';

/* Página pública: quem abre não tem login. Todo o acesso ao banco passa
   por duas funções SECURITY DEFINER — nenhuma tabela fica exposta. */
export default function Matricula() {
  const { codigo } = useParams();
  const [escolinha, setEscolinha] = useState(undefined); // undefined = carregando, null = inválido
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [pronto, setPronto] = useState(null);
  const [telefone, setTelefone] = useState('');

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
      const r = await enviarFicha(codigo, {
        aluno_nome: f.get('aluno_nome'),
        nascimento: f.get('nascimento') || null,
        posicao: f.get('posicao'),
        turma_id: f.get('turma_id') || null,
        observacoes: f.get('observacoes'),
        autoriza_imagem: f.get('autoriza_imagem') === 'on',
        resp_nome: f.get('resp_nome'),
        resp_parentesco: f.get('resp_parentesco'),
        resp_telefone: telefone,
        resp_email: f.get('resp_email'),
      });
      setPronto(r);
      window.scrollTo(0, 0);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  if (escolinha === undefined) {
    return <div className="grid min-h-dvh place-items-center"><Carregando texto="Abrindo o formulário…" /></div>;
  }

  if (escolinha === null) {
    return (
      <Moldura titulo="Link indisponível">
        <div className="p-6 text-center">
          <span className="mb-3 block text-3xl" aria-hidden="true">🔒</span>
          <b className="block text-[15px]">Este link não está valendo</b>
          <p className="mx-auto mt-2 max-w-[38ch] text-[13px] text-ink3">
            Ou o endereço foi digitado errado, ou a escolinha encerrou as matrículas por aqui.
            Fale com a coordenação para receber o link novo.
          </p>
        </div>
      </Moldura>
    );
  }

  if (pronto) {
    return (
      <Moldura titulo={escolinha.nome}>
        <div className="p-6 text-center">
          <span className="mb-3 block text-3xl" aria-hidden="true">✅</span>
          <b className="block text-lg">Ficha enviada!</b>
          <p className="mx-auto mt-2 max-w-[40ch] text-[13px] text-ink3">
            A coordenação da {escolinha.nome} vai conferir os dados e entrar em contato pelo
            WhatsApp que você informou.
          </p>
          <div className="mx-auto mt-4 w-fit rounded-lg bg-surface2 px-4 py-2.5">
            <span className="block text-[11px] font-semibold tracking-[0.14em] text-ink3 uppercase">
              Protocolo
            </span>
            <b className="tnum font-display text-2xl">{pronto.protocolo}</b>
          </div>
          <Btn variante="ghost" className="mt-5" onClick={() => { setPronto(null); setTelefone(''); }}>
            Enviar outra ficha
          </Btn>
          <p className="mt-2 text-[11.5px] text-ink3">Tem mais de um filho? É só preencher de novo.</p>
        </div>
      </Moldura>
    );
  }

  return (
    <Moldura titulo={escolinha.nome} sub={escolinha.cidade}>
      <form onSubmit={enviar} className="grid grid-cols-1 gap-3.5 p-5 sm:grid-cols-2">
        <p className="col-span-full text-[13px] text-ink3">
          Preencha a ficha do atleta. A coordenação confere e confirma a matrícula pelo WhatsApp —
          nada é cobrado agora.
        </p>

        <Secao>Dados do atleta</Secao>
        <Field label="Nome completo do atleta" className="sm:col-span-2">
          <Input name="aluno_nome" required minLength={3} maxLength={80} placeholder="Gabriel Souza Antunes" />
        </Field>
        <Field label="Data de nascimento">
          <Input name="nascimento" type="date" max={new Date().toISOString().slice(0, 10)} />
        </Field>
        <Field label="Turma pretendida" dica="A coordenação pode ajustar conforme a idade.">
          <Select name="turma_id" defaultValue="">
            <option value="">Deixar a escolinha escolher</option>
            {escolinha.turmas.map((t) => (
              <option key={t.id} value={t.id} disabled={t.vagas <= 0}>
                {t.nome} · {brl(t.mensalidade_centavos)}
                {t.vagas <= 0 ? ' · sem vagas' : ` · ${t.vagas} vaga${t.vagas > 1 ? 's' : ''}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Posição preferida">
          <Select name="posicao" defaultValue="">
            <option value="">Ainda não sei</option>
            {POSICOES.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>

        <Secao>Responsável</Secao>
        <Field label="Seu nome completo">
          <Input name="resp_nome" required minLength={3} maxLength={80} placeholder="Cristiane Antunes" />
        </Field>
        <Field label="Parentesco">
          <Select name="resp_parentesco" defaultValue="Mãe">
            {PARENTESCOS.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="WhatsApp com DDD" dica="É por aqui que a coordenação vai responder.">
          <Input
            name="resp_telefone"
            required
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            placeholder="(62) 99000-0000"
          />
        </Field>
        <Field label="E-mail (opcional)">
          <Input name="resp_email" type="email" maxLength={120} placeholder="cristiane@email.com" />
        </Field>

        <Field label="Algo que o professor precise saber" className="sm:col-span-2">
          <Textarea
            name="observacoes"
            maxLength={500}
            className="min-h-20"
            placeholder="Alergias, uso de medicação, restrições — o que faz diferença em campo."
          />
        </Field>

        <label className="col-span-full flex items-start gap-2.5 text-xs leading-snug text-ink2">
          <input type="checkbox" name="autoriza_imagem" defaultChecked className="mt-0.5 size-4 shrink-0 accent-accent" />
          <span>Autorizo o uso de imagem do atleta em fotos e vídeos da escolinha.</span>
        </label>

        <div className="col-span-full">
          <Alerta>{erro}</Alerta>
        </div>

        <Btn type="submit" carregando={enviando} className="col-span-full w-full">
          Enviar ficha para a escolinha
        </Btn>
      </form>
    </Moldura>
  );
}

function Secao({ children }) {
  return (
    <div className="col-span-full mt-1 flex items-center gap-3 first:mt-0">
      <span className="text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap text-ink3 uppercase">
        {children}
      </span>
      <hr className="flex-1 border-line" />
    </div>
  );
}

function Moldura({ titulo, sub, children }) {
  return (
    <div className="min-h-dvh bg-ground">
      <header className="bg-accent px-5 py-7 text-[#EFF6F0] sm:py-9">
        <div className="mx-auto max-w-[640px]">
          <span className="text-[11px] font-semibold tracking-[0.18em] uppercase opacity-75">
            Matrícula
          </span>
          <h1 className="mt-1 font-display text-3xl leading-tight font-semibold">{titulo}</h1>
          {sub && <p className="mt-1 text-sm text-[#CFE3D6]">{sub}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-[640px] px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5">
        <div className="overflow-hidden rounded-xl border border-line bg-surface">{children}</div>
        <p className="mt-3 text-center text-[11.5px] text-ink3">
          Os dados vão direto para a coordenação da escolinha.
        </p>
      </main>
    </div>
  );
}
