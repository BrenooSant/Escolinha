import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

  const carregarContexto = useCallback(async () => {
    const [p, lista] = await Promise.all([apiAuth.meuPerfil(), minhasEscolinhas()]);
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
      trocarEscolinha,
      recarregar: carregarContexto,
      sair: () => apiAuth.sair(),
    }),
    [carregando, sessao, perfil, escolinhas, escolinha, escolinhaId, trocarEscolinha, carregarContexto]
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
