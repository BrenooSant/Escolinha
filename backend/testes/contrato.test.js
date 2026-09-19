/* Contrato online. O aceite vale como prova se guardar exatamente o que
   a pessoa leu — por isso o texto é montado no banco nas duas pontas, e
   o aceite de um texto diferente da prévia é recusado. */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apagarEscolinha, clienteAnonimo, configurado, entrar, idDoUsuario, novaEscolinha, novoAluno,
  novoResponsavel,
} from './ajuda.js';

const sha256 = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const CPF = '529.982.247-25';

const MODELO =
  'CONTRATO entre {{escolinha}} ({{documento_escolinha}}) e {{responsavel}}, CPF {{cpf_responsavel}}, ' +
  'responsável por {{aluno}}, nascido em {{nascimento}}, na turma {{turma}}. Mensalidade de {{mensalidade}}, ' +
  'vencendo todo dia {{vencimento}}; taxa de matrícula {{taxa_matricula}}; multa de {{multa}} e juros de {{juros}}. ' +
  '{{cidade}}, {{data}}.';

describe.skipIf(!configurado)('contrato online', () => {
  let gestor, professor, idProfessor, anon, esc, turma, codigo;

  const ficha = (extra = {}) => ({
    aluno_nome: 'Lara Menezes', nascimento: '2015-06-01', turma_id: turma.id,
    resp_nome: 'Paula Menezes', resp_telefone: '(62) 98877-6655', resp_cpf: CPF, ...extra,
  });

  beforeAll(async () => {
    gestor = await entrar('dono');
    professor = await entrar('colega');
    idProfessor = await idDoUsuario(professor);
    anon = clienteAnonimo();
    esc = await novaEscolinha(gestor, 'contrato');
    turma = esc.turmas[0];
    codigo = esc.escolinha.codigo_matricula;
    await gestor.from('membros').insert({ escolinha_id: esc.id, perfil_id: idProfessor, papel: 'professor' });
    await gestor.from('escolinhas').update({ documento: '11222333000181' }).eq('id', esc.id);
  });

  afterAll(async () => {
    await gestor.from('membros').delete().eq('escolinha_id', esc?.id).eq('perfil_id', idProfessor);
    await apagarEscolinha(gestor, esc?.id);
  });

  it('sem contrato, o link não pede e a ficha entra como antes', async () => {
    const { data } = await anon.rpc('escolinha_publica', { p_codigo: codigo });
    expect(data.exige_contrato).toBe(false);
    const { error } = await anon.rpc('enviar_pre_matricula', {
      p_codigo: codigo, p_dados: ficha({ aluno_nome: 'Sem Contrato', resp_cpf: null }),
    });
    expect(error).toBeNull();
  });

  it('o gestor cria a versão 1; o professor nem lê nem cria', async () => {
    const { data, error } = await gestor
      .from('contratos_modelo').insert({ escolinha_id: esc.id, texto: MODELO }).select().single();
    expect(error).toBeNull();
    expect(data.versao).toBe(1);

    const lido = await professor.from('contratos_modelo').select('id').eq('escolinha_id', esc.id);
    expect(lido.data).toEqual([]);
    const criado = await professor.from('contratos_modelo').insert({ escolinha_id: esc.id, texto: MODELO });
    expect(criado.error).toBeTruthy();
  });

  it('a prévia do gestor preenche os campos; a do professor é recusada', async () => {
    const { data } = await gestor.rpc('previa_contrato', { p_escolinha: esc.id, p_texto: MODELO });
    expect(data).toContain('11.222.333/0001-81');
    expect(data).toContain('529.982.247-25');
    expect(data).not.toContain('{{');

    const { error } = await professor.rpc('previa_contrato', { p_escolinha: esc.id, p_texto: MODELO });
    expect(error).toBeTruthy();
  });

  it('só passa a pedir quando o gestor liga', async () => {
    expect((await anon.rpc('escolinha_publica', { p_codigo: codigo })).data.exige_contrato).toBe(false);
    await gestor.from('escolinhas').update({ exige_contrato: true }).eq('id', esc.id);
    expect((await anon.rpc('escolinha_publica', { p_codigo: codigo })).data.exige_contrato).toBe(true);
  });

  describe('pelo link de matrícula', () => {
    let previa;

    it('a prévia vem com os dados da ficha', async () => {
      const { data } = await anon.rpc('contrato_publico', { p_codigo: codigo, p_dados: ficha() });
      previa = data;
      expect(data.texto).toContain('Lara Menezes');
      expect(data.texto).toContain('nascido em 01/06/2015');
      expect(data.texto).toContain(`na turma ${turma.nome}`);
      expect(data.texto).toMatch(/Mensalidade de R\$ \d/);
      expect(data.hash).toBe(sha256(data.texto));
    });

    it('sem aceite, a ficha não entra', async () => {
      const { error } = await anon.rpc('enviar_pre_matricula', { p_codigo: codigo, p_dados: ficha() });
      expect(error?.message ?? '').toMatch(/aceite o contrato/i);
    });

    it('CPF inválido não entra', async () => {
      const { error } = await anon.rpc('enviar_pre_matricula', {
        p_codigo: codigo,
        p_dados: ficha({ resp_cpf: '529.982.247-24', contrato_aceito: true, contrato_hash: previa.hash }),
      });
      expect(error?.message ?? '').toMatch(/CPF/);
    });

    it('texto diferente do que foi lido é recusado', async () => {
      const { error } = await anon.rpc('enviar_pre_matricula', {
        p_codigo: codigo,
        p_dados: ficha({ aluno_nome: 'Outro Nome', contrato_aceito: true, contrato_hash: previa.hash }),
      });
      expect(error?.message ?? '').toMatch(/atualizado/i);
    });

    it('com aceite, grava a prova junto com a ficha', async () => {
      const { error } = await anon.rpc('enviar_pre_matricula', {
        p_codigo: codigo, p_dados: ficha({ contrato_aceito: true, contrato_hash: previa.hash }),
      });
      expect(error).toBeNull();

      const { data } = await gestor
        .from('contratos_aceites').select('*').eq('escolinha_id', esc.id).eq('origem', 'matricula').single();
      expect(data.texto).toBe(previa.texto);
      expect(data.hash).toBe(sha256(data.texto));
      expect(data.assinante_cpf).toBe('52998224725');
      expect(data.assinante_nome).toBe('Paula Menezes');
      expect(data.pre_matricula_id).toBeTruthy();
      expect(data.aluno_id).toBeNull();
    });

    it('aprovar a ficha leva o aceite para o atleta', async () => {
      const { data: pm } = await gestor
        .from('pre_matriculas').select('id').eq('escolinha_id', esc.id).eq('aluno_nome', 'Lara Menezes').single();
      const { data: alunoId } = await gestor.rpc('aprovar_pre_matricula', { p_id: pm.id });

      const { data: aceite } = await gestor.from('contratos_aceites').select('aluno_id').eq('pre_matricula_id', pm.id).single();
      expect(aceite.aluno_id).toBe(alunoId);

      const { data: vw } = await gestor.from('vw_alunos').select('contrato_assinado').eq('id', alunoId).single();
      expect(vw.contrato_assinado).toBe(true);
    });

    it('contrato trocado no meio da leitura: a prévia antiga não vale mais', async () => {
      await gestor.from('contratos_modelo').insert({ escolinha_id: esc.id, texto: MODELO + ' Cláusula nova.' });
      const { error } = await anon.rpc('enviar_pre_matricula', {
        p_codigo: codigo,
        p_dados: ficha({ aluno_nome: 'Lara Menezes Dois', contrato_aceito: true, contrato_hash: previa.hash }),
      });
      expect(error?.message ?? '').toMatch(/atualizado/i);
    });
  });

  describe('pelo portal, para quem já é aluno', () => {
    let resp, aluno, token, previa;

    beforeAll(async () => {
      resp = await novoResponsavel(gestor, { escolinhaId: esc.id, nome: 'Roberto Lima', telefone: '(62) 97777-1212' });
      aluno = await novoAluno(gestor, {
        escolinhaId: esc.id, turmaId: turma.id, nome: 'Davi Lima', numero: 21, responsavel_id: resp.id,
      });
      token = (await gestor.rpc('token_responsavel', { p_responsavel: resp.id })).data;
    });

    it('o portal mostra o contrato pendente', async () => {
      const { data } = await anon.rpc('portal_responsavel', { p_token: token });
      expect(data.filhos[0].id).toBe(aluno.id);
      expect(data.filhos[0].contrato.status).toBe('pendente');
    });

    it('a prévia usa os dados do atleta e o CPF digitado', async () => {
      const { data } = await anon.rpc('contrato_portal', {
        p_token: token, p_aluno: aluno.id, p_nome: 'Roberto Lima', p_cpf: CPF,
      });
      previa = data;
      expect(data.texto).toContain('Davi Lima');
      expect(data.texto).toContain('529.982.247-25');
      expect(data.texto).toContain('Cláusula nova.');
    });

    it('o token de um responsável não assina pelo filho de outro', async () => {
      const outro = await novoResponsavel(gestor, { escolinhaId: esc.id, nome: 'Outro Pai', telefone: '(62) 90000-3434' });
      const t = (await gestor.rpc('token_responsavel', { p_responsavel: outro.id })).data;
      const { error } = await anon.rpc('contrato_portal', { p_token: t, p_aluno: aluno.id, p_nome: 'X', p_cpf: CPF });
      expect(error).toBeTruthy();
    });

    it('aceita, e o portal passa a mostrar assinado', async () => {
      const { data, error } = await anon.rpc('aceitar_contrato_portal', {
        p_token: token, p_aluno: aluno.id, p_nome: 'Roberto Lima', p_cpf: CPF, p_hash: previa.hash,
      });
      expect(error).toBeNull();
      expect(data.ja_assinado).toBe(false);

      const portal = (await anon.rpc('portal_responsavel', { p_token: token })).data;
      expect(portal.filhos[0].contrato.status).toBe('assinado');
    });

    it('aceitar de novo não duplica', async () => {
      const { data } = await anon.rpc('aceitar_contrato_portal', {
        p_token: token, p_aluno: aluno.id, p_nome: 'Roberto Lima', p_cpf: CPF, p_hash: previa.hash,
      });
      expect(data.ja_assinado).toBe(true);
      const { data: todos } = await gestor.from('contratos_aceites').select('id').eq('aluno_id', aluno.id);
      expect(todos).toHaveLength(1);
    });
  });

  describe('a prova não se mexe', () => {
    it('nem o gestor edita ou apaga um aceite', async () => {
      const { data: um } = await gestor.from('contratos_aceites').select('id').eq('escolinha_id', esc.id).limit(1).single();
      const ed = await gestor.from('contratos_aceites').update({ assinante_nome: 'Trocado' }).eq('id', um.id).select();
      expect(ed.data ?? []).toEqual([]);
      const ap = await gestor.from('contratos_aceites').delete().eq('id', um.id).select();
      expect(ap.data ?? []).toEqual([]);
    });

    it('nem edita uma versão já publicada do modelo', async () => {
      const { data } = await gestor.from('contratos_modelo').update({ texto: MODELO + ' mudado' }).eq('escolinha_id', esc.id).select();
      expect(data ?? []).toEqual([]);
    });

    it('o professor não lê aceite nenhum (tem CPF)', async () => {
      const { data } = await professor.from('contratos_aceites').select('id').eq('escolinha_id', esc.id);
      expect(data).toEqual([]);
    });

    it('o anônimo não lê as tabelas', async () => {
      const { data, error } = await anon.from('contratos_aceites').select('id').limit(1);
      expect(error || data?.length === 0).toBeTruthy();
    });
  });
});
