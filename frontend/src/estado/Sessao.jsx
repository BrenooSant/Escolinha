import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { configurado } from '../lib/supabase.js';
import * as apiAuth from '../api/auth.js';
import { minhasEscolinhas } from '../api/escolinha.js';

const Ctx = createContext(null);
export const useSessao = () => useContext(Ctx);

const CHAVE_ESCOLINHA = 'escolinha:ativa';

export function ProvedorSessao({ children }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [escolinhas, setEscolinhas] = useState([]);
  const [escolinhaId, setEscolinhaId] = useState(() => localStorage.getItem(CHAVE_ESCOLINHA));

  /* Duas cargas podem correr ao mesmo tempo. No cadastro é o que acontece
     sempre: o signUp dispara o onAuthStateChange, que começa a ler as
     escolinhas ANTES de `criar_escolinha` rodar e enxerga lista vazia; o
     Login pede outra carga logo depois, já com a escolinha criada. Sem
     ordenar as respostas, a primeira pode chegar por último e sobrescrever
     a segunda — e o professor cai em "crie a sua escolinha" com a
     escolinha dele já existindo no banco. */
  const carga = useRef(0);

  const carregarContexto = useCallback(async () => {
    const minha = ++carga.current;
    const [p, lista] = await Promise.all([apiAuth.meuPerfil(), minhasEscolinhas()]);
    if (minha !== carga.current) return; // chegou atrasada: já há resposta mais nova

    setPerfil(p);
    setEscolinhas(lista);

    // se a escolinha guardada sumiu (saiu da equipe, por exemplo), cai na primeira
    setEscolinhaId((atual) => {
      const valida = lista.some((e) => e.id === atual);
      const proxima = valida ? atual : (lista[0]?.id ?? null);
      if (proxima) localStorage.setItem(CHAVE_ESCOLINHA, proxima);
      else localStorage.removeItem(CHAVE_ESCOLINHA);
      return proxima;
    });
  }, []);

  useEffect(() => {
    if (!configurado) {
      setCarregando(false);
      return;
    }

    let vivo = true;

    apiAuth.sessaoAtual().then(async (s) => {
      if (!vivo) return;
      setSessao(s);
      if (s) await carregarContexto().catch(() => {});
      if (vivo) setCarregando(false);
    });

    return apiAuth.aoMudarSessao(async (s) => {
      if (!vivo) return;
      setSessao(s);
      if (s) {
        await carregarContexto().catch(() => {});
      } else {
        setPerfil(null);
        setEscolinhas([]);
        setEscolinhaId(null);
        localStorage.removeItem(CHAVE_ESCOLINHA);
      }
      if (vivo) setCarregando(false);
    });
  }, [carregarContexto]);

  const trocarEscolinha = useCallback((id) => {
    localStorage.setItem(CHAVE_ESCOLINHA, id);
    setEscolinhaId(id);
  }, []);

  const escolinha = useMemo(
    () => escolinhas.find((e) => e.id === escolinhaId) ?? null,
    [escolinhas, escolinhaId]
  );

  const valor = useMemo(
    () => ({
      carregando,
      sessao,
      perfil,
      escolinhas,
      escolinha,
      escolinhaId,
      /* Gestor é o papel `dono` do banco. O professor fica só com agenda,
         chamada e avaliações — a RLS barra o resto de qualquer jeito;
         aqui é para não mostrar tela que só daria erro ou zero. */
      gestor: escolinha?.papel === 'dono',
      trocarEscolinha,
      recarregar: carregarContexto,
      sair: () => apiAuth.sair(),
    }),
    [carregando, sessao, perfil, escolinhas, escolinha, escolinhaId, trocarEscolinha, carregarContexto]
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
