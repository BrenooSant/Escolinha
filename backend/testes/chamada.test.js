/* Chamada e frequência. A conta é a parte do sistema que o professor
   olha todo dia, e a que mais dói se estiver errada. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apagarEscolinha, configurado, emDias, entrar, hoje, novaEscolinha, novoAluno, novoTreino,
} from './ajuda.js';

describe.skipIf(!configurado)('chamada e frequência', () => {
  let sb, esc, turma, aluno;

  const freq = async () => {
    const { data } = await sb.from('vw_alunos').select('*').eq('id', aluno.id).single();
    return data;
  };
  const marcar = (treinoId, marca, motivo = null) =>
    sb.rpc('salvar_chamada', { p_treino: treinoId, p_marcas: [{ aluno_id: aluno.id, marca, motivo }] });

  beforeAll(async () => {
    sb = await entrar('dono');
    esc = await novaEscolinha(sb, 'chamada');
    turma = esc.turmas[0];
    aluno = await novoAluno(sb, { escolinhaId: esc.id, turmaId: turma.id, nome: 'Atleta Chamada', numero: 9 });
  });

  afterAll(async () => { await apagarEscolinha(sb, esc?.id); });

  it('gera os treinos pela grade da turma, sem duplicar ao repetir', async () => {
    const { data: primeira } = await sb.rpc('gerar_treinos', {
      p_escolinha: esc.id, p_de: emDias(-7), p_ate: hoje(),
    });
    expect(primeira).toBeGreaterThan(0);

    const { data: segunda } = await sb.rpc('gerar_treinos', {
      p_escolinha: esc.id, p_de: emDias(-7), p_ate: hoje(),
    });
    expect(segunda).toBe(0);
  });

  it('salvar a chamada fecha o treino e conta a presença', async () => {
    const t = await novoTreino(sb, { escolinhaId: esc.id, turmaId: turma.id, hora: '08:00' });
    await marcar(t.id, 'P');

    const { data } = await sb.from('vw_treinos').select('*').eq('id', t.id).single();
    expect(data.status).toBe('realizado');
    expect(data.presentes).toBe(1);
    expect(await freq()).toMatchObject({ frequencia: 100, presencas: 1, treinos: 1 });
  });

  it('falta derruba o índice pela metade', async () => {
    const t = await novoTreino(sb, { escolinhaId: esc.id, turmaId: turma.id, hora: '09:00' });
    await marcar(t.id, 'F');
    expect(await freq()).toMatchObject({ frequencia: 50, faltas: 1, treinos: 2 });
  });

  it('justificada conta como presença', async () => {
    const t = await novoTreino(sb, { escolinhaId: esc.id, turmaId: turma.id, hora: '10:00' });
    await marcar(t.id, 'J', 'Atestado médico');
    expect(await freq()).toMatchObject({ frequencia: 67, justificadas: 1, treinos: 3 });
  });

  it('treino realizado sem ninguém marcado conta como falta', async () => {
    await novoTreino(sb, { escolinhaId: esc.id, turmaId: turma.id, hora: '11:00', status: 'realizado' });
    const f = await freq();
    expect(f.treinos).toBe(4);
    expect(f.frequencia).toBe(50);
  });

  it('refazer a chamada sobrescreve a marca, não soma outra', async () => {
    const t = await novoTreino(sb, { escolinhaId: esc.id, turmaId: turma.id, hora: '12:00' });
    await marcar(t.id, 'P');
    await marcar(t.id, 'F');

    const { data } = await sb.from('vw_treinos').select('*').eq('id', t.id).single();
    expect(data.presentes).toBe(0);
    expect(data.faltas).toBe(1);
    expect(data.marcados).toBe(1);
  });

  it('presença marcada antes da matrícula continua contando', async () => {
    // o corte por matriculado_em existe para não punir quem chegou depois,
    // mas não pode engolir marcação que o professor fez de propósito
    const antes = await freq();
    const t = await novoTreino(sb, {
      escolinhaId: esc.id, turmaId: turma.id, data: emDias(-30), hora: '18:30',
    });
    await marcar(t.id, 'P');

    const depois = await freq();
    expect(depois.treinos).toBe(antes.treinos + 1);
    expect(depois.presencas).toBe(antes.presencas + 1);
  });

  it('treino antigo sem marcação não vira falta retroativa', async () => {
    const antes = await freq();
    await novoTreino(sb, {
      escolinhaId: esc.id, turmaId: turma.id, data: emDias(-31), hora: '19:30', status: 'realizado',
    });
    expect((await freq()).treinos).toBe(antes.treinos);
  });

  it('atleta arquivado sai do elenco da chamada', async () => {
    const saindo = await novoAluno(sb, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Vai Sair', numero: 21,
    });
    await sb.from('alunos').update({ ativo: false }).eq('id', saindo.id);

    const { data } = await sb.from('vw_alunos').select('id').eq('turma_id', turma.id).eq('ativo', true);
    expect(data.map((a) => a.id)).not.toContain(saindo.id);
  });

  it('a camisa do arquivado volta a ficar livre', async () => {
    const { error } = await sb
      .from('alunos')
      .insert({ escolinha_id: esc.id, turma_id: turma.id, nome: 'Herdeiro da 21', numero: 21 })
      .select()
      .single();
    expect(error).toBeNull();
  });

  it('dois atletas ativos não usam a mesma camisa', async () => {
    const { error } = await sb
      .from('alunos')
      .insert({ escolinha_id: esc.id, turma_id: turma.id, nome: 'Camisa Repetida', numero: 9 })
      .select()
      .single();
    expect(error).toBeTruthy();
  });
});
