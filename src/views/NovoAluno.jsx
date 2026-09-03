import { useMemo, useState } from 'react';
import { Btn, Field, Input, Select, Sheet, SheetFoot, Textarea, useToast } from '../ui.jsx';
import { CATEGORIAS, MENS, PARENTESCOS, POSICOES, primeiroNome } from '../data.js';

function Secao({ children }) {
  return (
    <div className="col-span-full mt-2 flex items-center gap-3 first:mt-0">
      <span className="text-[11px] font-semibold tracking-[0.14em] whitespace-nowrap text-ink3 uppercase">
        {children}
      </span>
      <hr className="flex-1 border-line" />
    </div>
  );
}

export default function NovoAluno({ aberto, onFechar, onMatricular, alunos }) {
  const toast = useToast();

  const sugerido = useMemo(() => {
    const usados = new Set(alunos.map((a) => a.num));
    let n = 2;
    while (usados.has(n)) n++;
    return n;
  }, [alunos]);

  const [form, setForm] = useState({});
  const [erros, setErros] = useState({});

  const limpar = () => {
    setForm({});
    setErros({});
    onFechar();
  };
  const campo = (k, padrao = '') => form[k] ?? padrao;
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErros((x) => ({ ...x, [k]: null }));
  };

  const cat = campo('cat', 'Sub-11');

  const enviar = (e) => {
    e.preventDefault();
    const nome = campo('nome').trim();
    const resp = campo('resp').trim();
    const novosErros = {};
    if (nome.length < 3) novosErros.nome = 'Informe o nome do atleta.';
    if (resp.length < 3) novosErros.resp = 'Informe quem responde pelo atleta.';
    if (Object.keys(novosErros).length) {
      setErros(novosErros);
      return;
    }
    const nasc = campo('nasc', '2015-03-12');
    onMatricular({
      n: nome,
      num: parseInt(campo('num', String(sugerido)), 10) || sugerido,
      cat,
      pos: campo('pos', 'Meia'),
      resp,
      par: campo('par', 'Mãe'),
      tel: campo('tel').trim() || '(62) 90000-0000',
      st: 'vence',
      dias: 0,
      freq: '0/12',
      nasc: nasc ? nasc.split('-').reverse().join('/') : '—',
      h: '',
      obs: campo('obs').trim() || '—',
    });
    limpar();
    toast(`${primeiroNome(nome)} matriculado no ${cat} — já entra na próxima chamada`);
  };

  return (
    <Sheet aberto={aberto} onFechar={limpar} largura="max-w-2xl" rotulo="Matricular atleta">
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg sm:text-xl">Matricular atleta</h3>
        <p className="mt-1 text-[13px] text-ink3">A ficha entra na turma e na chamada do próximo treino.</p>
      </header>

      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:px-5">
          <Secao>Atleta</Secao>
          <Field label="Nome completo" erro={erros.nome} className="sm:col-span-2">
            <Input value={campo('nome')} onChange={set('nome')} erro={erros.nome} placeholder="Gabriel Souza Antunes" />
          </Field>
          <Field label="Data de nascimento">
            <Input type="date" value={campo('nasc', '2015-03-12')} onChange={set('nasc')} />
          </Field>
          <Field label="Categoria">
            <Select value={cat} onChange={set('cat')}>
              {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Posição">
            <Select value={campo('pos', 'Meia')} onChange={set('pos')}>
              {POSICOES.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Número da camisa" dica={`Livres: ${sugerido}, ${sugerido + 1}, ${sugerido + 2}`}>
            <Input type="number" min="1" max="99" value={campo('num', String(sugerido))} onChange={set('num')} />
          </Field>

          <Secao>Responsável</Secao>
          <Field label="Nome do responsável" erro={erros.resp}>
            <Input value={campo('resp')} onChange={set('resp')} erro={erros.resp} placeholder="Cristiane Antunes" />
          </Field>
          <Field label="Parentesco">
            <Select value={campo('par', 'Mãe')} onChange={set('par')}>
              {PARENTESCOS.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="WhatsApp" dica="É por aqui que sai o lembrete de mensalidade.">
            <Input value={campo('tel')} onChange={set('tel')} inputMode="tel" placeholder="(62) 99000-0000" />
          </Field>
          <Field label="E-mail (opcional)">
            <Input type="email" value={campo('mail')} onChange={set('mail')} placeholder="cristiane@email.com" />
          </Field>

          <Secao>Mensalidade</Secao>
          <Field label="Valor da categoria">
            <Input value={`R$ ${MENS[cat]},00`} disabled />
          </Field>
          <Field label="Vence todo dia">
            <Select value={campo('venc', '05')} onChange={set('venc')}>
              {['05', '10', '15', '20'].map((d) => <option key={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Observações de saúde" className="sm:col-span-2">
            <Textarea
              value={campo('obs')}
              onChange={set('obs')}
              className="min-h-16"
              placeholder="Alergias, uso de medicação, restrições — o que o professor precisa saber em campo."
            />
          </Field>
          <label className="col-span-full flex items-start gap-2.5 text-xs leading-snug text-ink2">
            <input type="checkbox" defaultChecked className="mt-0.5 size-4 shrink-0 accent-accent" />
            <span>O responsável autoriza o uso de imagem do atleta em fotos e vídeos da escolinha.</span>
          </label>
        </div>

        <SheetFoot>
          <Btn type="button" variante="ghost" onClick={limpar}>Cancelar</Btn>
          <Btn type="submit">Matricular atleta</Btn>
        </SheetFoot>
      </form>
    </Sheet>
  );
}
