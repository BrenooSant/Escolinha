/* O portão da nota fiscal.

   Quem não pode emitir não vê um botão morto: vê a frase que diz o que
   falta. É a diferença entre a seção explicar e virar mistério. */
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../ui.jsx';

vi.mock('../lib/supabase.js', () => ({
  configurado: true,
  supabase: { auth: {} },
  mensagemDeErro: (e) => e?.message ?? String(e),
}));

vi.mock('../api/fiscal.js', () => ({
  situacao: vi.fn(),
  config: vi.fn(async () => ({})),
  opcoes: vi.fn(async () => ({})),
  salvar: vi.fn(),
  emitir: vi.fn(),
  notas: vi.fn(async () => []),
}));

const sessaoFalsa = vi.hoisted(() => ({
  carregando: false,
  sessao: { user: { id: 'u1' } },
  escolinha: { id: 'e1', nome: 'Craque' },
  escolinhaId: 'e1',
  gestor: true,
  recarregar: vi.fn(),
}));

vi.mock('../estado/Sessao.jsx', () => ({
  useSessao: () => sessaoFalsa,
  ProvedorSessao: ({ children }) => children,
}));

import NotaFiscal from '../views/NotaFiscal.jsx';
import * as apiFiscal from '../api/fiscal.js';

const comSituacao = (s) =>
  apiFiscal.situacao.mockResolvedValue({
    tem_cnpj: false, tem_asaas: false, configurado: false,
    ativo: false, automatico: false, emitidas: 0, ultimo_erro: null,
    ...s,
  });

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <ToastProvider>
        <NotaFiscal />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe('seção de nota fiscal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem CNPJ, diz o que falta em vez de sumir', async () => {
    comSituacao({ tem_cnpj: false });
    montar();

    expect(await screen.findByText(/exige/i)).toHaveTextContent(/CNPJ/);
    expect(screen.getByText('indisponível')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /configurar/i })).not.toBeInTheDocument();
  });

  it('com CNPJ mas sem conta Asaas, aponta para a conexão', async () => {
    comSituacao({ tem_cnpj: true, tem_asaas: false });
    montar();

    expect(await screen.findByText(/conta Asaas/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /configurar/i })).not.toBeInTheDocument();
  });

  it('com os dois, oferece configurar', async () => {
    comSituacao({ tem_cnpj: true, tem_asaas: true });
    montar();

    expect(await screen.findByRole('button', { name: /configurar emissão/i })).toBeInTheDocument();
    expect(screen.getByText('a configurar')).toBeInTheDocument();
  });

  it('ligada, mostra quantas já saíram e deixa rever', async () => {
    comSituacao({ tem_cnpj: true, tem_asaas: true, configurado: true, ativo: true, emitidas: 7 });
    montar();

    expect(await screen.findByText('ligada')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rever configuração/i })).toBeInTheDocument();
  });

  it('erro da prefeitura aparece para o gestor', async () => {
    comSituacao({
      tem_cnpj: true, tem_asaas: true, configurado: true, ativo: true,
      ultimo_erro: 'Certificado digital vencido',
    });
    montar();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Certificado digital vencido/);
  });
});
