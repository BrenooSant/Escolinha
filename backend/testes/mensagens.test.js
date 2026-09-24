/* Espinha de mensagens: lembrete de pagamento e aniversário.

   O que se prova aqui é a escolha — quem entra na fila hoje e quem
   não entra. O envio em si é o gestor que faz, abrindo o WhatsApp;
   o banco decide de quem é a vez e redige. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  apagarEscolinha, configurado, emDias, entrar, hoje, idDoUsuario, novaEscolinha, novoAluno,
  novoResponsavel,
} from './ajuda.js';

describe.skipIf(!configurado)('mensagens', () => {
  let gestor, professor, idProfessor, esc, turma, resp;

  const ligar = async (tipo, dias) => {
    const { error } = await gestor
      .from('modelos_mensagem')
      .update({ ativo: true, dias })
      .eq('escolinha_id', esc.id)
      .eq('tipo', tipo);
    if (error) throw new Error(`ligar ${tipo}: ` + error.message);
  };

  const desligarTudo = () =>
    gestor.from('modelos_mensagem').update({ ativo: false }).eq('escolinha_id', esc.id);

  const montar = async (data = hoje()) => {
    const { data: n, error } = await gestor.rpc('montar_fila', { p_escolinha: esc.id, p_data: data });
    if (error) throw new Error('montar_fila: ' + error.message);
    return n;
  };

  const fila = async (tipo) => {
    let q = gestor.from('vw_fila_mensagens').select('*').eq('escolinha_id', esc.id);
    if (tipo) q = q.eq('tipo', tipo);
    const { data } = await q.order('criado_em');
    return data ?? [];
  };

  const mensalidade = async (aluno, vencimento, valor = 15000) => {
    const { data, error } = await gestor
      .from('mensalidades')
      .insert({
        escolinha_id: esc.id, aluno_id: aluno.id, competencia: vencimento.slice(0, 8) + '01',
        valor_centavos: valor, vencimento,
      })
      .select()
      .single();
    if (error) throw new Error('mensalidade: ' + error.message);
    return data;
  };

  beforeAll(async () => {
    gestor = await entrar('dono');
    professor = await entrar('colega');
    idProfessor = await idDoUsuario(professor);
    esc = await novaEscolinha(gestor, 'mensagens');
    turma = esc.turmas[0];

    const { error } = await gestor
      .from('membros')
      .insert({ escolinha_id: esc.id, perfil_id: idProfessor, papel: 'professor' });
    if (error) throw new Error('pôr o professor na equipe: ' + error.message);

    resp = await novoResponsavel(gestor, {
      escolinhaId: esc.id, nome: 'Carla Menezes', telefone: '(62) 98888-1234',
    });
    await gestor.from('escolinhas').update({ chave_pix: 'craque@pix.com' }).eq('id', esc.id);
  });

  afterAll(async () => {
    await gestor.from('membros').delete().eq('escolinha_id', esc?.id).eq('perfil_id', idProfessor);
    await apagarEscolinha(gestor, esc?.id);
  });

  beforeEach(async () => {
    await gestor.from('fila_mensagens').delete().eq('escolinha_id', esc.id);
    await desligarTudo();
  });

  describe('nasce desligada', () => {
    it('a escolinha nova ganha os três modelos, todos desligados', async () => {
      const { data } = await gestor
        .from('modelos_mensagem').select('tipo, ativo, texto').eq('escolinha_id', esc.id).order('tipo');
      expect(data.map((m) => m.tipo)).toEqual(['aniversario', 'lembrete_atrasado', 'lembrete_vencendo']);
      expect(data.every((m) => m.ativo === false)).toBe(true);
      expect(data.every((m) => m.texto.length > 10)).toBe(true);
    });

    it('com tudo desligado, a fila não monta nada', async () => {
      const aluno = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Davi Silva', numero: 5, responsavel_id: resp.id,
      });
      // vencimento que nenhum outro teste mira: senão ele entra nas
      // filas seguintes e o que se conta aqui deixa de ser o que se quer
      await mensalidade(aluno, emDias(20));
      expect(await montar()).toBe(0);
      expect(await fila()).toEqual([]);
    });
  });

  describe('lembrete de mensalidade a vencer', () => {
    let aluno;

    beforeAll(async () => {
      aluno = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Enzo Prado', numero: 7, responsavel_id: resp.id,
      });
      await mensalidade(aluno, emDias(3));
    });

    it('entra quem vence daqui a exatamente N dias', async () => {
      await ligar('lembrete_vencendo', 3);
      expect(await montar()).toBe(1);

      const [m] = await fila('lembrete_vencendo');
      expect(m.aluno_nome).toBe('Enzo Prado');
      expect(m.responsavel_nome).toBe('Carla Menezes');
      expect(m.telefone).toBe('(62) 98888-1234');
      expect(m.status).toBe('pendente');
    });

    it('não entra quem vence em outro dia', async () => {
      await ligar('lembrete_vencendo', 4);
      expect(await montar()).toBe(0);
    });

    it('o texto sai preenchido, e só o {{link}} sobra para a tela', async () => {
      await ligar('lembrete_vencendo', 3);
      await montar();

      const [m] = await fila('lembrete_vencendo');
      expect(m.texto).toContain('Enzo');          // primeiro nome, não o inteiro
      expect(m.texto).toContain('Carla');
      expect(m.texto).toContain('R$ 150,00');
      expect(m.texto).toContain('PIX: craque@pix.com');
      expect(m.texto).not.toContain('{{valor}}');
      expect(m.texto).not.toContain('{{responsavel}}');
      expect(m.texto).toContain('{{link}}');      // a tela é quem sabe o domínio
    });

    it('montar duas vezes no mesmo dia não duplica', async () => {
      await ligar('lembrete_vencendo', 3);
      expect(await montar()).toBe(1);
      expect(await montar()).toBe(0);
      expect((await fila('lembrete_vencendo')).length).toBe(1);
    });

    it('mensalidade paga não vira lembrete', async () => {
      await gestor.from('mensalidades').update({ status: 'paga' }).eq('aluno_id', aluno.id);
      await ligar('lembrete_vencendo', 3);
      expect(await montar()).toBe(0);
      await gestor.from('mensalidades').update({ status: 'aberta' }).eq('aluno_id', aluno.id);
    });

    it('atleta arquivado não vira lembrete', async () => {
      await gestor.from('alunos').update({ ativo: false }).eq('id', aluno.id);
      await ligar('lembrete_vencendo', 3);
      expect(await montar()).toBe(0);
      await gestor.from('alunos').update({ ativo: true }).eq('id', aluno.id);
    });
  });

  describe('lembrete de mensalidade atrasada', () => {
    it('entra quem está atrasado há exatamente N dias, com o valor atualizado', async () => {
      const aluno = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Gabriel Rocha', numero: 11, responsavel_id: resp.id,
      });
      await mensalidade(aluno, emDias(-5));

      await ligar('lembrete_atrasado', 5);
      expect(await montar()).toBe(1);

      const [m] = await fila('lembrete_atrasado');
      expect(m.texto).toContain('5 dias de atraso');
      expect(m.texto).toContain('Gabriel');
    });

    it('um dia de atraso é escrito no singular', async () => {
      const aluno = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Heitor Lima', numero: 12, responsavel_id: resp.id,
      });
      await mensalidade(aluno, emDias(-1));

      await ligar('lembrete_atrasado', 1);
      await montar();

      const [m] = await fila('lembrete_atrasado');
      expect(m.texto).toContain('1 dia de atraso');
      expect(m.texto).not.toContain('1 dias');
    });
  });

  describe('aniversário', () => {
    const nascimentoHoje = () => '2015' + hoje().slice(4);

    it('entra quem faz aniversário hoje', async () => {
      const aluno = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Igor Ramos', numero: 21,
        responsavel_id: resp.id, nascimento: nascimentoHoje(),
      });
      await ligar('aniversario', 0);
      await montar();

      const lista = await fila('aniversario');
      expect(lista.map((m) => m.aluno_nome)).toContain('Igor Ramos');
      expect(lista[0].texto).toContain('Parabéns, Igor!');
      expect(lista[0].mensalidade_id).toBeNull();
    });

    it('quem está em atraso não recebe parabéns no mesmo dia da cobrança', async () => {
      const aluno = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'João Devedor', numero: 22,
        responsavel_id: resp.id, nascimento: nascimentoHoje(),
      });
      await mensalidade(aluno, emDias(-40));

      await ligar('aniversario', 0);
      await montar();

      const lista = await fila('aniversario');
      expect(lista.map((m) => m.aluno_nome)).not.toContain('João Devedor');
    });

    it('sem data de nascimento, ninguém é convidado por engano', async () => {
      await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Sem Data', numero: 23, responsavel_id: resp.id,
      });
      await ligar('aniversario', 0);
      await montar();

      const lista = await fila('aniversario');
      expect(lista.map((m) => m.aluno_nome)).not.toContain('Sem Data');
    });
  });

  describe('enviar', () => {
    let aluno, mens;
    /* Cada caso precisa de um atleta novo, e a camisa é única na turma.
       Número sorteado colide de vez em quando — o que dá um teste que
       falha sozinho, pior que teste nenhum. Contador resolve. */
    let camisa = 50;

    beforeEach(async () => {
      aluno = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Lucas Dias',
        numero: camisa++, responsavel_id: resp.id,
      });
      mens = await mensalidade(aluno, emDias(-5));
      await ligar('lembrete_atrasado', 5);
      await montar();
    });

    it('marcar enviada muda o status e registra o lembrete da cobrança', async () => {
      const [m] = (await fila('lembrete_atrasado')).filter((x) => x.mensalidade_id === mens.id);

      const { error } = await gestor.rpc('marcar_enviada', { p_id: m.id });
      expect(error).toBeNull();

      const { data: depois } = await gestor
        .from('fila_mensagens').select('status, enviada_em, enviado_por').eq('id', m.id).single();
      expect(depois.status).toBe('enviada');
      expect(depois.enviada_em).not.toBeNull();
      expect(depois.enviado_por).toBe(await idDoUsuario(gestor));

      // é de `lembretes` que a tela de Cobranças tira "último lembrete"
      const { data: l } = await gestor
        .from('lembretes').select('mensagem').eq('mensalidade_id', mens.id);
      expect(l.length).toBe(1);
      expect(l[0].mensagem).toContain('Lucas');
    });

    it('clicar duas vezes não registra o lembrete duas vezes', async () => {
      const [m] = (await fila('lembrete_atrasado')).filter((x) => x.mensalidade_id === mens.id);
      await gestor.rpc('marcar_enviada', { p_id: m.id });
      await gestor.rpc('marcar_enviada', { p_id: m.id });

      const { data: l } = await gestor.from('lembretes').select('id').eq('mensalidade_id', mens.id);
      expect(l.length).toBe(1);
    });

    it('o professor não envia', async () => {
      const [m] = (await fila('lembrete_atrasado')).filter((x) => x.mensalidade_id === mens.id);
      const { error } = await professor.rpc('marcar_enviada', { p_id: m.id });
      expect(error).not.toBeNull();
    });
  });

  describe('o professor não chega perto', () => {
    it('não lê a fila nem os modelos', async () => {
      for (const t of ['fila_mensagens', 'modelos_mensagem', 'vw_fila_mensagens']) {
        const { data } = await professor.from(t).select('*').eq('escolinha_id', esc.id);
        expect(data ?? []).toEqual([]);
      }
    });

    it('não liga um modelo', async () => {
      const { data } = await professor
        .from('modelos_mensagem').update({ ativo: true }).eq('escolinha_id', esc.id).select();
      expect(data ?? []).toEqual([]);
    });
  });
});
