# Escolinha Craque do Amanhã

Sistema de gestão para escolinha de futebol: matrícula, chamada do treino,
agenda, mensalidades e cobrança dos responsáveis. Multi-tenant — cada
professor cria a própria escolinha, e cada uma tem um **link público de
matrícula** para os pais preencherem a ficha do filho.

No ar em **https://brenoosant.github.io/Escolinha/**

```
frontend/   React 19 + Vite + Tailwind 4 — só interface
backend/    Supabase — Postgres, RLS, funções e Storage
```

O front nunca escreve SQL nem monta consulta solta pelas telas: tudo passa
por `frontend/src/api/`, e o que precisa de regra de negócio (fechar uma
chamada, dar baixa numa mensalidade, aprovar uma pré-matrícula) é função no
banco. Assim a regra vale igual venha de onde vier.

## Começando

```bash
npm run setup                     # instala o front

cp frontend/.env.example frontend/.env
# preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

npm run db:push                   # aplica as migrations no projeto da nuvem
npm run dev                       # http://localhost:5173
```

Para trabalhar sem tocar na nuvem, com Docker rodando:

```bash
npm run db:start                  # sobe o Supabase local
npm run db:reset                  # migrations + seed de demonstração
```

O seed cria a escolinha "Craque do Amanhã" com 20 atletas, seis semanas de
chamadas, mensalidades e uma pré-matrícula esperando aprovação. Login:
`professor@craquedoamanha.com.br` / `craque123`.

## O que dá para fazer

| Tela | O que faz |
|---|---|
| **Painel** | Números do mês, pendências reais (chamada não feita, mensalidade vencida, ficha esperando) e relatório em PDF |
| **Agenda** | Semana de treinos e amistosos; gera os treinos automaticamente pela grade das turmas |
| **Chamada** | Escolhe o treino, marca P/F/J com motivo e fecha — a frequência é recalculada no banco |
| **Alunos** | Ficha completa com foto, histórico de presença, responsável e situação da mensalidade |
| **Financeiro** | Entradas × saídas dos últimos 6 meses, lançamentos de caixa, mensalidades por turma |
| **Cobranças** | Vencidas, a vencer e pagas; lembrete pronto que abre no WhatsApp e fica registrado |
| **Matrículas** | Fichas recebidas pelo link público, para aprovar ou recusar |
| **Ajustes** | Dados da escolinha, link de matrícula, turmas e grade semanal, equipe, conta |

## Publicação

O push na `main` dispara `.github/workflows/deploy.yml`. Antes do primeiro
deploy, cadastre em **Settings → Secrets and variables → Actions**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

E, no painel do Supabase (**Authentication → URL Configuration**), inclua
`https://brenoosant.github.io/Escolinha/` nas *Redirect URLs* — sem isso a
recuperação de senha não volta para o site.

A `anon key` fica visível no bundle, como manda o desenho do Supabase: quem
protege os dados é a RLS, não o segredo da chave.
