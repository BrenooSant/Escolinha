import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.jsx';
import { ProvedorSessao } from './estado/Sessao.jsx';
import { ToastProvider } from './ui.jsx';

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      // o professor abre e fecha o app o tempo todo no celular; meio
      // minuto de cache evita recarregar tudo a cada troca de aba
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/* HashRouter. A Netlify sabe reescrever rotas, então dava para trocar por
   BrowserRouter e ter URL limpa — mas o link de matrícula que os pais já
   receberam é `#/matricula/CODIGO`, e trocar agora quebraria todos eles. */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <HashRouter>
        <ProvedorSessao>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ProvedorSessao>
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>
);
