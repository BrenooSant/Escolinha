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
import * as apiAvaliacoes from '../api/avaliacoes.js';
import * as apiEquipe from '../api/equipe.js';
import * as apiCobranca from '../api/cobranca.js';
import * as apiLeads from '../api/leads.js';
import * as apiAsaas from '../api/asaas.js';
import * as apiMensagens from '../api/mensagens.js';

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

/* Fila e modelos de mensagem. A chave leva a escolinha, então o
   invalidar de useAcao já alcança as duas sem lista especial. */
export function useFilaMensagens(status = 'pendente') {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['fila-mensagens', escolinhaId, status],
    queryFn: () => apiMensagens.fila(escolinhaId, { status }),
    ...ativo(escolinhaId),
  });
}

export function useModelosMensagem() {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['modelos-mensagem', escolinhaId],
    queryFn: () => apiMensagens.modelos(escolinhaId),
    ...ativo(escolinhaId),
  });
}

/* Treinos em que o gestor liberou o atleta bloqueado. Fica na ficha,
   que é onde o gestor revisa depois com calma. */
export function useLiberacoesAluno(alunoId) {
  return useQuery({
    queryKey: ['liberacoes', alunoId],
    queryFn: () => apiChamada.liberacoesDoAluno(alunoId),
    ...ativo(alunoId)
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
    queryFn: () => apiEquipe.membros(escolinhaId),
    ...ativo(escolinhaId),
  });
}

export function useConvites() {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['convites', escolinhaId],
    queryFn: () => apiEquipe.convites(escolinhaId),
    ...ativo(escolinhaId),
  });
}

export function useQuesitos() {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['quesitos', escolinhaId],
    queryFn: () => apiAvaliacoes.quesitos(escolinhaId),
    ...ativo(escolinhaId),
  });
}

export function useAvaliacoes(alunoId) {
  return useQuery({
    queryKey: ['avaliacoes', alunoId],
    queryFn: () => apiAvaliacoes.doAluno(alunoId),
    ...ativo(alunoId),
  });
}

export function useMensalidadesDoAluno(alunoId) {
  return useQuery({
    queryKey: ['mensalidades-aluno', alunoId],
    queryFn: () => apiFinanceiro.doAluno(alunoId),
    ...ativo(alunoId),
  });
}

export function useResponsavel(responsavelId) {
  return useQuery({
    queryKey: ['responsavel', responsavelId],
    queryFn: () => apiAlunos.responsavel(responsavelId),
    ...ativo(responsavelId),
  });
}

export function useAvisados() {
  const { escolinhaId } = useSessao();
  return useQuery({
    queryKey: ['avisados', escolinhaId],
    queryFn: () => apiFinanceiro.avisados(escolinhaId),
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
        predicate: (q) =>
          q.queryKey.includes(escolinhaId) ||
          ['chamada', 'historico', 'treinos-turma', 'avaliacoes', 'mensalidades-aluno',
            'responsavel', 'leads-notas', 'contrato-aceite', 'liberacoes'].includes(
            q.queryKey[0]
          ),
      });
      sucesso?.(dados, variaveis);
    },
  });
}

/* Regras de cobrança e planos: só o gestor pede, então só roda para ele. */
export function useConexaoAsaas() {
  const { escolinhaId, gestor } = useSessao();
  return useQuery({
    queryKey: ['asaas', escolinhaId],
    queryFn: () => apiAsaas.conexao(escolinhaId),
    ...ativo(escolinhaId && gestor),
  });
}

export function useLeads() {
  const { escolinhaId, gestor } = useSessao();
  return useQuery({
    queryKey: ['leads', escolinhaId],
    queryFn: () => apiLeads.listar(escolinhaId),
    ...ativo(escolinhaId && gestor),
  });
}

export function useNotasLead(leadId) {
  return useQuery({
    queryKey: ['leads-notas', leadId],
    queryFn: () => apiLeads.notas(leadId),
    ...ativo(leadId),
  });
}

export function useContas() {
  const { escolinhaId, gestor } = useSessao();
  return useQuery({
    queryKey: ['contas', escolinhaId],
    queryFn: () => apiFinanceiro.contas(escolinhaId),
    ...ativo(escolinhaId && gestor),
  });
}

export function useConfigCobranca() {
  const { escolinhaId, gestor } = useSessao();
  return useQuery({
    queryKey: ['config-cobranca', escolinhaId],
    queryFn: () => apiCobranca.config(escolinhaId),
    ...ativo(escolinhaId && gestor),
  });
}

export function usePlanos() {
  const { escolinhaId, gestor } = useSessao();
  return useQuery({
    queryKey: ['planos', escolinhaId],
    queryFn: () => apiCobranca.planos(escolinhaId),
    ...ativo(escolinhaId && gestor),
  });
}
