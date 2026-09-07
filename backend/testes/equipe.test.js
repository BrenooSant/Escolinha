/* Convite de professor e papéis. A escolinha não pode ficar sem dono,
   e um professor comum não pode se promover sozinho. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apagarEscolinha, configurado, entrar, idDoUsuario, novaEscolinha, novoAluno } from './ajuda.js';

describe.skipIf(!configurado)('equipe e convites', () => {
  let dono, colega, esc, idDono, idColega, convite;

  beforeAll(async () => {
    dono = await entrar('dono');
    colega = await entrar('colega');
    idDono = await idDoUsuario(dono);
    idColega = await idDoUsuario(colega);
    esc = await novaEscolinha(dono, 'equipe');
    await novoAluno(dono, { escolinhaId: esc.id, turmaId: esc.turmas[0].id, nome: 'Atleta da Casa', numero: 4 });
  });

  afterAll(async () => {
    // o dono precisa continuar dono para conseguir apagar a escolinha
    await dono.from('membros').delete().eq('escolinha_id', esc?.id).eq('perfil_id', idColega);
    await apagarEscolinha(dono, esc?.id);
  });

  it('o dono cria o convite', async () => {
    const { data, error } = await dono
      .from('convites')
      .insert({ escolinha_id: esc.id, email: 'colega@exemplo.com' })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.token).toMatch(/^[0-9a-f]{32}$/);
    convite = data;
  });

  it('o convidado lê o convite antes de aceitar', async () => {
    const { data } = await colega.rpc('convite_por_token', { p_token: convite.token });
    expect(data.escolinha).toBe(esc.nome);
    expect(data.papel).toBe('professor');
    expect(data.aceito).toBe(false);
    expect(data.expirado).toBe(false);
    expect(data.ja_e_membro).toBe(false);
  });

  it('antes de aceitar, não enxerga nada da escolinha', async () => {
    const { data } = await colega.from('vw_alunos').select('id').eq('escolinha_id', esc.id);
    expect(data).toEqual([]);
  });

  it('aceitar coloca na equipe e abre o acesso', async () => {
    const { data: id } = await colega.rpc('aceitar_convite', { p_token: convite.token });
    expect(id).toBe(esc.id);

    const { data: alunos } = await colega.from('vw_alunos').select('nome').eq('escolinha_id', esc.id);
    expect(alunos.map((a) => a.nome)).toContain('Atleta da Casa');
  });

  it('o convite serve uma vez só', async () => {
    const { error } = await colega.rpc('aceitar_convite', { p_token: convite.token });
    expect(error?.message ?? '').toMatch(/já foi usado/i);
  });

  it('token de convite inexistente devolve nulo', async () => {
    const { data } = await colega.rpc('convite_por_token', { p_token: 'naoexiste' });
    expect(data).toBeNull();
  });

  it('professor comum não convida ninguém', async () => {
    const { error } = await colega
      .from('convites')
      .insert({ escolinha_id: esc.id, email: 'mais.um@exemplo.com' })
      .select()
      .single();
    expect(error).toBeTruthy();
  });

  it('professor comum não se promove a dono', async () => {
    const { data } = await colega
      .from('membros')
      .update({ papel: 'dono' })
      .eq('escolinha_id', esc.id)
      .eq('perfil_id', idColega)
      .select();
    expect(data).toEqual([]);
  });

  it('o último dono não consegue sair', async () => {
    const { error } = await dono
      .from('membros').delete().eq('escolinha_id', esc.id).eq('perfil_id', idDono).select();
    expect(error?.message ?? '').toMatch(/pelo menos um dono/i);
  });

  it('o último dono não consegue se rebaixar', async () => {
    const { error } = await dono
      .from('membros')
      .update({ papel: 'professor' })
      .eq('escolinha_id', esc.id)
      .eq('perfil_id', idDono)
      .select();
    expect(error?.message ?? '').toMatch(/pelo menos um dono/i);
  });

  it('com dois donos, um pode sair', async () => {
    await dono.from('membros').update({ papel: 'dono' }).eq('escolinha_id', esc.id).eq('perfil_id', idColega);

    const { data, error } = await colega
      .from('membros').delete().eq('escolinha_id', esc.id).eq('perfil_id', idColega).select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    // e volta, para os testes seguintes continuarem com dois
    await dono.from('membros').insert({ escolinha_id: esc.id, perfil_id: idColega, papel: 'professor' });
  });

  it('o dono remove alguém da equipe', async () => {
    const { data } = await dono
      .from('membros').delete().eq('escolinha_id', esc.id).eq('perfil_id', idColega).select();
    expect(data).toHaveLength(1);

    const { data: alunos } = await colega.from('vw_alunos').select('id').eq('escolinha_id', esc.id);
    expect(alunos).toEqual([]);
  });

  it('apagar a escolinha funciona mesmo com o gatilho do último dono', async () => {
    const descartavel = await novaEscolinha(dono, 'descartavel');
    await apagarEscolinha(dono, descartavel.id);

    const { data } = await dono.from('escolinhas').select('id').eq('id', descartavel.id);
    expect(data).toEqual([]);
  });
});
