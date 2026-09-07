import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alerta, Btn, Carregando, useToast } from '../ui.jsx';
import { useSessao } from '../estado/Sessao.jsx';
import * as apiEquipe from '../api/equipe.js';
import Login, { Crest } from './Login.jsx';

/* Convite para entrar na equipe técnica de uma escolinha. Quem abre já
   precisa ter conta — o convite só liga a conta à escolinha. */
export default function Convite() {
  const { token } = useParams();
  const navegar = useNavigate();
  const toast = useToast();
  const { sessao, carregando, recarregar, trocarEscolinha } = useSessao();
  const [convite, setConvite] = useState(undefined);
  const [erro, setErro] = useState(null);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    if (!sessao) return;
    apiEquipe.lerConvite(token).then((c) => setConvite(c ?? null)).catch(() => setConvite(null));
  }, [token, sessao]);

  if (carregando) return <Moldura><Carregando /></Moldura>;

  /* Sem sessão, mostra o próprio login aqui na rota do convite: assim que
     a conta entra, este componente rerenderiza já com o convite na mão —
     sem perder o link no meio do caminho. */
  if (!sessao) {
    return (
      <>
        <div className="bg-accentsoft px-5 py-3 text-center text-[13px] font-semibold text-accentink">
          Entre ou crie sua conta para aceitar o convite da escolinha.
        </div>
        <Login />
      </>
    );
  }

  if (convite === undefined) return <Moldura><Carregando texto="Conferindo o convite…" /></Moldura>;

  if (convite === null) {
    return (
      <Moldura>
        <span className="block text-3xl" aria-hidden="true">🔒</span>
        <h1 className="mt-3 text-2xl">Convite não encontrado</h1>
        <p className="mt-2 text-[13px] text-ink3">
          O endereço pode ter sido digitado errado, ou a coordenação cancelou o convite.
        </p>
        <Btn variante="ghost" className="mt-5 w-full" onClick={() => navegar('/')}>Voltar</Btn>
      </Moldura>
    );
  }

  const bloqueio = convite.ja_e_membro
    ? 'Você já faz parte desta escolinha.'
    : convite.aceito
    ? 'Este convite já foi usado.'
    : convite.expirado
    ? 'Este convite expirou. Peça um novo à coordenação.'
    : null;

  const aceitar = async () => {
    setErro(null);
    setEntrando(true);
    try {
      const id = await apiEquipe.aceitarConvite(token);
      await recarregar();
      trocarEscolinha(id);
      toast(`Bem-vindo à ${convite.escolinha}!`);
      navegar('/');
    } catch (e) {
      setErro(e.message);
      setEntrando(false);
    }
  };

  return (
    <Moldura>
      <span className="block text-3xl" aria-hidden="true">🤝</span>
      <h1 className="mt-3 text-2xl">{convite.escolinha}</h1>
      <p className="mt-2 text-[13px] text-ink3">
        Você foi convidado para entrar como{' '}
        <b>{convite.papel === 'dono' ? 'coordenação' : 'professor'}</b>
        {convite.cidade ? ` · ${convite.cidade}` : ''}. Aceitando, você passa a ver os atletas,
        fazer chamada e acompanhar o financeiro desta escolinha.
      </p>

      {bloqueio ? (
        <>
          <div className="mt-4"><Alerta tom="warn">{bloqueio}</Alerta></div>
          <Btn className="mt-4 w-full" onClick={() => navegar('/')}>Ir para o painel</Btn>
        </>
      ) : (
        <>
          <div className="mt-4"><Alerta>{erro}</Alerta></div>
          <Btn className="mt-4 w-full" onClick={aceitar} carregando={entrando}>
            Aceitar convite
          </Btn>
          <button
            onClick={() => navegar('/')}
            className="mt-3 block w-full text-center text-xs font-semibold text-ink3 hover:text-accent"
          >
            Agora não
          </button>
        </>
      )}
    </Moldura>
  );
}

function Moldura({ children }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-ground p-5">
      <div className="w-full max-w-[400px]">
        <Crest tom="escuro" className="mb-6 justify-center text-[15px] text-ink" />
        <div className="rounded-xl border border-line bg-surface p-6">{children}</div>
      </div>
    </div>
  );
}
