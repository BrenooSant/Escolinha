-- =============================================================
--  Seed de demonstração — a escolinha "Craque do Amanhã".
--  Roda no `supabase db reset` (local) e pode ser aplicado à nuvem
--  com `psql -f`. Cria um usuário de teste:
--
--      professor@craquedoamanha.com.br  /  craque123
--
--  Não use em produção com dados reais.
-- =============================================================

do $seed$
declare
  v_user      uuid := '11111111-1111-4111-8111-111111111111';
  v_escolinha uuid;
  v_turma     uuid;
  v_resp      uuid;
  v_aluno     uuid;
  v_treino    uuid;
  a           record;
  t           record;
  d           record;
  v_comp      date := date_trunc('month', current_date)::date;
begin
  if exists (select 1 from auth.users where id = v_user) then
    raise notice 'Seed já aplicado — nada a fazer.';
    return;
  end if;

  -- ---------- usuário de teste ----------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    -- o GoTrue lê estas colunas como texto; NULL faz ele estourar
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated',
    'professor@craquedoamanha.com.br', crypt('craque123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"nome":"Ricardo Menezes"}',
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  values (gen_random_uuid(), v_user, v_user::text,
          format('{"sub":"%s","email":"professor@craquedoamanha.com.br"}', v_user)::jsonb,
          'email', now(), now());

  -- ---------- escolinha ----------
  insert into escolinhas (nome, cidade, local_padrao, chave_pix, codigo_matricula)
  values ('Craque do Amanhã', 'Goiânia, GO', 'Campo do Bosque', '12.345.678/0001-90', 'CRAQUE24')
  returning id into v_escolinha;

  insert into membros (escolinha_id, perfil_id, papel) values (v_escolinha, v_user, 'dono');

  -- ---------- turmas e grade semanal ----------
  for t in
    select * from (values
      ('Sub-9',  12000, 1, 'Prof. Ricardo / Ana', 8, array[1, 5], time '17:00'),
      ('Sub-11', 13000, 2, 'Prof. Ricardo',       8, array[1, 2], time '18:00'),
      ('Sub-13', 14000, 3, 'Prof. Ricardo',       8, array[2, 3], time '18:00'),
      ('Sub-15', 15000, 4, 'Prof. Ana',           8, array[3, 4], time '19:00')
    ) as x(nome, valor, ordem, prof, cap, dias, hora)
  loop
    insert into turmas (escolinha_id, nome, mensalidade_centavos, ordem, professor, capacidade)
    values (v_escolinha, t.nome, t.valor, t.ordem, t.prof, t.cap)
    returning id into v_turma;

    insert into turma_horarios (turma_id, dia_semana, hora, local)
    select v_turma, unnest(t.dias), t.hora,
           case when t.nome = 'Sub-15' then 'Society Vila Nova' else 'Campo do Bosque' end;
  end loop;

  -- ---------- atletas e responsáveis ----------
  create temp table _seed_pesos (aluno uuid, peso numeric, cobranca text, dias int) on commit drop;

  for a in
    select * from (values
      ('Arthur Nogueira',   10, 'Sub-11', 'Meia',     '2014-09-14'::date, 'Marcela Nogueira',  'Mãe',   '(62) 99184-2210', 0.90, 'atraso', 12, 'Bombinha para asma na mochila.'),
      ('Bernardo Lima',      9, 'Sub-11', 'Atacante', '2015-02-03'::date, 'Cláudio Lima',      'Pai',   '(62) 99623-8814', 0.98, 'pago',    0, null),
      ('Nicolas Ferraz',    13, 'Sub-11', 'Volante',  '2014-07-22'::date, 'Tatiana Ferraz',    'Mãe',   '(62) 99230-6654', 0.85, 'pago',    0, null),
      ('Laura Mendes',      20, 'Sub-11', 'Lateral',  '2014-11-11'::date, 'Kelly Mendes',      'Mãe',   '(62) 98456-7712', 0.97, 'aberto',  0, null),
      ('Manuela Reis',      11, 'Sub-11', 'Ponta',    '2015-05-05'::date, 'Douglas Reis',      'Pai',   '(62) 99065-7788', 0.97, 'pago',    0, null),
      ('Lívia Prado',        7, 'Sub-13', 'Ponta',    '2013-09-21'::date, 'Renata Prado',      'Mãe',   '(62) 98110-4477', 0.85, 'pago',    0, null),
      ('Heitor Camargo',     8, 'Sub-13', 'Volante',  '2013-01-30'::date, 'Aline Camargo',     'Mãe',   '(62) 98274-6612', 0.58, 'atraso', 21, 'Sai mais cedo às quartas.'),
      ('Isabela Moura',      2, 'Sub-13', 'Lateral',  '2013-06-17'::date, 'Simone Moura',      'Mãe',   '(62) 99727-3390', 0.98, 'aberto',  0, null),
      ('Rafael Duarte',     16, 'Sub-13', 'Goleiro',  '2012-12-08'::date, 'Vanessa Duarte',    'Mãe',   '(62) 99441-9083', 0.85, 'atraso',  9, 'Usa luva própria.'),
      ('Gustavo Rocha',     15, 'Sub-13', 'Zagueiro', '2013-04-25'::date, 'Eliane Rocha',      'Avó / Avô', '(62) 98891-3374', 0.90, 'pago', 0, null),
      ('Enzo Batista',       4, 'Sub-9',  'Zagueiro', '2016-09-29'::date, 'Patrícia Batista',  'Mãe',   '(62) 99442-0193', 0.76, 'atraso',  7, 'Alergia a amendoim.'),
      ('Théo Andrade',       6, 'Sub-9',  'Meia',     '2017-03-02'::date, 'Fabiano Andrade',   'Pai',   '(62) 98899-1204', 0.68, 'pago',    0, null),
      ('Pedro Vasques',     14, 'Sub-9',  'Atacante', '2016-08-19'::date, 'Camila Vasques',    'Mãe',   '(62) 98003-2266', 0.98, 'pago',    0, null),
      ('Alice Barreto',     17, 'Sub-9',  'Ponta',    '2017-01-07'::date, 'Marcos Barreto',    'Pai',   '(62) 99118-5540', 0.92, 'pago',    0, null),
      ('Samuel Queiroz',    18, 'Sub-9',  'Goleiro',  '2016-10-13'::date, 'Débora Queiroz',    'Mãe',   '(62) 98720-9931', 0.85, 'aberto',  0, null),
      ('Miguel Tavares',     1, 'Sub-15', 'Goleiro',  '2011-02-26'::date, 'Sandro Tavares',    'Pai',   '(62) 99871-3025', 0.98, 'aberto',  0, null),
      ('Davi Fontes',        5, 'Sub-15', 'Zagueiro', '2011-07-09'::date, 'Juliana Fontes',    'Mãe',   '(62) 99310-5521', 0.92, 'atraso',  4, null),
      ('Lucas Pereira',      3, 'Sub-15', 'Lateral',  '2011-03-31'::date, 'Rogério Pereira',   'Pai',   '(62) 99558-1147', 0.45, 'atraso', 33, 'Conversar com o pai sobre as faltas.'),
      ('Yuri Nascimento',   12, 'Sub-15', 'Meia',     '2011-05-15'::date, 'Marcos Nascimento', 'Pai',   '(62) 99612-4470', 0.90, 'pago',    0, null),
      ('Vitor Hugo Salles', 19, 'Sub-15', 'Atacante', '2010-12-04'::date, 'Paulo Salles',      'Pai',   '(62) 98330-2218', 0.98, 'pago',    0, null)
    ) as x(nome, numero, turma, posicao, nascimento, resp, parentesco, telefone, peso, cobranca, dias, obs)
  loop
    select id into v_turma from turmas where escolinha_id = v_escolinha and nome = a.turma;

    insert into responsaveis (escolinha_id, nome, parentesco, telefone, email)
    values (v_escolinha, a.resp, a.parentesco, a.telefone,
            lower(regexp_replace(split_part(a.resp, ' ', 1), '[^a-zA-Z]', '', 'g')) || '@email.com')
    on conflict (escolinha_id, telefone) where telefone is not null and telefone <> ''
      do update set nome = excluded.nome
    returning id into v_resp;

    insert into alunos (
      escolinha_id, turma_id, responsavel_id, nome, numero, posicao,
      nascimento, observacoes, matriculado_em
    )
    values (
      v_escolinha, v_turma, v_resp, a.nome, a.numero, a.posicao,
      a.nascimento, a.obs, v_comp - interval '5 months'
    )
    returning id into v_aluno;

    -- guarda o peso de assiduidade e a situação da cobrança para os passos seguintes
    insert into _seed_pesos values (v_aluno, a.peso, a.cobranca, a.dias);
  end loop;

  -- ---------- agenda: 6 semanas para trás e 2 para frente ----------
  perform gerar_treinos(v_escolinha, (current_date - 42)::date, (current_date + 14)::date);

  update treinos set status = 'realizado'
   where escolinha_id = v_escolinha and data < current_date;

  -- amistoso do fim de semana
  select id into v_turma from turmas where escolinha_id = v_escolinha and nome = 'Sub-13';
  insert into treinos (escolinha_id, turma_id, data, hora, local, tipo, adversario)
  values (v_escolinha, v_turma,
          (current_date + (6 - extract(dow from current_date)::int))::date,
          '09:00', 'Campo do Bosque', 'jogo', 'Escolinha Bandeirante')
  on conflict do nothing;

  -- ---------- chamadas passadas ----------
  -- Presença sorteada com peso por atleta: gera frequências variadas,
  -- mas sempre as mesmas, porque a semente é fixa.
  perform setseed(0.4242);

  insert into presencas (treino_id, aluno_id, marca, motivo)
  select tr.id, al.id,
         case
           when random() < p.peso then 'P'::marca_presenca
           when random() < 0.25   then 'J'::marca_presenca
           else 'F'::marca_presenca
         end,
         null
  from treinos tr
  join alunos al on al.turma_id = tr.turma_id
  join _seed_pesos p on p.aluno = al.id
  where tr.escolinha_id = v_escolinha and tr.status = 'realizado';

  update presencas set motivo = 'Atestado médico'
   where escolinha_id = v_escolinha and marca = 'J' and motivo is null;

  -- a chamada de anteontem fica em aberto, para o alerta do painel aparecer
  update treinos set status = 'agendado'
   where id = (
     select id from treinos
     where escolinha_id = v_escolinha and status = 'realizado' and data < current_date
     order by data desc offset 1 limit 1
   );
  delete from presencas
   where treino_id in (select id from treinos where escolinha_id = v_escolinha and status = 'agendado');

  -- ---------- mensalidades: 5 meses pagos + o mês corrente ----------
  for d in select generate_series(v_comp - interval '5 months', v_comp, interval '1 month')::date as m loop
    perform gerar_mensalidades(v_escolinha, d.m);
  end loop;

  -- meses anteriores: tudo quitado
  update mensalidades set status = 'paga', pago_em = vencimento, metodo = 'pix'
   where escolinha_id = v_escolinha and competencia < v_comp;

  insert into lancamentos (escolinha_id, descricao, tipo, valor_centavos, data, categoria, mensalidade_id)
  select m.escolinha_id,
         'Mensalidade ' || al.nome || ' · ' || to_char(m.competencia, 'MM/YYYY'),
         'entrada', m.valor_centavos, m.pago_em, 'Mensalidade', m.id
  from mensalidades m join alunos al on al.id = m.aluno_id
  where m.escolinha_id = v_escolinha and m.status = 'paga'
  on conflict (mensalidade_id) where mensalidade_id is not null do nothing;

  -- mês corrente: aplica a situação escolhida por atleta
  update mensalidades m
     set status = 'paga', pago_em = current_date - 3, metodo = 'pix'
   from _seed_pesos p
   where m.aluno_id = p.aluno and m.competencia = v_comp and p.cobranca = 'pago';

  update mensalidades m
     set vencimento = current_date - p.dias
   from _seed_pesos p
   where m.aluno_id = p.aluno and m.competencia = v_comp and p.cobranca = 'atraso';

  insert into lancamentos (escolinha_id, descricao, tipo, valor_centavos, data, categoria, mensalidade_id)
  select m.escolinha_id,
         'Mensalidade ' || al.nome || ' · ' || to_char(m.competencia, 'MM/YYYY'),
         'entrada', m.valor_centavos, m.pago_em, 'Mensalidade', m.id
  from mensalidades m join alunos al on al.id = m.aluno_id
  where m.escolinha_id = v_escolinha and m.competencia = v_comp and m.status = 'paga'
  on conflict (mensalidade_id) where mensalidade_id is not null do nothing;

  -- ---------- caixa: entradas avulsas e despesas ----------
  insert into lancamentos (escolinha_id, descricao, tipo, valor_centavos, data, categoria)
  select v_escolinha, x.descricao, x.tipo::tipo_lancamento, x.valor,
         (v_comp + (x.dia - 1) * interval '1 day')::date, x.categoria
  from (values
    ('Kit uniforme (8 un.)',   'entrada', 64000,  2, 'Uniforme'),
    ('Aluguel do campo',       'saida',   90000,  1, 'Estrutura'),
    ('Bolas e coletes',        'saida',   32000,  3, 'Material'),
    ('Arbitragem amistoso',    'saida',   23000,  4, 'Competição'),
    ('Lavanderia dos coletes', 'saida',    9000,  5, 'Estrutura')
  ) as x(descricao, tipo, valor, dia, categoria)
  where (v_comp + (x.dia - 1) * interval '1 day')::date <= current_date;

  -- despesas fixas dos meses anteriores, para o gráfico ter história
  insert into lancamentos (escolinha_id, descricao, tipo, valor_centavos, data, categoria)
  select v_escolinha, 'Aluguel do campo', 'saida', 90000, m::date, 'Estrutura'
  from generate_series(v_comp - interval '5 months', v_comp - interval '1 month', interval '1 month') m;

  insert into lancamentos (escolinha_id, descricao, tipo, valor_centavos, data, categoria)
  select v_escolinha, 'Material de treino', 'saida', 28000, (m + interval '9 days')::date, 'Material'
  from generate_series(v_comp - interval '5 months', v_comp - interval '1 month', interval '1 month') m;

  -- ---------- uma pré-matrícula esperando aprovação ----------
  select id into v_turma from turmas where escolinha_id = v_escolinha and nome = 'Sub-11';
  insert into pre_matriculas (
    escolinha_id, aluno_nome, nascimento, posicao, turma_id, observacoes,
    resp_nome, resp_parentesco, resp_telefone, resp_email
  ) values (
    v_escolinha, 'Gabriel Souza Antunes', '2015-03-12', 'Meia', v_turma,
    'Usa óculos de grau; joga sem.',
    'Cristiane Antunes', 'Mãe', '(62) 99401-7788', 'cristiane@email.com'
  );

  raise notice 'Seed pronto — entre com professor@craquedoamanha.com.br / craque123';
end;
$seed$;
