# Escolinha Craque do Amanhã

Painel visual de uma escolinha de futebol: chamada do treino, alunos, agenda,
financeiro e cobrança dos responsáveis. É uma demonstração de interface — os
dados vivem em `src/data.js` e nada é enviado para servidor nenhum.

No ar em **https://brenoosant.github.io/Escolinha/**

## Rodando

```bash
npm install
npm run dev      # servidor de desenvolvimento
npm run build    # gera dist/
npm run preview  # serve o dist/ para conferir antes de publicar
```

## Publicação

O push na `main` dispara `.github/workflows/deploy.yml`, que builda e publica
no GitHub Pages. Não commite a pasta `dist/` — ela é gerada no CI.

## Estrutura

```
src/
  data.js          dados de demonstração e helpers (pct, brl, ...)
  ui.jsx           peças reaproveitadas: Tag, Panel, Tile, Sheet, Toast, campos
  Shell.jsx        navegação — barra lateral no desktop, abas de baixo no celular
  App.jsx          estado da aplicação e roteamento entre as telas
  views/           Login, Painel, Agenda, Alunos, Chamada, Financeiro,
                   Cobrancas, Ficha, NovoAluno
```

Os números do painel e do financeiro são calculados a partir de `alunos` em
`App.jsx` (`resumo`), então matricular alguém pela interface já reflete em
todas as telas.
