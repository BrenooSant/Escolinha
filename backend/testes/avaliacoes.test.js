/* Avaliação técnica: notas por quesito, média e evolução. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apagarEscolinha, configurado, entrar, hoje, novaEscolinha, novoAluno } from './ajuda.js';

describe.skipIf(!configurado)('avaliação técnica', () => {
  let sb, esc, aluno, quesitos, avaliacaoId;

  beforeAll(async () => {
    sb = await entrar('dono');
    esc = await novaEscolinha(sb, 'avaliacao');
    aluno = await novoAluno(sb, {
      escolinhaId: esc.id, turmaId: esc.turmas[0].id, nome: 'Atleta Avaliado', numero: 10,
    });
    const { data } = await sb
      .from('quesitos_avaliacao').select('*').eq('escolinha_id', esc.id).order('ordem');
    quesitos = data;
  });

  afterAll(async () => { await apagarEscolinha(sb, esc?.id); });

  it('a escolinha nasce com os seis quesitos padrão', () => {
    expect(quesitos).toHaveLength(6);
    expect(quesitos.map((q) => q.nome)).toContain('Finalização');
  });

  it('grava as notas e calcula a média', async () => {
    const { data: id } = await sb.rpc('salvar_avaliacao', {
      p_aluno: aluno.id,
      p_data: '2026-08-01',
      p_notas: quesitos.slice(0, 4).map((q) => ({ quesito_id: q.id, nota: 3 })),
      p_observacao: 'Base boa, falta ritmo.',
    });
    expect(id).toBeTruthy();

    const { data } = await sb.from('vw_avaliacoes').select('*').eq('id', id).single();
    expect(Number(data.media)).toBe(3);
    expect(data.notas).toHaveLength(4);
    expect(data.avaliador_nome).toBeTruthy();
  });

  it('uma segunda avaliação convive com a primeira', async () => {
    const { data: id } = await sb.rpc('salvar_avaliacao', {
      p_aluno: aluno.id,
      p_data: hoje(),
      p_notas: quesitos.slice(0, 4).map((q) => ({ quesito_id: q.id, nota: 4 })),
      p_observacao: 'Evoluiu no passe.',
    });
    avaliacaoId = id;

    const { data } = await sb
      .from('vw_avaliacoes').select('*').eq('aluno_id', aluno.id).order('data', { ascending: false });
    expect(data).toHaveLength(2);
    expect(Number(data[0].media)).toBe(4);
    expect(Number(data[1].media)).toBe(3);
  });

  it('reeditar troca as notas em vez de somar outras', async () => {
    await sb.rpc('salvar_avaliacao', {
      p_aluno: aluno.id,
      p_data: hoje(),
      p_notas: quesitos.slice(0, 2).map((q) => ({ quesito_id: q.id, nota: 5 })),
      p_id: avaliacaoId,
    });

    const { data } = await sb.from('vw_avaliacoes').select('*').eq('id', avaliacaoId).single();
    expect(data.notas).toHaveLength(2);
    expect(Number(data.media)).toBe(5);
  });

  it('quesito sem nota fica de fora', async () => {
    const { data: id } = await sb.rpc('salvar_avaliacao', {
      p_aluno: aluno.id,
      p_data: '2026-07-01',
      p_notas: [
        { quesito_id: quesitos[0].id, nota: 5 },
        { quesito_id: quesitos[1].id, nota: null },
      ],
    });

    const { data } = await sb.from('vw_avaliacoes').select('*').eq('id', id).single();
    expect(data.notas).toHaveLength(1);
  });

  it('nota fora da escala é recusada', async () => {
    const { error } = await sb.rpc('salvar_avaliacao', {
      p_aluno: aluno.id,
      p_data: '2026-06-01',
      p_notas: [{ quesito_id: quesitos[0].id, nota: 9 }],
    });
    expect(error).toBeTruthy();
  });

  it('apagar o quesito tira a nota das avaliações', async () => {
    const { data: novo } = await sb
      .from('quesitos_avaliacao')
      .insert({ escolinha_id: esc.id, nome: 'Cabeceio', ordem: 9 })
      .select()
      .single();

    const { data: id } = await sb.rpc('salvar_avaliacao', {
      p_aluno: aluno.id,
      p_data: '2026-05-01',
      p_notas: [
        { quesito_id: quesitos[0].id, nota: 4 },
        { quesito_id: novo.id, nota: 2 },
      ],
    });
    expect((await sb.from('vw_avaliacoes').select('*').eq('id', id).single()).data.notas).toHaveLength(2);

    await sb.from('quesitos_avaliacao').delete().eq('id', novo.id);

    const { data } = await sb.from('vw_avaliacoes').select('*').eq('id', id).single();
    expect(data.notas).toHaveLength(1);
    expect(Number(data.media)).toBe(4);
  });

  it('apagar a avaliação leva as notas junto', async () => {
    await sb.from('avaliacoes').delete().eq('id', avaliacaoId);
    const { data } = await sb.from('vw_avaliacoes').select('*').eq('id', avaliacaoId);
    expect(data).toEqual([]);
  });
});
