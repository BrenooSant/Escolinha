import { useMemo, useState } from 'react';
import Shell from './Shell.jsx';
import { ToastProvider, useToast } from './ui.jsx';
import Login from './views/Login.jsx';
import Painel from './views/Painel.jsx';
import Agenda from './views/Agenda.jsx';
import Alunos from './views/Alunos.jsx';
import Chamada from './views/Chamada.jsx';
import Financeiro from './views/Financeiro.jsx';
import Cobrancas, { ModalCobranca } from './views/Cobrancas.jsx';
import Ficha from './views/Ficha.jsx';
import NovoAluno from './views/NovoAluno.jsx';
import { ALUNOS, MENS, UNIFORMES, pct } from './data.js';

function Painelzao() {
  const toast = useToast();
  const [logado, setLogado] = useState(false);
  const [view, setView] = useState('painel');

  const [alunos, setAlunos] = useState(ALUNOS);
  const [categoria, setCategoria] = useState('Todas');

  const [turma, setTurma] = useState('Sub-13');
  const [marcas, setMarcas] = useState(() => Object.fromEntries(ALUNOS.map((a) => [a.n, ''])));
  const [justificativas, setJustificativas] = useState({});

  const [ficha, setFicha] = useState(null);
  const [cobranca, setCobranca] = useState(null);
  const [novoAluno, setNovoAluno] = useState(false);

  /* todos os números do painel saem daqui — nada é digitado à mão */
  const resumo = useMemo(() => {
    let previsto = 0, recebido = 0, aberto = 0, atrasado = 0, pagas = 0, devedores = 0;
    alunos.forEach((a) => {
      const v = MENS[a.cat];
      previsto += v;
      if (a.st === 'pago') {
        recebido += v;
        pagas++;
      } else {
        aberto += v;
        if (a.st === 'atraso') {
          atrasado += v;
          devedores++;
        }
      }
    });
    return {
      previsto, recebido, aberto, atrasado, pagas, devedores,
      entradas: recebido + UNIFORMES,
      freqMedia: Math.round(alunos.reduce((s, a) => s + pct(a), 0) / alunos.length),
    };
  }, [alunos]);

  const irPara = (v) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  const matricular = (novo) => {
    setAlunos((l) => [novo, ...l]);
    setMarcas((m) => ({ ...m, [novo.n]: '' }));
    setCategoria(novo.cat);
    setTurma(novo.cat);
  };

  if (!logado) {
    return (
      <Login
        onEntrar={(cadastro) => {
          setLogado(true);
          setView('painel');
          if (cadastro) toast('Escolinha criada — bem-vindo!');
        }}
      />
    );
  }

  const telas = {
    painel: <Painel alunos={alunos} resumo={resumo} irPara={irPara} onNovoAluno={() => setNovoAluno(true)} />,
    agenda: <Agenda alunos={alunos} />,
    alunos: (
      <Alunos
        alunos={alunos}
        categoria={categoria}
        setCategoria={setCategoria}
        onAbrirFicha={setFicha}
        onNovoAluno={() => setNovoAluno(true)}
      />
    ),
    presenca: (
      <Chamada
        alunos={alunos}
        turma={turma}
        setTurma={setTurma}
        marcas={marcas}
        setMarcas={setMarcas}
        justificativas={justificativas}
        setJustificativas={setJustificativas}
      />
    ),
    financeiro: <Financeiro alunos={alunos} resumo={resumo} />,
    cobrancas: <Cobrancas alunos={alunos} resumo={resumo} onCobrar={setCobranca} />,
  };

  return (
    <>
      <Shell view={view} irPara={irPara} devedores={resumo.devedores} onSair={() => setLogado(false)}>
        {telas[view]}
      </Shell>

      <Ficha aluno={ficha} onFechar={() => setFicha(null)} onCobrar={() => setCobranca(ficha)} />
      {cobranca && <ModalCobranca key={cobranca.n} aluno={cobranca} onFechar={() => setCobranca(null)} />}
      <NovoAluno
        aberto={novoAluno}
        alunos={alunos}
        onFechar={() => setNovoAluno(false)}
        onMatricular={matricular}
      />
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Painelzao />
    </ToastProvider>
  );
}
