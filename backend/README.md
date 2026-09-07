# Backend — Supabase

Postgres com RLS. Não há servidor de aplicação: o front fala direto com o
Supabase, e toda regra que não pode depender do cliente mora aqui, como
função no banco.

```
supabase/
  migrations/
    …_schema.sql      tabelas, tipos e triggers
    …_rls.sql         Row Level Security — o isolamento entre escolinhas
    …_views.sql       views de leitura (frequência, alunos, mensalidades…)
    …_funcoes.sql     RPCs de aplicação (chamada, pagamento, painel…)
    …_publico.sql     o link de matrícula e as duas funções abertas ao anônimo
    …_storage.sql     bucket privado das fotos
  seed.sql            escolinha de demonstração
  config.toml         configuração do ambiente local
```

## Comandos

Rodados da raiz do repositório:

```bash
npm run db:start     # sobe o Supabase local (precisa de Docker)
npm run db:reset     # recria o banco local: migrations + seed
npm run db:push      # aplica as migrations no projeto da nuvem
npm run db:diff      # gera migration a partir de mudanças feitas no Studio
```

Para apontar para o projeto da nuvem, uma vez só:

```bash
supabase --workdir backend link --project-ref SEU_REF
```

## Testes

`testes/` é um pacote npm à parte, com Vitest. Roda da raiz com
`npm run test:banco`.

| Arquivo | O que trava |
|---|---|
| `isolamento.test.js` | RLS: o anônimo não lê nada, e um professor não alcança a escolinha do outro |
| `chamada.test.js` | Geração de treinos, marcação, e a conta da frequência caso a caso |
| `financeiro.test.js` | Mensalidade por aluno, baixa, estorno e o reflexo no caixa |
| `matricula.test.js` | Link público, validações, upload do responsável e a aprovação |
| `portal.test.js` | O que o link do responsável mostra — e o que ele nunca pode mostrar |
| `equipe.test.js` | Convite de uso único, papéis e a proteção do último dono |
| `avaliacoes.test.js` | Notas, média e o que acontece ao apagar um quesito |

## Isolamento entre escolinhas

Toda tabela do dia a dia tem `escolinha_id`, e a política é sempre a mesma:

```sql
escolinha_id in (select escolinhas_do_usuario())
```

`escolinhas_do_usuario()` é `SECURITY DEFINER` de propósito — se lesse
`membros` com RLS ligada, a política de `membros` chamaria a si mesma.

`presencas` e `mensalidades` recebem o `escolinha_id` por trigger, copiado do
treino e do aluno. É redundante no papel, mas troca um `exists(...)` por uma
comparação direta em toda leitura.

## O link público

Nenhuma tabela é legível pelo papel `anon`. A página de matrícula usa duas
funções `SECURITY DEFINER`:

- `escolinha_publica(codigo)` — nome, cidade e turmas com vaga, ou `null`
- `enviar_pre_matricula(codigo, dados)` — valida e grava como pendente

A pré-matrícula **não** cria aluno. Quem aprova é o professor, no painel, e é
a aprovação que cria (ou reaproveita, pelo telefone) o responsável, cria o
atleta e gera a mensalidade do mês.

Trocar o código (`trocar_codigo_matricula`) invalida o link antigo na hora.

## Frequência

Calculada na view `vw_aluno_frequencia`, nunca guardada em coluna:

- só conta treino com `status = 'realizado'`;
- só conta treino a partir de `alunos.matriculado_em`, para quem entrou no
  meio do mês não começar com 0%;
- falta justificada não derruba o índice — é o mesmo critério que a tela de
  chamada mostra durante o treino.

## Primeira aplicação na nuvem

```bash
supabase --workdir backend login
supabase --workdir backend link --project-ref SEU_REF
npm run db:push
```

Ainda no painel do Supabase:

1. **Authentication → Providers → Email**: desligue *Confirm email* enquanto
   estiver testando. Com a confirmação ligada, o cadastro não devolve sessão e
   a escolinha só é criada no primeiro login — o app trata isso, mas atrasa a
   primeira volta.
2. **Authentication → URL Configuration**: inclua a URL do site em
   *Redirect URLs*, senão o link de troca de senha não volta.

Para carregar a escolinha de demonstração no projeto da nuvem:

```bash
supabase --workdir backend db push --include-seed
```

> Cuidado: o seed cria um usuário com senha conhecida
> (`professor@craquedoamanha.com.br` / `craque123`). Só use em projeto de
> teste, e apague o usuário antes de abrir para gente de verdade.

## Se algo falhar no `db push`

As migrations são idempotentes entre si, mas não internamente — se uma parar
no meio, o jeito limpo é `supabase db reset --linked` (apaga tudo) ou aplicar
o arquivo que faltou à mão pelo SQL Editor. Em projeto novo, `reset` é o
caminho mais curto.
