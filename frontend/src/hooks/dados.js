/* Hooks de dados — react-query cuidando de cache, carregamento e
   revalidação. A convenção da chave é ['assunto', escolinhaId, ...],
   assim `invalidar(escolinha)` limpa tudo de uma escolinha só. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiEscolinha from '../api/escolinha.js';
import * as apiTurmas from '../api/turmas.js';
import * as apiAlunos from '../api/alunos.js';
import * as apiAgenda from '../api/agenda.js';
import * as apiChamada from '../api/chamada.js';
import * as apiFinanceiro from '../api/financeiro.js';
import * as apiMatriculas from '../api/matriculas.js';

const ativo = (id) => ({ enabled: Boolean(id) });

export function usePainel() {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['painel', escolinhaId],
    queryFn: () => apiEscolinha.painelResumo(escolinhaId),
    ...ativo(escolinhaId),
  });
}

export function useTurmas() {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['turmas', escolinhaId],
    queryFn: () => apiTurmas.listar(escolinhaId),
    ...ativo(escolinhaId),
  });
}

export function useAlunos({ ativos = true } = {}) {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['alunos', escolinhaId, ativos],
    queryFn: () => apiAlunos.listar(escolinhaId, { ativos }),
    ...ativo(escolinhaId),
  });
}

export function useHistoricoAluno(alunoId) {
  return useQuery({
    queryKey: ['historico', alunoId],
    queryFn: () => apiAlunos.historico(alunoId),
    ...ativo(alunoId),
  });
}

export function useAgenda(de, ate) {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['agenda', escolinhaId, de, ate],
    queryFn: () => apiAgenda.periodo(escolinhaId, de, ate),
    ...ativo(escolinhaId && de && ate),
  });
}

export function useTreinosDaTurma(turmaId, ate) {
  return useQuery({
    queryKey: ['treinos-turma', turmaId, ate],
    queryFn: () => apiAgenda.daTurma(turmaId, { ate, limite: 12 }),
    ...ativo(turmaId),
  });
}

export function useChamada(treinoId) {
  return useQuery({
    queryKey: ['chamada', treinoId],
    queryFn: () => apiChamada.abrir(treinoId),
    ...ativo(treinoId),
  });
}

export function useMensalidades(competencia) {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['mensalidades', escolinhaId, competencia],
    queryFn: () => apiFinanceiro.mensalidades(escolinhaId, { competencia }),
    ...ativo(escolinhaId && competencia),
  });
}

export function useAtrasos() {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['atrasos', escolinhaId],
    queryFn: () => apiFinanceiro.emAtraso(escolinhaId),
    ...ativo(escolinhaId),
  });
}

export function useLancamentos(de, ate) {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['lancamentos', escolinhaId, de, ate],
    queryFn: () => apiFinanceiro.lancamentos(escolinhaId, { de, ate }),
    ...ativo(escolinhaId),
  });
}

export function usePreMatriculas() {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['pre-matriculas', escolinhaId],
    queryFn: () => apiMatriculas.pendentes(escolinhaId),
    ...ativo(escolinhaId),
  });
}

export function useEquipe() {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['equipe', escolinhaId],
    queryFn: () => apiEscolinha.equipe(escolinhaId),
    ...ativo(escolinhaId),
  });
}

/* Uma escrita quase sempre mexe em mais de uma tela (matricular altera
   alunos, painel e financeiro), então o padrão é invalidar tudo da
   escolinha e deixar o react-query rebuscar só o que está montado. */
export function useAcao(fn, { sucesso } = {}) {
  const cliente = useQueryClient();
  const { escolinhaId } = useSessao();

  return useMutation({
    mutationFn: fn,
    onSuccess: (dados, variaveis) => {
      cliente.invalidateQueries({
        predicate: (q) => q.queryKey.includes(escolinhaId) || q.queryKey[0] === 'chamada'
          || q.queryKey[0] === 'historico' || q.queryKey[0] === 'treinos-turma',
      });
      sucesso?.(dados, variaveis);
    },
  });
}
