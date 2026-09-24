/* Chamada com atleta bloqueado.

   O banco já recusa a presença de quem está devendo (bloqueio.test.js);
   o que se prova aqui é que a tela antecipa a recusa em vez de deixar o
   professor marcar 20 atletas e descobrir no fim — e que o cadeado
   aparece para quem deve, não para quem está em dia. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../ui.jsx';

vi.mock('../lib/supabase.js', () => ({
  configurado: true,
  supabase: { auth: {} },
  mensagemDeErro: (e) => e?.message ?? String(e),
}));

vi.mock('../api/chamada.js', () => ({
  abrir: vi.fn(),
  salvar: vi.fn(),
  liberar: vi.fn(),
  desfazerLiberacao: vi.fn(),
  liberacoesDoAluno: vi.fn(),
}));

vi.mock('../api/agenda.js', () => ({
  periodo: vi.fn(async () => []),
  daTurma: vi.fn(async () => []),
}));

vi.mock('../api/auth.js', () => ({ criarEscolinha: vi.fn() }));
vi.mock('../api/escolinha.js', () => ({ painelResumo: vi.fn(async () => ({})) }));

const sessaoFalsa = vi.hoisted(() => ({
  carregando: false,
  sessao: { user: { id: 'u1' } },
  perfil: { nome: 'Professor' },
  escolinhas: [{ id: 'e1', nome: 'Craque' }],
  escolinha: { id: 'e1', nome: 'Craque' },
  escolinhaId: 'e1',
  gestor: false,
  trocarEscolinha: vi.fn(),
  recarregar: vi.fn(),
  sair: vi.fn(),
}));

vi.mock('../estado/Sessao.jsx', () => ({
  useSessao: () => sessaoFalsa,
  ProvedorSessao: ({ children }) => children,
}));

import Chamada from '../views/Chamada.jsx';
import * as apiChamada from '../api/chamada.js';

const TREINO = {
  id: 't1', escolinha_id: 'e1', turma_id: 'turma1', turma_nome: 'Sub-11',
  data: '2026-09-23', hora: '18:00', local: 'Campo do Bosque', status: 'agendado',
  elenco: 2, marcados: 0, presentes: 0,
};

const atleta = (id, nome, extra = {}) => ({
  id, nome, numero: 9, posicao: 'Atacante', frequencia: 80, foto_path: null,
  em_atraso: false, bloqueado: false, liberacao: null, ...extra,
});

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/chamada/t1']}>
        <ToastProvider>
          <Routes>
            <Route path="/chamada/:treinoId" element={<Chamada />} />
            <Route path="*" element={<Chamada />} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/* Acha a linha do atleta pelo nome e devolve o botão Presente dela. */
const botaoPresente = (nome) => {
  const linha = screen.getByText(nome).closest('li');
  return within(linha).getByRole('button', { name: new RegExp(`Presente: ${nome}`) });
};

const responder = (modo, elenco) =>
  apiChamada.abrir.mockResolvedValue({
    treino: TREINO, modoBloqueio: modo, elenco, marcas: {}, motivos: {},
  });

describe('chamada com atleta bloqueado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessaoFalsa.gestor = false;
    /* A tela guarda rascunho da marcação por treino, e todo teste aqui
       usa o mesmo t1: sem limpar, o que um marcou reaparece no próximo
       e o clique seguinte desmarca em vez de marcar. */
    localStorage.clear();
  });

  it('sem bloqueio, marca presente normalmente', async () => {
    responder('avisar', [atleta('a1', 'Enzo Prado')]);
    montar();

    await screen.findByText('Enzo Prado');
    await userEvent.click(botaoPresente('Enzo Prado'));

    expect(botaoPresente('Enzo Prado')).toHaveAttribute('aria-pressed', 'true');
  });

  it('atleta bloqueado mostra o cadeado e não aceita presença', async () => {
    responder('impedir', [atleta('a1', 'Davi Devedor', { em_atraso: true, bloqueado: true })]);
    montar();

    await screen.findByText('Davi Devedor');
    expect(screen.getByText('Bloqueado')).toBeInTheDocument();

    const botao = botaoPresente('Davi Devedor');
    expect(botao).toHaveAccessibleName(/bloqueado por mensalidade em atraso/i);

    await userEvent.click(botao);
    expect(botaoPresente('Davi Devedor')).toHaveAttribute('aria-pressed', 'false');
  });

  it('bloqueado ainda pode receber falta — senão a chamada trava', async () => {
    responder('impedir', [atleta('a1', 'Davi Devedor', { em_atraso: true, bloqueado: true })]);
    montar();

    await screen.findByText('Davi Devedor');
    const linha = screen.getByText('Davi Devedor').closest('li');
    await userEvent.click(within(linha).getByRole('button', { name: /^Falta: Davi Devedor/ }));

    expect(within(linha).getByRole('button', { name: /^Falta: Davi Devedor/ }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('"todos presentes" deixa o bloqueado de fora', async () => {
    responder('impedir', [
      atleta('a1', 'Davi Devedor', { em_atraso: true, bloqueado: true }),
      atleta('a2', 'Enzo Prado'),
    ]);
    montar();

    await screen.findByText('Enzo Prado');
    await userEvent.click(screen.getByRole('button', { name: /todos presentes/i }));

    expect(botaoPresente('Enzo Prado')).toHaveAttribute('aria-pressed', 'true');
    expect(botaoPresente('Davi Devedor')).toHaveAttribute('aria-pressed', 'false');
  });

  it('ao professor, o aviso diz que só o gestor libera', async () => {
    responder('liberar_com_motivo', [
      atleta('a1', 'Davi Devedor', { em_atraso: true, bloqueado: true }),
    ]);
    montar();

    await screen.findByText('Davi Devedor');
    expect(screen.getByRole('alert')).toHaveTextContent(/só o gestor pode liberar/i);

    await userEvent.click(botaoPresente('Davi Devedor'));
    expect(screen.queryByText(/Liberar Davi\?/)).not.toBeInTheDocument();
  });

  it('ao gestor, marcar presente abre a liberação e exige o motivo', async () => {
    sessaoFalsa.gestor = true;
    responder('liberar_com_motivo', [
      atleta('a1', 'Davi Devedor', { em_atraso: true, bloqueado: true }),
    ]);
    apiChamada.liberar.mockResolvedValue('lib1');
    montar();

    await screen.findByText('Davi Devedor');
    await userEvent.click(botaoPresente('Davi Devedor'));

    await screen.findByText('Liberar Davi?');

    // sem motivo, não vai
    await userEvent.click(screen.getByRole('button', { name: /liberar e marcar presente/i }));
    expect(apiChamada.liberar).not.toHaveBeenCalled();

    await userEvent.type(screen.getByRole('textbox'), 'Pai disse que paga na sexta');
    await userEvent.click(screen.getByRole('button', { name: /liberar e marcar presente/i }));

    await waitFor(() =>
      expect(apiChamada.liberar).toHaveBeenCalledWith('t1', 'a1', 'Pai disse que paga na sexta')
    );
    await waitFor(() =>
      expect(botaoPresente('Davi Devedor')).toHaveAttribute('aria-pressed', 'true')
    );
  });

  it('já liberado, o motivo aparece e a presença passa direto', async () => {
    responder('liberar_com_motivo', [
      atleta('a1', 'Davi Devedor', {
        em_atraso: true,
        bloqueado: true,
        liberacao: { motivo: 'Pai paga na sexta', criado_em: '2026-09-23T18:00:00Z' },
      }),
    ]);
    montar();

    await screen.findByText('Davi Devedor');
    expect(screen.getByText('Liberado')).toBeInTheDocument();
    // o motivo fica fora da Tag: nela, whitespace-nowrap estouraria o celular
    expect(screen.getByText('Pai paga na sexta')).toBeInTheDocument();

    await userEvent.click(botaoPresente('Davi Devedor'));
    expect(botaoPresente('Davi Devedor')).toHaveAttribute('aria-pressed', 'true');
  });
});
