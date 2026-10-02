# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

Código, comentários, nomes de arquivo, tabelas, colunas e funções estão **em
português**. Siga isso em qualquer coisa nova — `salvar_chamada`, não
`saveAttendance`.

## Comandos

```bash
npm run setup           # instala frontend/ e backend/testes/
npm run dev             # Vite em http://localhost:5173
npm run build           # build do front (roda em frontend/)

npm run db:push         # aplica as migrations no projeto da nuvem
npm run db:start        # Supabase local (precisa de Docker)
npm run db:reset        # migrations + seed de demonstração (local)
npm run db:diff         # gera migration a partir de mudanças feitas no Studio

npm test                # unidade + banco
npm run test:unidade    # rápido, sem rede
npm run test:banco      # integração contra o Supabase de verdade
```

Um teste só:

```bash
npm --prefix frontend run test -- src/lib/pix.test.js
npm --prefix backend/testes run test -- papeis.test.js
npm --prefix backend/testes run test -- -t "professor não vê mensalidade"
```

Login do seed local: `professor@craquedoamanha.com.br` / `craque123`.

## Arquitetura

```
frontend/   React 19 + Vite + Tailwind 4 — só interface
backend/    Supabase — Postgres, RLS, funções (RPC) e Edge Functions
```

**A regra de negócio mora no Postgres, não na tela.** Fechar uma chamada, dar
baixa numa mensalidade, aprovar uma pré-matrícula: tudo é função SQL. Assim a
regra vale igual venha do app, do link público ou do webhook. Ao implementar
uma regra nova, a pergunta é "que função no banco faz isso", não "que
componente calcula isso".

### Camadas do front

```
views/*.jsx  →  hooks/dados.js  →  api/*.js  →  api/cliente.js  →  Supabase
```

- **Nenhuma view fala com o Supabase direto.** Toda consulta fica em
  `frontend/src/api/`, um arquivo por assunto.
- `api/cliente.js` expõe `exec(consulta)` e `rpc(nome, args)`; ambos
  desembrulham o `{ data, error }` e lançam exceção já com mensagem pronta
  para a tela.
- `hooks/dados.js` embrulha tudo em react-query. Convenção de chave:
  `['assunto', escolinhaId, ...]`, para que `invalidar(escolinha)` limpe uma
  escolinha inteira de uma vez.
- `estado/Sessao.jsx` guarda sessão, perfil, lista de escolinhas e a
  `escolinhaId` ativa (persistida em `localStorage`). Quase todo hook depende
  dela e fica `enabled: false` enquanto não houver escolinha.
- `ui.jsx` é o kit de componentes (Btn, Field, Sheet, Tag, useToast…). Use o
  que já existe em vez de escrever botão/modal novo.
- As cores são tokens do Tailwind (`bg-surface`, `text-ink2`, `text-accent`,
  `bg-badbg`) definidos em `index.css` com variantes claro/escuro. **Não use
  cor literal do Tailwind** (`bg-green-600`) — quebra o modo escuro.

### Roteamento

`HashRouter`, e isso é permanente: os links de matrícula já entregues aos pais
são `#/matricula/CODIGO`. As rotas públicas (`/matricula/:codigo`,
`/portal/:token`, `/aula/:codigo`, `/convite/:token`) ficam **fora** do
`Shell` e abrem deslogadas. `Shell.jsx` exporta `SO_GESTOR`, derivado do menu —
é ele que o `App.jsx` usa para redirecionar professor que abre rota de gestor.

### Multi-tenant e papéis

Cada professor tem a própria escolinha; um usuário pode ser membro de várias.
Todo acesso é filtrado por RLS a partir de `escolinhas_do_usuario()` — você vê
uma linha se for membro da escolinha dona dela.

Dois papéis: **gestor** (tudo) e **professor** (Painel, Agenda, Chamada, Alunos,
avaliações — nenhum valor financeiro). Essa separação está **na RLS**, não só no
menu. Esconder um campo na tela não é implementar a regra; a política no banco é.

### Backend

`backend/supabase/migrations/` é a fonte da verdade do schema, em ordem
cronológica. Nunca edite uma migration já aplicada — crie outra.

- Views `vw_*` são `security_invoker = on` (a RLS do chamador continua valendo).
- Funções RPC são `SECURITY INVOKER` por padrão. `SECURITY DEFINER` só onde está
  anotado o motivo — tipicamente o acesso anônimo dos links públicos
  (`publico.sql`), onde **nenhuma tabela é exposta a `anon`**: o visitante só
  enxerga o JSON que a função devolve.
- Função nova no Supabase nasce com `EXECUTE` para `PUBLIC` *e* um grant direto
  para `anon`. Tirar só de `PUBLIC` deixa o grant de pé — faça os dois
  `revoke`, como em `rls.sql`.
- As regras de cobrança (multa, juros, desconto) são **copiadas para a cobrança
  quando ela nasce**. Mudar a regra hoje não pode alterar o que já foi cobrado.
- Edge Functions (`functions/asaas-*`) guardam a chave de API da escolinha em
  `asaas_segredo`, tabela sem policy nenhuma, lida só com a service key.

## Testes

Unidade (`frontend/`, Vitest + jsdom) cobrem as funções puras de `lib/` e
montam as telas públicas num DOM — é o que pega import faltando, componente
indefinido e quebra na primeira pintura. O Vitest herda `vite.config.js`.

Integração (`backend/testes/`, Vitest) **não usa mock**: fala com o Supabase de
verdade, porque RLS, funções e políticas do Storage só valem alguma coisa se
forem exercitadas no Postgres. Cada arquivo cria a própria escolinha e apaga no
fim — e a limpeza confere que apagou mesmo, porque `delete` sem permissão
devolve zero linhas *sem erro*. `fileParallelism: false` de propósito.

As chaves vêm do ambiente ou de `frontend/.env`. Sem elas a suíte é **pulada**
num clone qualquer, mas **quebra em CI** (`process.env.CI`, guarda no topo do
`ajuda.js`): um check verde que não rodou nada afirma que a RLS foi conferida
quando ninguém conferiu. Duas contas fixas são reaproveitadas entre rodadas
(criadas sozinhas na primeira, se a confirmação de e-mail estiver desligada).

O CI fala com o **mesmo Supabase que atende os pais** — não há projeto separado.
Duas consequências: teste de integração escreve no banco de produção (por isso
cada arquivo apaga o que criou, e confere), e **PR que adiciona migration só
fica verde depois que o schema sobe**. Vermelho nesse caso costuma significar
"falta `db:push`", não "o código está errado".

Nada de valor sorteado em teste — nem número de camisa, nem nome. Colide de vez
em quando e produz vermelho aleatório, que ensina a ignorar vermelho.

Os testes do Asaas exigem o Supabase local, o **Asaas de mentira**
(`npm run asaas:falso`, em `backend/testes/asaas-falso.mjs`) e as funções
servidas apontando para ele (`npm run funcoes:servir`). Sem os três, são
pulados.

A pegadinha: as Edge Functions rodam **em container**, então para elas este
computador é `host.docker.internal`, não `127.0.0.1` — que lá dentro é o
loopback do próprio container e recusa a conexão. `backend/testes/funcoes.env`
resolve isso no Mac; no Linux o nome não existe e vale o gateway da bridge
do Docker, que o workflow calcula.

## Migrations e produção

`db:push` sai da **`main`, depois do merge** — nunca de um branch. Aplicar de um
branch deixa o histórico da nuvem à frente da `main`, e aí o `db:push` de
qualquer outro branch é recusado com *"Remote migration versions not found in
local migrations directory"*. Já aconteceu; o conserto foi mergear o branch
adiantado e trazer a `main` para dentro dos outros.

Quando isso acontecer, **não** rode o `supabase migration repair --status
reverted` que o CLI sugere: ele marca como revertida uma migration que está
aplicada, e o push seguinte tenta criar tudo de novo.

A ordem importa nos dois sentidos. O merge dispara o deploy da Netlify na hora;
o `db:push` é manual. Front novo com schema velho não degrada — o PostgREST
recusa a coluna que não existe, `exec` lança, e o app não abre para ninguém,
nem no link público. **Schema primeiro, merge depois.**

## Publicação

Netlify, `netlify.toml` na raiz (base `frontend`, publish `dist`).
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` entram nas variáveis de ambiente
do site: **sem elas o build passa** e o site sobe mostrando `SemConfiguracao`
para todo mundo. `vite.config.js` usa `base: '/'` — só muda se o site sair da
raiz do domínio.

## Celular

O app é usado no telefone, em campo. Layout novo tem que funcionar a **390px**
de largura; confira antes de considerar pronto.
