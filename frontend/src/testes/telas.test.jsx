/* Renderização das telas.
   O build só prova que o JSX compila. Estes testes montam as telas de
   verdade num DOM e conferem que elas aparecem — é o que pega import
   faltando, componente indefinido e quebra na primeira pintura. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '../ui.jsx';

vi.mock('../lib/supabase.js', () => ({
  configurado: true,
  supabase: { auth: { signInWithPassword: vi.fn(), signUp: vi.fn() } },
  mensagemDeErro: (e) => e?.message ?? String(e),
}));

vi.mock('../api/matriculas.js', () => ({
  escolinhaPorCodigo: vi.fn(),
  enviarFicha: vi.fn(),
  pendentes: vi.fn(),
  decididas: vi.fn(),
  aprovar: vi.fn(),
  recusar: vi.fn(),
}));

const sessaoFalsa = vi.hoisted(() => ({
  carregando: false,
  sessao: null,
  perfil: null,
  escolinhas: [],
  escolinha: null,
  escolinhaId: null,
  trocarEscolinha: vi.fn(),
  recarregar: vi.fn(),
  sair: vi.fn(),
}));

vi.mock('../estado/Sessao.jsx', () => ({
  useSessao: () => sessaoFalsa,
  ProvedorSessao: ({ children }) => children,
}));

vi.mock('../api/auth.js', () => ({
  cadastrar: vi.fn(),
  entrar: vi.fn(),
  criarEscolinha: vi.fn(),
  recuperarSenha: vi.fn(),
  sessaoAtual: vi.fn(),
  aoMudarSessao: vi.fn(),
  sair: vi.fn(),
  meuPerfil: vi.fn(),
  salvarPerfil: vi.fn(),
  trocarSenha: vi.fn(),
}));

vi.mock('../api/escolinha.js', () => ({
  minhasEscolinhas: vi.fn(),
  salvarEscolinha: vi.fn(),
  apagar: vi.fn(),
  trocarCodigoMatricula: vi.fn(),
  equipe: vi.fn(),
  painelResumo: vi.fn(),
}));

vi.mock('../api/contrato.js', () => ({
  previaMatricula: vi.fn(),
  previaPortal: vi.fn(),
  aceitarPortal: vi.fn(),
}));

vi.mock('../api/portal.js', () => ({
  abrir: vi.fn(),
  avisarPagamento: vi.fn(),
}));

import Login from '../views/Login.jsx';
import PrimeiraEscolinha from '../views/PrimeiraEscolinha.jsx';
import Matricula from '../views/Matricula.jsx';
import Portal from '../views/Portal.jsx';
import SemConfiguracao from '../views/SemConfiguracao.jsx';
import * as apiMatriculas from '../api/matriculas.js';
import * as apiPortal from '../api/portal.js';
import * as apiContrato from '../api/contrato.js';
import * as apiAuth from '../api/auth.js';
import * as apiEscolinha from '../api/escolinha.js';

function montar(elemento, { rota = '/' } = {}) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={[rota]}>
        <ToastProvider>
          <Routes>
            <Route path="/matricula/:codigo" element={elemento} />
            <Route path="/portal/:token" element={elemento} />
            <Route path="*" element={elemento} />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('login', () => {
  it('abre no modo entrar, com e-mail e senha', () => {
    montar(<Login />);
    expect(screen.getByRole('heading', { name: /bom treino, professor/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar no painel/i })).toBeInTheDocument();
  });

  it('a aba de cadastro pede o nome da escolinha', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    montar(<Login />);

    await user.click(screen.getByRole('tab', { name: /registre-se/i }));
    expect(screen.getByLabelText(/nome da escolinha/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /criar conta e entrar/i })).toBeInTheDocument();
  });
});

describe('tela sem configuração', () => {
  it('explica quais variáveis faltam, em vez de quebrar', () => {
    render(<SemConfiguracao />);
    expect(screen.getByText(/falta conectar o supabase/i)).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_ANON_KEY/)).toBeInTheDocument();
  });
});

describe('matrícula pública', () => {
  const escolinha = {
    id: '11111111-1111-4111-8111-111111111111',
    nome: 'Craque do Amanhã',
    cidade: 'Goiânia, GO',
    codigo: 'CRAQUE24',
    turmas: [
      { id: 't1', nome: 'Sub-11', mensalidade_centavos: 13000, vagas: 3 },
      { id: 't2', nome: 'Sub-13', mensalidade_centavos: 14000, vagas: 0 },
    ],
  };

  beforeEach(() => {
    apiMatriculas.escolinhaPorCodigo.mockResolvedValue(escolinha);
  });

  it('mostra o formulário com as turmas e as vagas', async () => {
    montar(<Matricula />, { rota: '/matricula/CRAQUE24' });

    expect(await screen.findByRole('heading', { name: 'Craque do Amanhã' })).toBeInTheDocument();
    expect(screen.getByLabelText(/nome completo do atleta/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/whatsapp com ddd/i)).toBeInTheDocument();

    const turma = screen.getByLabelText(/turma pretendida/i);
    expect(within(turma).getByText(/Sub-11 · R\$ ?130,00 · 3 vagas/)).toBeInTheDocument();
    expect(within(turma).getByText(/Sub-13 .* sem vagas/)).toBeDisabled();
  });

  it('oferece o envio da foto do atleta', async () => {
    montar(<Matricula />, { rota: '/matricula/CRAQUE24' });
    expect(await screen.findByRole('button', { name: /escolher foto do atleta/i })).toBeInTheDocument();
    expect(screen.getByText(/foto do atleta/i)).toBeInTheDocument();
  });

  it('com contrato: pede o CPF, mostra o texto e só envia depois do aceite', async () => {
    apiMatriculas.escolinhaPorCodigo.mockResolvedValue({ ...escolinha, exige_contrato: true });
    apiContrato.previaMatricula.mockResolvedValue({ versao: 1, texto: 'CONTRATO de Gabriel com a escolinha', hash: 'h1' });
    apiMatriculas.enviarFicha.mockResolvedValue({ ok: true, protocolo: 'ABC123', escolinha: 'Craque do Amanhã' });
    montar(<Matricula />, { rota: '/matricula/CRAQUE24' });

    fireEvent.change(await screen.findByLabelText(/nome completo do atleta/i), { target: { value: 'Gabriel Souza' } });
    fireEvent.change(screen.getByLabelText(/seu nome completo/i), { target: { value: 'Cristiane Souza' } });
    fireEvent.change(screen.getByLabelText(/whatsapp com ddd/i), { target: { value: '62990001122' } });
    fireEvent.change(screen.getByLabelText(/seu cpf/i), { target: { value: '529.982.247-25' } });
    fireEvent.click(screen.getByRole('button', { name: /ler o contrato e enviar/i }));

    expect(await screen.findByText('CONTRATO de Gabriel com a escolinha')).toBeInTheDocument();
    const aceitar = screen.getByRole('button', { name: /aceitar e enviar/i });
    expect(aceitar).toBeDisabled();
    expect(apiMatriculas.enviarFicha).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/li o contrato e aceito/i));
    fireEvent.click(aceitar);

    await screen.findByText(/ficha enviada/i);
    expect(apiMatriculas.enviarFicha).toHaveBeenCalledWith(
      'CRAQUE24',
      expect.objectContaining({ resp_cpf: '52998224725', contrato_aceito: true, contrato_hash: 'h1' })
    );
  });

  it('com contrato, CPF inválido nem abre o texto', async () => {
    apiMatriculas.escolinhaPorCodigo.mockResolvedValue({ ...escolinha, exige_contrato: true });
    apiContrato.previaMatricula.mockClear();
    montar(<Matricula />, { rota: '/matricula/CRAQUE24' });

    fireEvent.change(await screen.findByLabelText(/nome completo do atleta/i), { target: { value: 'Gabriel Souza' } });
    fireEvent.change(screen.getByLabelText(/seu nome completo/i), { target: { value: 'Cristiane Souza' } });
    fireEvent.change(screen.getByLabelText(/whatsapp com ddd/i), { target: { value: '62990001122' } });
    fireEvent.change(screen.getByLabelText(/seu cpf/i), { target: { value: '111.111.111-11' } });
    fireEvent.click(screen.getByRole('button', { name: /ler o contrato e enviar/i }));

    expect(await screen.findByText(/cpf válido/i)).toBeInTheDocument();
    expect(apiContrato.previaMatricula).not.toHaveBeenCalled();
  });

  it('avisa quando o link não vale mais, sem expor nada', async () => {
    apiMatriculas.escolinhaPorCodigo.mockResolvedValue(null);
    montar(<Matricula />, { rota: '/matricula/SUMIU00' });

    expect(await screen.findByText(/este link não está valendo/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nome completo do atleta/i)).not.toBeInTheDocument();
  });
});

describe('portal do responsável', () => {
  const dados = {
    responsavel: { nome: 'Vanessa Duarte', telefone: '(62) 99441-9083' },
    escolinha: { nome: 'Craque do Amanhã', cidade: 'Goiânia, GO', chave_pix: '12.345.678/0001-90' },
    filhos: [
      {
        nome: 'Helena Duarte',
        numero: 7,
        turma: 'Sub-11',
        posicao: 'Ponta',
        frequencia: 92,
        treinos: 12,
        presencas: 11,
        faltas: 1,
        justificadas: 0,
        proximos_treinos: [{ data: '2026-09-09', hora: '18:00:00', local: 'Campo do Bosque' }],
        mensalidades: [
          { id: 'm1', competencia: '2026-09-01', valor_centavos: 13000, vencimento: '2026-09-05', status: 'aberta', dias_atraso: 2, avisado_em: null },
          { id: 'm2', competencia: '2026-08-01', valor_centavos: 13000, vencimento: '2026-08-05', status: 'paga', pago_em: '2026-08-04', dias_atraso: 0 },
        ],
        avaliacao: { data: '2026-08-20', media: 4.2, notas: [{ quesito: 'Passe', nota: 4 }, { quesito: 'Marcação', nota: 5 }] },
      },
    ],
  };

  it('mostra frequência, mensalidades e as notas do filho', async () => {
    apiPortal.abrir.mockResolvedValue(dados);
    montar(<Portal />, { rota: '/portal/abc123' });

    expect(await screen.findByRole('heading', { name: 'Helena Duarte' })).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('11/12')).toBeInTheDocument();
    expect(screen.getByText(/2 dias de atraso/i)).toBeInTheDocument();
    expect(screen.getByText(/quitada/i)).toBeInTheDocument();
    expect(screen.getByText('4.2')).toBeInTheDocument();
    expect(screen.getByText('Passe')).toBeInTheDocument();
    expect(screen.getByText(/12\.345\.678\/0001-90/)).toBeInTheDocument();
  });

  it('só oferece "já paguei" na mensalidade em aberto', async () => {
    apiPortal.abrir.mockResolvedValue(dados);
    montar(<Portal />, { rota: '/portal/abc123' });

    await screen.findByRole('heading', { name: 'Helena Duarte' });
    expect(screen.getAllByRole('button', { name: /já paguei/i })).toHaveLength(1);
  });

  it('marca como aguardando quando o pai já avisou', async () => {
    apiPortal.abrir.mockResolvedValue({
      ...dados,
      filhos: [{
        ...dados.filhos[0],
        mensalidades: [{ ...dados.filhos[0].mensalidades[0], avisado_em: '2026-09-06T10:00:00Z' }],
      }],
    });
    montar(<Portal />, { rota: '/portal/abc123' });

    expect(await screen.findByText(/aguardando confirmação/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /já paguei/i })).not.toBeInTheDocument();
  });

  it('cobrança aberta oferece Pix; a paga, o recibo', async () => {
    apiPortal.abrir.mockResolvedValue(dados);
    montar(<Portal />, { rota: '/portal/abc123' });

    await screen.findByRole('heading', { name: 'Helena Duarte' });
    expect(screen.getAllByRole('button', { name: /pagar com pix/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^recibo$/i })).toHaveLength(1);
  });

  it('contrato pendente aparece para o responsável aceitar', async () => {
    apiPortal.abrir.mockResolvedValue({
      ...dados,
      filhos: [{ ...dados.filhos[0], id: 'a1', contrato: { status: 'pendente' } }],
    });
    montar(<Portal />, { rota: '/portal/abc123' });

    expect(await screen.findByText(/contrato de matrícula pendente/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ler e aceitar/i }));
    expect(await screen.findByLabelText(/seu cpf/i)).toBeInTheDocument();
  });

  it('link inválido não mostra dado nenhum', async () => {
    apiPortal.abrir.mockResolvedValue(null);
    montar(<Portal />, { rota: '/portal/sumiu' });

    expect(await screen.findByText(/este link não está valendo/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Helena Duarte')).not.toBeInTheDocument());
  });
});

/* Regressão. O signUp devolve a sessão e o onAuthStateChange dispara na
   hora, lendo a lista de escolinhas antes de criar_escolinha terminar.
   Sem recarregar aqui, o app caía em "crie a sua escolinha" e o
   professor criava uma segunda escolinha igual. */
describe('cadastro não deixa criar escolinha duas vezes', () => {
  it('recarrega a sessão e assume a escolinha recém-criada', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    apiAuth.cadastrar.mockResolvedValue({ confirmarEmail: false, escolinhaId: 'esc-1' });

    montar(<Login />);
    await user.click(screen.getByRole('tab', { name: /registre-se/i }));
    await user.type(screen.getByLabelText(/seu nome/i), 'Ricardo');
    await user.type(screen.getByLabelText(/nome da escolinha/i), 'Craque do Amanhã');
    await user.type(screen.getByLabelText(/e-mail/i), 'ricardo@exemplo.com');
    await user.type(screen.getByLabelText(/senha/i), 'segredo123');
    await user.click(screen.getByRole('button', { name: /criar conta e entrar/i }));

    await waitFor(() => expect(sessaoFalsa.recarregar).toHaveBeenCalled());
    expect(sessaoFalsa.trocarEscolinha).toHaveBeenCalledWith('esc-1');
    expect(apiAuth.cadastrar).toHaveBeenCalledWith(
      expect.objectContaining({ escolinha: 'Craque do Amanhã' })
    );
  });

  it('com a lista velha, a tela de primeira escolinha adota a que já existe', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    apiEscolinha.minhasEscolinhas.mockResolvedValue([{ id: 'esc-1', nome: 'Craque do Amanhã' }]);

    montar(<PrimeiraEscolinha />);
    await user.type(screen.getByLabelText(/nome da escolinha/i), 'Craque do Amanhã');
    await user.click(screen.getByRole('button', { name: /criar escolinha/i }));

    await waitFor(() => expect(sessaoFalsa.recarregar).toHaveBeenCalled());
    expect(apiAuth.criarEscolinha).not.toHaveBeenCalled();
  });

  it('com a lista mesmo vazia, cria normalmente', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    apiEscolinha.minhasEscolinhas.mockResolvedValue([]);

    montar(<PrimeiraEscolinha />);
    await user.type(screen.getByLabelText(/nome da escolinha/i), 'Nova Escolinha');
    await user.click(screen.getByRole('button', { name: /criar escolinha/i }));

    await waitFor(() =>
      expect(apiAuth.criarEscolinha).toHaveBeenCalledWith(
        expect.objectContaining({ nome: 'Nova Escolinha' })
      )
    );
  });
});
