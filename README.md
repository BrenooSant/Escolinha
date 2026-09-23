# Escolinha Craque do Amanhã

Sistema de gestão para escolinha de futebol: matrícula, chamada do treino,
agenda, mensalidades e cobrança dos responsáveis. Multi-tenant — cada
professor cria a própria escolinha, e cada uma tem um **link público de
matrícula** para os pais preencherem a ficha do filho.

Publicado na **Netlify**.

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
| **Leads** | Funil de interessados, aula experimental, retornos e conversão |
| **Matrículas** | Fichas recebidas pelo link público, para aprovar ou recusar |
| **Ajustes** | Dados da escolinha (com CNPJ/CPF), regras de cobrança e planos, link de matrícula, turmas e grade semanal, equipe, conta |

### Cobrança

Cada escolinha liga só o que usa — tudo nasce desligado:

- **Desconto por pagar em dia** (valor fixo ou %, até X dias antes do vencimento)
- **Multa e juros ao mês** no atraso, proporcionais aos dias
- **Planos** bimestral, trimestral, semestral, anual… com desconto próprio
- **Desconto de irmão**, do segundo filho do mesmo responsável em diante
- **Taxa de matrícula**, cobrada uma vez e mostrada no link de matrícula
- **Cobranças avulsas** (uniforme, campeonato) lançadas na ficha do atleta

As regras são copiadas para cada cobrança quando ela nasce — mudar a multa
hoje não altera o que já foi cobrado. O valor do dia (com desconto ou multa)
aparece na ficha, em Cobranças, na mensagem do WhatsApp e no link do
responsável, que paga por **Pix copia e cola com QR code** gerado no próprio
app e baixa o **recibo** do que já pagou.

### Pagamento pelo link (Asaas)

A escolinha conecta a **conta Asaas dela** em Ajustes, colando a chave de
API. A partir daí o link do responsável mostra **boleto, Pix e cartão** da
mensalidade, com a multa, os juros e o desconto que ela configurou — e
quando o pagamento entra, o webhook dá **baixa sozinho**: mensalidade
quitada, dinheiro no caixa e o aviso de atraso some da chamada.

O dinheiro cai na conta da escolinha; a plataforma não entra no caminho. O
Asaas não manda e-mail nem SMS para ninguém: quem mostra a cobrança é o
link. A cobrança só nasce quando o responsável decide pagar, e a chave fica
no servidor, numa tabela que nem o gestor lê.

```
backend/supabase/functions/
  asaas-conectar/   valida a chave, guarda e registra o webhook
  asaas-cobranca/   gera (ou reaproveita) a cobrança do link do responsável
  asaas-webhook/    recebe o evento e dá baixa, sem duplicar
```

### Contrato online

O gestor escreve o contrato em Ajustes (vem um modelo de exemplo para
revisar), com campos que se preenchem sozinhos — `{{aluno}}`,
`{{mensalidade}}`, `{{cpf_responsavel}}`… — e liga o aceite. Quem está
entrando aceita na própria ficha do link de matrícula; quem já é aluno,
pelo link do responsável. Fica guardado o texto exato que a pessoa leu, com
nome, CPF, IP, navegador, data e hora e o hash SHA-256 do texto, e o gestor
baixa o PDF na ficha do atleta. Cada edição do contrato é uma versão nova:
quem já aceitou continua com o texto que leu.

### Leads

Funil de quem ainda não é aluno: novo → em contato → aula experimental →
ficha enviada → matriculado (ou perdido, com o motivo). O lead entra à mão,
pelo **formulário de aula experimental** (link curto para a bio do
Instagram) ou sozinho, quando a ficha do link de matrícula chega — e aprovar
ou recusar a ficha fecha o lead. Cada lead tem histórico, data de retorno e
aula marcada; o Painel avisa quem retornar e quem vem hoje, e dá para
matricular direto do lead.

No Financeiro, **contas a pagar e a receber** ficam pendentes até serem pagas;
a recorrente (aluguel, salário) já deixa a do mês seguinte lançada.

### Papéis

- **Gestor** — tudo.
- **Professor** — Painel, Agenda, Chamada, Alunos e avaliações. Vê atletas,
  turmas e contato do responsável, mas nenhum valor: mensalidade, caixa,
  cobrança, matrícula e dados da escolinha são só do gestor. A regra está na
  RLS, não só nas telas. Na chamada ele vê o aviso **"Pagamento em atraso"**,
  que aparece também no link do responsável depois da tolerância que o gestor
  configura em Ajustes.

## Testes

```bash
npm test              # tudo
npm run test:unidade  # rápido, sem rede — roda em qualquer lugar
npm run test:banco    # integração: fala com o Supabase de verdade
```

**270 testes.** Os de unidade cobrem as funções puras de formatação e
montam as telas públicas num DOM, para pegar o que o build não pega —
import faltando, componente indefinido, quebra na primeira pintura.

Os de integração rodam contra o projeto Supabase, sem mock: as regras que
importam (RLS, funções, políticas do Storage) moram no Postgres e só
valem alguma coisa se forem exercitadas lá. Cada arquivo cria a própria
escolinha e a apaga no fim — e a limpeza confere que apagou mesmo, porque
um `delete` sem permissão devolve zero linhas *sem erro*.

Eles usam duas contas fixas, reaproveitadas entre execuções, para não
encher o Authentication de usuário descartável. Na primeira rodada as
contas são criadas sozinhas; para isso a confirmação de e-mail precisa
estar desligada, ou as contas precisam existir antes.

Sem as chaves do Supabase, a suíte de integração é pulada em vez de
falhar — é o que deixa o projeto rodar num clone qualquer, sem conta no
Supabase. **No CI, não**: lá faltar chave é erro, e o job quebra dizendo
quais secrets cadastrar. Um check verde que não rodou nada é pior que um
vermelho: ele afirma que a RLS foi conferida quando ninguém conferiu.

Os secrets que o workflow espera são `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` (e, para contas de teste próprias, `TESTE_EMAIL`,
`TESTE_EMAIL_2` e `TESTE_SENHA`). Em pull request vindo de fork o job nem
roda, porque o GitHub não expõe secret para fork.

Os testes do Asaas rodam contra as funções servidas localmente
(`supabase functions serve`) e contra um Asaas de mentira, sem chave de
verdade e sem dinheiro; onde as funções não estiverem no ar, são pulados.

## Publicação

Hospedado na Netlify. O `netlify.toml` na raiz já traz a build: base
`frontend`, comando `npm run build`, publicação em `dist`.

Antes do primeiro deploy, em **Site configuration → Environment
variables**, cadastre:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Isso não é opcional e falha calado: sem as chaves o build **passa**, e o
site sobe mostrando a tela "Sem configuração" para todo mundo.

E no painel do Supabase (**Authentication → URL Configuration**), inclua o
endereço da Netlify nas *Redirect URLs* — sem isso a recuperação de senha
não volta para o site.

O `vite.config.js` usa `base: '/'`, que é o certo para servir na raiz do
domínio. Se um dia o site for para uma subpasta, esse valor muda junto,
senão todo asset sai com caminho errado e a página abre em branco.

A `anon key` fica visível no bundle, como manda o desenho do Supabase: quem
protege os dados é a RLS, não o segredo da chave.
