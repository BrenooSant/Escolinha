/* Tela de Mensagens.

   A fila vem pronta do banco; o que esta tela faz é revisar e mandar.
   O que se prova aqui é o pedaço que só existe no navegador: trocar o
   {{link}} pelo endereço do portal, abrir o WhatsApp com o texto certo
   e registrar o envio uma vez só. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../ui.jsx';

vi.mock('../lib/supabase.js', () => ({
  configurado: true,
  supabase: { auth: {} },
  mensagemDeErro: (e) => e?.message ?? String(e),
}));

vi.mock('../api/mensagens.js', () => ({
  fila: vi.fn(async () => []),
  modelos: vi.fn(async () => []),
  salvarModelo: vi.fn(),
  montarAgora: vi.fn(async () => 0),
  marcarEnviada: vi.fn(async () => 'ok'),
  dispensar: vi.fn(async () => ({ id: 'x' })),
  salvarTexto: vi.fn(async () => ({ id: 'x' })),
}));

vi.mock('../api/auth.js', () => ({ criarEscolinha: vi.fn() }));
vi.mock('../api/escolinha.js', () => ({ painelResumo: vi.fn(async () => ({})) }));

const sessaoFalsa = vi.hoisted(() => ({
  carregando: false,
  sessao: { user: { id: 'u1' } },
  perfil: { nome: 'Gestor' },
  escolinhas: [{ id: 'e1', nome: 'Craque' }],
  escolinha: { id: 'e1', nome: 'Craque' },
  escolinhaId: 'e1',
  gestor: true,
  trocarEscolinha: vi.fn(),
  recarregar: vi.fn(),
  sair: vi.fn(),
}));

vi.mock('../estado/Sessao.jsx', () => ({
  useSessao: () => sessaoFalsa,
  ProvedorSessao: ({ children }) => children,
}));

import Mensagens from '../views/Mensagens.jsx';
import * as apiMensagens from '../api/mensagens.js';

const MENSAGEM = {
  id: 'f1',
  escolinha_id: 'e1',
  tipo: 'lembrete_atrasado',
  status: 'pendente',
  aluno_nome: 'Davi Menezes',
  responsavel_nome: 'Carla Menezes',
  responsavel_token: 'tok123',
  telefone: '(62) 98888-1234',
  vencimento: '2026-09-10',
  texto: 'Olá, Carla!\n\nVeja e pague por aqui: {{link}}\n\nObrigado!',
  enviada_em: null,
};

const comFila = (pendentes = [], enviadas = []) =>
  apiMensagens.fila.mockImplementation(async (_id, { status }) =>
    status === 'enviada' ? enviadas : pendentes
  );

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/mensagens']}>
        <ToastProvider>
          <Mensagens />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('tela de mensagens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    comFila();
    apiMensagens.modelos.mockResolvedValue([]);
    window.open = vi.fn();
  });

  it('fila vazia convida a ligar os modelos', async () => {
    montar();
    expect(await screen.findByText('Fila vazia')).toBeInTheDocument();
  });

  it('"montar a fila" usa a escolinha da sessão', async () => {
    montar();
    await screen.findByText('Fila vazia');
    await userEvent.click(screen.getByRole('button', { name: /montar a fila de hoje/i }));

    await waitFor(() => expect(apiMensagens.montarAgora).toHaveBeenCalledWith('e1'));
  });

  it('lista quem está esperando, com o tipo da mensagem', async () => {
    comFila([MENSAGEM]);
    montar();

    await screen.findByText('Davi Menezes');
    expect(screen.getByText('Mensalidade atrasada')).toBeInTheDocument();
    expect(screen.getByText(/Carla Menezes/)).toBeInTheDocument();
  });

  it('ao abrir, o {{link}} já virou o endereço do portal', async () => {
    comFila([MENSAGEM]);
    montar();

    await userEvent.click(await screen.findByText('Davi Menezes'));

    const caixa = await screen.findByRole('textbox');
    expect(caixa.value).toContain('#/portal/tok123');
    expect(caixa.value).not.toContain('{{link}}');
  });

  it('enviar abre o WhatsApp e registra uma vez', async () => {
    comFila([MENSAGEM]);
    montar();

    await userEvent.click(await screen.findByText('Davi Menezes'));
    await userEvent.click(await screen.findByRole('button', { name: /abrir no whatsapp/i }));

    await waitFor(() => expect(apiMensagens.marcarEnviada).toHaveBeenCalledWith('f1'));
    expect(window.open).toHaveBeenCalledTimes(1);

    const [url] = window.open.mock.calls[0];
    expect(url).toContain('wa.me/5562988881234');
    expect(decodeURIComponent(url)).toContain('#/portal/tok123');

    // não mexeram no texto: não há por que regravar
    expect(apiMensagens.salvarTexto).not.toHaveBeenCalled();
  });

  it('texto ajustado é gravado antes de marcar como enviada', async () => {
    comFila([MENSAGEM]);
    montar();

    await userEvent.click(await screen.findByText('Davi Menezes'));
    await userEvent.type(await screen.findByRole('textbox'), ' Abraço!');
    await userEvent.click(screen.getByRole('button', { name: /abrir no whatsapp/i }));

    await waitFor(() => expect(apiMensagens.salvarTexto).toHaveBeenCalled());
    const [, texto] = apiMensagens.salvarTexto.mock.calls[0];
    expect(texto).toContain('Abraço!');
  });

  it('sem WhatsApp cadastrado, avisa em vez de abrir nada', async () => {
    comFila([{ ...MENSAGEM, telefone: null }]);
    montar();

    await userEvent.click(await screen.findByText('Davi Menezes'));
    await userEvent.click(await screen.findByRole('button', { name: /abrir no whatsapp/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/não tem WhatsApp/i);
    expect(window.open).not.toHaveBeenCalled();
    expect(apiMensagens.marcarEnviada).not.toHaveBeenCalled();
  });

  it('a aba de modelos mostra os campos que se preenchem sozinhos', async () => {
    apiMensagens.modelos.mockResolvedValue([
      { escolinha_id: 'e1', tipo: 'aniversario', ativo: false, dias: 0, texto: 'Parabéns, {{aluno}}!' },
    ]);
    montar();

    await userEvent.click(screen.getByRole('button', { name: 'Modelos' }));

    expect(await screen.findByText('Aniversário')).toBeInTheDocument();
    expect(screen.getByText('desligado')).toBeInTheDocument();
    expect(screen.getByText(/\{\{responsavel\}\}/)).toBeInTheDocument();
  });
});
