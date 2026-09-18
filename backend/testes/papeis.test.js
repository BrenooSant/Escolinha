/* Gestor × professor. O professor faz agenda, chamada e avaliação e lê
   o cadastro para trabalhar — mas não vê dinheiro nenhum, não mexe em
   cadastro e não chega ao link do portal, que mostra as mensalidades.
   O único sinal financeiro que ele recebe é "este atleta está em atraso". */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apagarEscolinha, clienteAnonimo, configurado, emDias, entrar, hoje, idDoUsuario,
  novaEscolinha, novoAluno, novoResponsavel, novoTreino, pngMinimo,
} from './ajuda.js';

describe.skipIf(!configurado)('gestor e professor', () => {
  let gestor, professor, idProfessor, esc, turma, resp, devendo, emDia, mensalidade;

  beforeAll(async () => {
    gestor = await entrar('dono');
    professor = await entrar('colega');
    idProfessor = await idDoUsuario(professor);
    esc = await novaEscolinha(gestor, 'papeis');
    turma = esc.turmas[0];

    const { error } = await gestor
      .from('membros')
      .insert({ escolinha_id: esc.id, perfil_id: idProfessor, papel: 'professor' });
    if (error) throw new Error('pôr o professor na equipe: ' + error.message);

    resp = await novoResponsavel(gestor, {
      escolinhaId: esc.id, nome: 'Carla Menezes', telefone: '(62) 98888-1234',
    });
    devendo = await novoAluno(gestor, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Davi Menezes', numero: 9, responsavel_id: resp.id,
    });
    emDia = await novoAluno(gestor, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Enzo Prado', numero: 10,
    });

    // vencida há 20 dias: passa de qualquer tolerância padrão
    const venc = emDias(-20);
    const { data: m, error: e2 } = await gestor
      .from('mensalidades')
      .insert({
        escolinha_id: esc.id, aluno_id: devendo.id, competencia: venc.slice(0, 8) + '01',
        valor_centavos: 15000, vencimento: venc,
      })
      .select()
      .single();
    if (e2) throw new Error('mensalidade: ' + e2.message);
    mensalidade = m;

    await gestor.from('lancamentos').insert({
      escolinha_id: esc.id, descricao: 'Bolas novas', tipo: 'saida', valor_centavos: 32000,
    });
    await gestor.from('convites').insert({ escolinha_id: esc.id, papel: 'dono' });
  });

  afterAll(async () => {
    await gestor.from('membros').delete().eq('escolinha_id', esc?.id).eq('perfil_id', idProfessor);
    await apagarEscolinha(gestor, esc?.id);
  });

  describe('o professor lê o que precisa para trabalhar', () => {
    it('atletas, turmas e contato do responsável', async () => {
      const { data: alunos } = await professor
        .from('vw_alunos').select('nome, responsavel_telefone').eq('escolinha_id', esc.id).order('nome');
      expect(alunos.map((a) => a.nome)).toEqual(['Davi Menezes', 'Enzo Prado']);
      expect(alunos[0].responsavel_telefone).toBe('(62) 98888-1234');

      const { data: turmas } = await professor.from('vw_turmas').select('id').eq('escolinha_id', esc.id);
      expect(turmas.length).toBeGreaterThan(0);
    });

    it('faz a chamada', async () => {
      const treino = await novoTreino(gestor, { escolinhaId: esc.id, turmaId: turma.id, data: hoje() });
      const { error } = await professor.rpc('salvar_chamada', {
        p_treino: treino.id,
        p_marcas: [
          { aluno_id: devendo.id, marca: 'P' },
          { aluno_id: emDia.id, marca: 'F' },
        ],
      });
      expect(error).toBeNull();

      const { data } = await professor.from('presencas').select('marca').eq('treino_id', treino.id);
      expect(data).toHaveLength(2);
    });

    it('agenda treino', async () => {
      const { error } = await professor
        .from('treinos')
        .insert({ escolinha_id: esc.id, turma_id: turma.id, data: emDias(3), hora: '17:00' });
      expect(error).toBeNull();
    });
  });

  describe('o professor não vê dinheiro', () => {
    it.each(['mensalidades', 'vw_mensalidades', 'lancamentos', 'lembretes'])('%s volta vazio', async (t) => {
      const { data, error } = await professor.from(t).select('id').eq('escolinha_id', esc.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('não dá baixa em mensalidade', async () => {
      await professor.rpc('registrar_pagamento', { p_mensalidade: mensalidade.id, p_metodo: 'pix' });
      const { data } = await gestor.from('mensalidades').select('status').eq('id', mensalidade.id).single();
      expect(data.status).toBe('aberta');
    });

    it('não gera mensalidades', async () => {
      await professor.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: null });
      const { data } = await gestor.from('mensalidades').select('id').eq('escolinha_id', esc.id);
      expect(data).toHaveLength(1);
    });

    it('não chega ao token do portal', async () => {
      const direto = await professor.from('responsaveis').select('token').eq('id', resp.id);
      expect(direto.error).toBeTruthy();

      const { data } = await professor.rpc('token_responsavel', { p_responsavel: resp.id });
      expect(data).toBeNull();

      const troca = await professor.rpc('trocar_token_responsavel', { p_responsavel: resp.id });
      expect(troca.error).toBeTruthy();
    });

    it('não vê convites — nem o de gestor pendente', async () => {
      const { data } = await professor.from('convites').select('token').eq('escolinha_id', esc.id);
      expect(data).toEqual([]);
    });

    it('não vê pré-matrículas', async () => {
      const anon = clienteAnonimo();
      await anon.rpc('enviar_pre_matricula', {
        p_codigo: esc.escolinha.codigo_matricula,
        p_dados: { aluno_nome: 'Ficha de Teste', resp_nome: 'Mãe de Teste', resp_telefone: '(62) 97777-0000' },
      });
      const { data: doGestor } = await gestor.from('pre_matriculas').select('id').eq('escolinha_id', esc.id);
      expect(doGestor.length).toBeGreaterThan(0);

      const { data } = await professor.from('pre_matriculas').select('id').eq('escolinha_id', esc.id);
      expect(data).toEqual([]);
    });
  });

  describe('o professor não mexe no cadastro', () => {
    it('não matricula atleta', async () => {
      const { error } = await professor
        .from('alunos').insert({ escolinha_id: esc.id, turma_id: turma.id, nome: 'Intruso' });
      expect(error).toBeTruthy();
    });

    it('não edita atleta nem turma', async () => {
      const a = await professor.from('alunos').update({ nome: 'Trocado' }).eq('id', emDia.id).select();
      expect(a.data).toEqual([]);

      const t = await professor.from('turmas').update({ mensalidade_centavos: 1 }).eq('id', turma.id).select();
      expect(t.data).toEqual([]);
    });

    it('não troca a foto', async () => {
      const { error } = await professor.storage
        .from('fotos')
        .upload(`${esc.id}/${emDia.id}.png`, pngMinimo(), { contentType: 'image/png', upsert: true });
      expect(error).toBeTruthy();
    });

    it('não muda os dados da escolinha', async () => {
      const { data } = await professor
        .from('escolinhas').update({ tolerancia_atraso: 0 }).eq('id', esc.id).select();
      expect(data).toEqual([]);
    });
  });

  describe('aviso de pagamento em atraso', () => {
    it('o professor recebe só os ids de quem está em atraso', async () => {
      const { data, error } = await professor.rpc('alunos_em_atraso', { p_escolinha: esc.id });
      expect(error).toBeNull();
      expect(data).toEqual([devendo.id]);
    });

    it('respeita a tolerância da escolinha', async () => {
      await gestor.from('escolinhas').update({ tolerancia_atraso: 30 }).eq('id', esc.id);
      const { data } = await professor.rpc('alunos_em_atraso', { p_escolinha: esc.id });
      expect(data).toEqual([]);

      await gestor.from('escolinhas').update({ tolerancia_atraso: 5 }).eq('id', esc.id);
    });

    it('aparece no portal do responsável', async () => {
      const { data: token } = await gestor.rpc('token_responsavel', { p_responsavel: resp.id });
      expect(token).toMatch(/^[0-9a-f]{32}$/);

      const { data } = await clienteAnonimo().rpc('portal_responsavel', { p_token: token });
      expect(data.filhos[0].em_atraso).toBe(true);
    });

    it('some depois que o gestor dá baixa', async () => {
      await gestor.rpc('registrar_pagamento', { p_mensalidade: mensalidade.id, p_metodo: 'pix' });
      const { data } = await professor.rpc('alunos_em_atraso', { p_escolinha: esc.id });
      expect(data).toEqual([]);
    });

    it('quem não é da escolinha não recebe nada', async () => {
      await gestor.rpc('estornar_pagamento', { p_mensalidade: mensalidade.id });
      await gestor.from('membros').delete().eq('escolinha_id', esc.id).eq('perfil_id', idProfessor);

      const { data } = await professor.rpc('alunos_em_atraso', { p_escolinha: esc.id });
      expect(data).toEqual([]);
    });
  });

  describe('o gestor continua com tudo', () => {
    it('vê valores e o link do portal na lista de mensalidades', async () => {
      const { data } = await gestor
        .from('vw_mensalidades').select('valor_centavos, responsavel_token').eq('id', mensalidade.id).single();
      expect(data.valor_centavos).toBe(15000);
      expect(data.responsavel_token).toMatch(/^[0-9a-f]{32}$/);
    });
  });
});
