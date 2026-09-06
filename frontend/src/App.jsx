import { Navigate, Route, Routes } from 'react-router-dom';
import { configurado } from './lib/supabase.js';
import { useSessao } from './estado/Sessao.jsx';
import Shell from './Shell.jsx';
import { Carregando } from './ui.jsx';

import Login from './views/Login.jsx';
import PrimeiraEscolinha from './views/PrimeiraEscolinha.jsx';
import Matricula from './views/Matricula.jsx';
import Painel from './views/Painel.jsx';
import Agenda from './views/Agenda.jsx';
import Alunos from './views/Alunos.jsx';
import Chamada from './views/Chamada.jsx';
import Financeiro from './views/Financeiro.jsx';
import Cobrancas from './views/Cobrancas.jsx';
import PreMatriculas from './views/PreMatriculas.jsx';
import Ajustes from './views/Ajustes.jsx';
import SemConfiguracao from './views/SemConfiguracao.jsx';

export default function App() {
  const { carregando, sessao, escolinhas, escolinhaId } = useSessao();

  if (!configurado) return <SemConfiguracao />;

  return (
    <Routes>
      {/* pública: o link que o responsável recebe */}
      <Route path="/matricula/:codigo" element={<Matricula />} />

      <Route path="*" element={
        carregando ? (
          <div className="grid min-h-dvh place-items-center">
            <Carregando texto="Abrindo a escolinha…" />
          </div>
        ) : !sessao ? (
          <Login />
        ) : escolinhas.length === 0 || !escolinhaId ? (
          <PrimeiraEscolinha />
        ) : (
          <Shell>
            <Routes>
              <Route path="/" element={<Painel />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/alunos" element={<Alunos />} />
              <Route path="/alunos/:alunoId" element={<Alunos />} />
              <Route path="/chamada" element={<Chamada />} />
              <Route path="/chamada/:treinoId" element={<Chamada />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/cobrancas" element={<Cobrancas />} />
              <Route path="/matriculas" element={<PreMatriculas />} />
              <Route path="/ajustes" element={<Ajustes />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Shell>
        )
      } />
    </Routes>
  );
}
