import { useEffect, useMemo, useState } from 'react';
import { Alerta, Btn, Field, Input, Select, Sheet, SheetFoot, Textarea, useToast } from '../ui.jsx';
import { useAcao, useTurmas } from '../hooks/dados.js';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiAlunos from '../api/alunos.js';
import { POSICOES, PARENTESCOS } from '../lib/constantes.js';
import { brl, deCentavos, mascaraTelefone, paraCentavos, primeiroNome } from '../lib/format.js';

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

const vazio = {
  nome: '', nascimento: '', turma_id: '', posicao: 'Meia', numero: '',
  mensalidade: '', dia_vencimento: '', observacoes: '', autoriza_imagem: true,
  resp_nome: '', resp_parentesco: 'Mãe', resp_telefone: '', resp_email: '',
};

/* Serve para matricular e para editar: quando recebe `aluno`, entra em
   modo edição e o botão vira "Salvar". */
export default function FormAluno({ aberto, aluno, onFechar }) {
  const toast = useToast();
  const { escolinhaId, escolinha } = useSessao();
  const turmas = useTurmas();
  const [form, setForm] = useState(vazio);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState(null);
  const [sugerido, setSugerido] = useState(null);

  const editando = Boolean(aluno);

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setErroGeral(null);

    if (aluno) {
      setForm({
        nome: aluno.nome ?? '',
        nascimento: aluno.nascimento ?? '',
        turma_id: aluno.turma_id ?? '',
        posicao: aluno.posicao ?? 'Meia',
        numero: aluno.numero ?? '',
        mensalidade: '',
        dia_vencimento: aluno.dia_vencimento ?? '',
        observacoes: aluno.observacoes ?? '',
        autoriza_imagem: aluno.autoriza_imagem ?? true,
        resp_nome: aluno.responsavel_nome ?? '',
        resp_parentesco: aluno.responsavel_parentesco ?? 'Mãe',
        resp_telefone: aluno.responsavel_telefone ?? '',
        resp_email: aluno.responsavel_email ?? '',
      });
    } else {
      setForm(vazio);
      apiAlunos.proximoNumero(escolinhaId).then(setSugerido).catch(() => setSugerido(null));
    }
  }, [aberto, aluno, escolinhaId]);

  const turma = useMemo(
    () => turmas.data?.find((t) => t.id === form.turma_id),
    [turmas.data, form.turma_id]
  );

  const salvar = useAcao(
    async (dados) =>
      editando
        ? apiAlunos.salvar(escolinhaId, aluno.id, dados)
        : apiAlunos.matricular(escolinhaId, dados),
    {
      sucesso: () => {
        toast(
          editando
            ? 'Ficha de ' + primeiroNome(form.nome) + ' atualizada'
            : primeiroNome(form.nome) + ' matriculado — já entra na próxima chamada'
        );
        onFechar();
      },
    }
  );

  const set = (campo) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [campo]: campo === 'resp_telefone' ? mascaraTelefone(valor) : valor }));
    setErros((x) => ({ ...x, [campo]: null }));
  };

  const enviar = (e) => {
    e.preventDefault();
    setErroGeral(null);

    const novos = {};
    if (form.nome.trim().length < 3) novos.nome = 'Informe o nome do atleta.';
    if (form.resp_nome.trim().length < 3) novos.resp_nome = 'Informe quem responde pelo atleta.';
    if (form.resp_telefone.replace(/\D/g, '').length < 10) novos.resp_telefone = 'Telefone com DDD.';
    if (Object.keys(novos).length) return setErros(novos);

    salvar.mutate(
      {
        nome: form.nome.trim(),
        nascimento: form.nascimento || null,
        turma_id: form.turma_id || null,
        posicao: form.posicao || null,
        numero: form.numero ? Number(form.numero) : null,
        mensalidade_centavos: form.mensalidade ? paraCentavos(form.mensalidade) : null,
        dia_vencimento: form.dia_vencimento ? Number(form.dia_vencimento) : null,
        observacoes: form.observacoes.trim() || null,
        autoriza_imagem: form.autoriza_imagem,
        responsavel: {
          id: editando ? aluno.responsavel_id : undefined,
          nome: form.resp_nome.trim(),
          parentesco: form.resp_parentesco,
          telefone: form.resp_telefone,
          email: form.resp_email.trim() || null,
        },
      },
      { onError: (err) => setErroGeral(err.message) }
    );
  };

  return (
    <Sheet
      aberto={aberto}
      onFechar={onFechar}
      largura="max-w-2xl"
      rotulo={editando ? `Editar ${aluno?.nome}` : 'Matricular atleta'}
    >
      <header className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h3 className="text-lg sm:text-xl">{editando ? 'Editar ficha' : 'Matricular atleta'}</h3>
        <p className="mt-1 text-[13px] text-ink3">
          {editando
            ? 'As mudanças valem já na próxima chamada e no financeiro.'
            : 'A ficha entra na turma e na chamada do próximo treino.'}
        </p>
      </header>

      <form onSubmit={enviar} className="flex min-h-0 flex-1 flex-col">
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:px-5">
          <Secao>Atleta</Secao>
          <Field label="Nome completo" erro={erros.nome} className="sm:col-span-2">
            <Input value={form.nome} onChange={set('nome')} erro={erros.nome} placeholder="Gabriel Souza Antunes" />
          </Field>
          <Field label="Data de nascimento">
            <Input type="date" value={form.nascimento} onChange={set('nascimento')} max={new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="Turma">
            <Select value={form.turma_id} onChange={set('turma_id')}>
              <option value="">Sem turma</option>
              {(turmas.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}{t.vagas <= 0 && !editando ? ' (sem vagas)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Posição">
            <Select value={form.posicao} onChange={set('posicao')}>
              {POSICOES.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field
            label="Número da camisa"
            dica={!editando && sugerido ? `Livre agora: ${sugerido}` : null}
          >
            <Input
              type="number"
              min="1"
              max="99"
              value={form.numero}
              onChange={set('numero')}
              placeholder={sugerido ? String(sugerido) : '10'}
            />
          </Field>

          <Secao>Responsável</Secao>
          <Field label="Nome do responsável" erro={erros.resp_nome}>
            <Input value={form.resp_nome} onChange={set('resp_nome')} erro={erros.resp_nome} placeholder="Cristiane Antunes" />
          </Field>
          <Field label="Parentesco">
            <Select value={form.resp_parentesco} onChange={set('resp_parentesco')}>
              {PARENTESCOS.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field
            label="WhatsApp"
            erro={erros.resp_telefone}
            dica="É por aqui que sai o lembrete de mensalidade."
          >
            <Input
              value={form.resp_telefone}
              onChange={set('resp_telefone')}
              erro={erros.resp_telefone}
              inputMode="tel"
              placeholder="(62) 99000-0000"
            />
          </Field>
          <Field label="E-mail (opcional)">
            <Input type="email" value={form.resp_email} onChange={set('resp_email')} placeholder="cristiane@email.com" />
          </Field>

          <Secao>Mensalidade</Secao>
          <Field
            label="Valor"
            dica={turma ? `Padrão do ${turma.nome}: ${brl(turma.mensalidade_centavos)}` : 'Escolha uma turma para herdar o valor.'}
          >
            <Input
              value={form.mensalidade}
              onChange={set('mensalidade')}
              inputMode="decimal"
              placeholder={turma ? deCentavos(turma.mensalidade_centavos) : '130,00'}
            />
          </Field>
          <Field label="Vence todo dia" dica={`Padrão da escolinha: ${escolinha?.dia_vencimento ?? 5}`}>
            <Select value={form.dia_vencimento} onChange={set('dia_vencimento')}>
              <option value="">Usar o padrão</option>
              {[5, 10, 15, 20, 25].map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>

          <Field label="Observações de saúde" className="sm:col-span-2">
            <Textarea
              value={form.observacoes}
              onChange={set('observacoes')}
              className="min-h-16"
              placeholder="Alergias, uso de medicação, restrições — o que o professor precisa saber em campo."
            />
          </Field>

          <label className="col-span-full flex items-start gap-2.5 text-xs leading-snug text-ink2">
            <input
              type="checkbox"
              checked={form.autoriza_imagem}
              onChange={set('autoriza_imagem')}
              className="mt-0.5 size-4 shrink-0 accent-accent"
            />
            <span>O responsável autoriza o uso de imagem do atleta em fotos e vídeos da escolinha.</span>
          </label>

          <div className="col-span-full">
            <Alerta>{erroGeral}</Alerta>
          </div>
        </div>

        <SheetFoot>
          <Btn type="button" variante="ghost" onClick={onFechar}>Cancelar</Btn>
          <Btn type="submit" carregando={salvar.isPending}>
            {editando ? 'Salvar ficha' : 'Matricular atleta'}
          </Btn>
        </SheetFoot>
      </form>
    </Sheet>
  );
}
