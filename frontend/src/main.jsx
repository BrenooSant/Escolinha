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

/* HashRouter: o site é publicado no GitHub Pages, que não sabe
   reescrever rotas para o index.html. */
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
