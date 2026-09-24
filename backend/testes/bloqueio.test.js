/* Bloqueio por inadimplência.

   O aviso "pagamento em atraso" já existia. Aqui o que se testa é o
   passo seguinte: a escolinha pode recusar a presença de quem está
   devendo — e essa recusa tem que morar no banco, porque o professor
   não lê mensalidades e a tela dele nunca saberia sozinha quem deve. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apagarEscolinha, configurado, emDias, entrar, hoje, idDoUsuario, novaEscolinha, novoAluno,
  novoTreino,
} from './ajuda.js';

describe.skipIf(!configurado)('bloqueio por inadimplência', () => {
  let gestor, professor, idProfessor, esc, turma, devendo, emDia, treino;

  const modo = async (bloqueio_inadimplencia, dias_bloqueio = 30) => {
    const { error } = await gestor
      .from('escolinhas')
      .update({ bloqueio_inadimplencia, dias_bloqueio })
      .eq('id', esc.id);
    if (error) throw new Error('mudar o modo: ' + error.message);
  };

  const chamar = (sb, treinoId, marcas) =>
    sb.rpc('salvar_chamada', { p_treino: treinoId, p_marcas: marcas });

  const presente = (id) => [{ aluno_id: id, marca: 'P' }];

  beforeAll(async () => {
    gestor = await entrar('dono');
    professor = await entrar('colega');
    idProfessor = await idDoUsuario(professor);
    esc = await novaEscolinha(gestor, 'bloqueio');
    turma = esc.turmas[0];

    const { error } = await gestor
      .from('membros')
      .insert({ escolinha_id: esc.id, perfil_id: idProfessor, papel: 'professor' });
    if (error) throw new Error('pôr o professor na equipe: ' + error.message);

    devendo = await novoAluno(gestor, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Davi Devedor', numero: 9,
    });
    emDia = await novoAluno(gestor, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Enzo Em Dia', numero: 10,
    });

    // vencida há 60 dias: passa de qualquer dias_bloqueio usado aqui
    const venc = emDias(-60);
    const { error: e2 } = await gestor.from('mensalidades').insert({
      escolinha_id: esc.id, aluno_id: devendo.id, competencia: venc.slice(0, 8) + '01',
      valor_centavos: 15000, vencimento: venc,
    });
    if (e2) throw new Error('mensalidade: ' + e2.message);

    treino = await novoTreino(gestor, { escolinhaId: esc.id, turmaId: turma.id, data: hoje() });
  });

  afterAll(async () => {
    await gestor.from('membros').delete().eq('escolinha_id', esc?.id).eq('perfil_id', idProfessor);
    await apagarEscolinha(gestor, esc?.id);
  });

  describe('nasce desligado', () => {
    it('a escolinha nova só avisa', async () => {
      const { data } = await gestor.from('escolinhas').select('bloqueio_inadimplencia, dias_bloqueio')
        .eq('id', esc.id).single();
      expect(data.bloqueio_inadimplencia).toBe('avisar');
      expect(data.dias_bloqueio).toBe(30);
    });

    it('avisando, ninguém aparece como bloqueado', async () => {
      await modo('avisar');
      const { data } = await professor.rpc('alunos_bloqueados', { p_escolinha: esc.id });
      expect(data).toEqual([]);
    });

    it('avisando, o devedor pode ser marcado presente', async () => {
      await modo('avisar');
      const { error } = await chamar(gestor, treino.id, presente(devendo.id));
      expect(error).toBeNull();
    });
  });

  describe('impedir', () => {
    beforeAll(() => modo('impedir'));

    it('o professor recebe o id do bloqueado, sem ler mensalidade', async () => {
      const { data } = await professor.rpc('alunos_bloqueados', { p_escolinha: esc.id });
      expect(data).toEqual([devendo.id]);

      const { data: m } = await professor.from('mensalidades').select('id').eq('escolinha_id', esc.id);
      expect(m ?? []).toEqual([]);
    });

    it('quem está em dia nunca é bloqueado', async () => {
      const { data } = await gestor.rpc('alunos_bloqueados', { p_escolinha: esc.id });
      expect(data).not.toContain(emDia.id);
    });

    it('presença do bloqueado é recusada, com o nome dele na mensagem', async () => {
      const { error } = await chamar(professor, treino.id, presente(devendo.id));
      expect(error).not.toBeNull();
      expect(error.message).toContain('Davi Devedor');
    });

    it('nem o gestor marca presente — neste modo não há liberação', async () => {
      const { error } = await chamar(gestor, treino.id, presente(devendo.id));
      expect(error).not.toBeNull();
    });

    it('falta e justificada passam: elas dizem que ele não treinou', async () => {
      const { error } = await chamar(professor, treino.id, [
        { aluno_id: devendo.id, marca: 'F' },
        { aluno_id: emDia.id, marca: 'P' },
      ]);
      expect(error).toBeNull();
    });

    it('a chamada do resto da turma não é travada por causa dele', async () => {
      const { data, error } = await chamar(gestor, treino.id, [
        { aluno_id: devendo.id, marca: 'J', motivo: 'Viagem' },
        { aluno_id: emDia.id, marca: 'P' },
      ]);
      expect(error).toBeNull();
      expect(data).toBe(2);
    });
  });

  describe('liberar com motivo', () => {
    beforeAll(async () => {
      await modo('liberar_com_motivo');
      await gestor.from('liberacoes').delete().eq('treino_id', treino.id);
    });

    it('sem liberação, a presença é recusada', async () => {
      const { error } = await chamar(professor, treino.id, presente(devendo.id));
      expect(error).not.toBeNull();
      expect(error.message).toContain('gestor');
    });

    it('o professor não libera', async () => {
      const { error } = await professor.rpc('liberar_atleta', {
        p_treino: treino.id, p_aluno: devendo.id, p_motivo: 'deixa ele jogar',
      });
      expect(error).not.toBeNull();

      const { data } = await gestor.from('liberacoes').select('id').eq('treino_id', treino.id);
      expect(data ?? []).toEqual([]);
    });

    it('o gestor precisa escrever um motivo', async () => {
      const { error } = await gestor.rpc('liberar_atleta', {
        p_treino: treino.id, p_aluno: devendo.id, p_motivo: '  ',
      });
      expect(error).not.toBeNull();
    });

    it('liberado pelo gestor, o professor consegue marcar presente', async () => {
      const { error: e1 } = await gestor.rpc('liberar_atleta', {
        p_treino: treino.id, p_aluno: devendo.id, p_motivo: 'Pai disse que paga na sexta',
      });
      expect(e1).toBeNull();

      const { error } = await chamar(professor, treino.id, presente(devendo.id));
      expect(error).toBeNull();
    });

    it('a liberação guarda quem liberou e o motivo', async () => {
      const { data } = await gestor
        .from('liberacoes').select('motivo, liberado_por').eq('treino_id', treino.id).single();
      expect(data.motivo).toBe('Pai disse que paga na sexta');
      expect(data.liberado_por).toBe(await idDoUsuario(gestor));
    });

    it('vale só para aquele treino — no seguinte, bloqueia de novo', async () => {
      const outro = await novoTreino(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, data: emDias(1), hora: '19:00',
      });
      const { error } = await chamar(professor, outro.id, presente(devendo.id));
      expect(error).not.toBeNull();
      await gestor.from('treinos').delete().eq('id', outro.id);
    });
  });

  describe('quando o bloqueio sai', () => {
    it('dias_bloqueio maior que o atraso não bloqueia', async () => {
      await modo('impedir', 90); // devendo há 60
      const { data } = await gestor.rpc('alunos_bloqueados', { p_escolinha: esc.id });
      expect(data).toEqual([]);
    });

    it('pagou, o bloqueio some na hora', async () => {
      await modo('impedir', 30);
      const { data: antes } = await gestor.rpc('alunos_bloqueados', { p_escolinha: esc.id });
      expect(antes).toEqual([devendo.id]);

      await gestor.from('mensalidades').update({ status: 'paga' }).eq('aluno_id', devendo.id);

      const { data: depois } = await gestor.rpc('alunos_bloqueados', { p_escolinha: esc.id });
      expect(depois).toEqual([]);

      const { error } = await chamar(professor, treino.id, presente(devendo.id));
      expect(error).toBeNull();

      await gestor.from('mensalidades').update({ status: 'aberta' }).eq('aluno_id', devendo.id);
    });
  });

  describe('coerência da configuração', () => {
    it('não dá para bloquear antes de avisar', async () => {
      const { error } = await gestor
        .from('escolinhas')
        .update({ tolerancia_atraso: 30, dias_bloqueio: 10 })
        .eq('id', esc.id);
      expect(error).not.toBeNull();
    });

    it('quem não é da escolinha não descobre quem está bloqueado', async () => {
      await gestor.from('membros').delete().eq('escolinha_id', esc.id).eq('perfil_id', idProfessor);
      const { data } = await professor.rpc('alunos_bloqueados', { p_escolinha: esc.id });
      expect(data ?? []).toEqual([]);

      await gestor
        .from('membros')
        .insert({ escolinha_id: esc.id, perfil_id: idProfessor, papel: 'professor' });
    });
  });
});
