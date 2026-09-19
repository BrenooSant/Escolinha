/* CRM de leads. O funil tem de andar sozinho quando a ficha chega e
   quando ela é decidida, sem duplicar ninguém — e é só do gestor. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apagarEscolinha, clienteAnonimo, configurado, entrar, idDoUsuario, novaEscolinha } from './ajuda.js';

describe.skipIf(!configurado)('CRM de leads', () => {
  let gestor, professor, idProfessor, anon, esc, codigo;

  const lead = async (filtro) => {
    const { data } = await gestor.from('leads').select('*').eq('escolinha_id', esc.id).match(filtro);
    return data;
  };
  const notas = async (leadId) =>
    (await gestor.from('leads_notas').select('*').eq('lead_id', leadId).order('criado_em')).data;

  beforeAll(async () => {
    gestor = await entrar('dono');
    professor = await entrar('colega');
    idProfessor = await idDoUsuario(professor);
    anon = clienteAnonimo();
    esc = await novaEscolinha(gestor, 'leads');
    codigo = esc.escolinha.codigo_matricula;
    await gestor.from('membros').insert({ escolinha_id: esc.id, perfil_id: idProfessor, papel: 'professor' });
  });

  afterAll(async () => {
    await gestor.from('membros').delete().eq('escolinha_id', esc?.id).eq('perfil_id', idProfessor);
    await apagarEscolinha(gestor, esc?.id);
  });

  describe('lead à mão', () => {
    let l;

    it('o gestor cadastra', async () => {
      const { data, error } = await gestor
        .from('leads')
        .insert({ escolinha_id: esc.id, aluno_nome: 'Caio Rocha', telefone: '(62) 98111-2233', origem: 'instagram' })
        .select()
        .single();
      expect(error).toBeNull();
      expect(data.etapa).toBe('novo');
      l = data;
    });

    it('cada troca de etapa vai para o histórico', async () => {
      await gestor.from('leads').update({ etapa: 'contato' }).eq('id', l.id);
      await gestor.from('leads').update({ etapa: 'experimental', aula_em: new Date().toISOString() }).eq('id', l.id);
      const h = await notas(l.id);
      expect(h.map((n) => n.texto)).toEqual(['Etapa: Em contato', 'Etapa: Aula experimental']);
      expect(h.every((n) => n.sistema)).toBe(true);
    });

    it('a anotação do gestor fica junto', async () => {
      const { error } = await gestor.from('leads_notas').insert({ lead_id: l.id, texto: 'Mãe prefere sábado' });
      expect(error).toBeNull();
      expect((await notas(l.id)).at(-1).sistema).toBe(false);
    });

    it('perdido guarda o motivo; voltar ao funil apaga o motivo', async () => {
      await gestor.from('leads').update({ etapa: 'perdido', motivo_perda: 'Achou caro' }).eq('id', l.id);
      expect((await notas(l.id)).at(-1).texto).toBe('Etapa: Perdido — Achou caro');
      await gestor.from('leads').update({ etapa: 'contato' }).eq('id', l.id);
      const [x] = await lead({ id: l.id });
      expect(x.motivo_perda).toBeNull();
    });

    it('o painel avisa do retorno de hoje e da aula experimental de hoje', async () => {
      await gestor.from('leads').update({ proximo_contato: new Date().toISOString().slice(0, 10) }).eq('id', l.id);
      await gestor.from('leads').insert({
        escolinha_id: esc.id, aluno_nome: 'Aula Hoje', telefone: '(62) 98111-0000',
        etapa: 'experimental', aula_em: new Date().toISOString(),
      });
      const { data } = await gestor.rpc('painel_resumo', { p_escolinha: esc.id });
      expect(data.leads_retorno).toBe(1);
      expect(data.aulas_experimentais_hoje).toBe(1);
    });
  });

  describe('formulário público de aula experimental', () => {
    it('cria o lead como novo, para retornar hoje', async () => {
      const { error } = await anon.rpc('registrar_interesse', {
        p_codigo: codigo, p_dados: { aluno_nome: 'Bia Souza', resp_nome: 'Ana Souza', telefone: '62 98222-3344' },
      });
      expect(error).toBeNull();
      const [l] = await lead({ aluno_nome: 'Bia Souza' });
      expect(l.origem).toBe('formulario');
      expect(l.etapa).toBe('novo');
      expect(l.proximo_contato).toBe(new Date().toISOString().slice(0, 10));
    });

    it('pedir de novo não duplica: vira anotação', async () => {
      await anon.rpc('registrar_interesse', {
        p_codigo: codigo, p_dados: { aluno_nome: 'bia souza', telefone: '(62) 98222-3344', observacoes: 'só à tarde' },
      });
      const todos = await lead({ telefone: '62 98222-3344' });
      expect(todos).toHaveLength(1);
      expect((await notas(todos[0].id)).at(-1).texto).toMatch(/de novo.*só à tarde/);
    });

    it('telefone curto é recusado', async () => {
      const { error } = await anon.rpc('registrar_interesse', {
        p_codigo: codigo, p_dados: { aluno_nome: 'X Y', telefone: '1234' },
      });
      expect(error).toBeTruthy();
    });
  });

  describe('a ficha do link move o funil', () => {
    it('quem já era lead avança para "ficha", sem duplicar', async () => {
      await anon.rpc('enviar_pre_matricula', {
        p_codigo: codigo,
        p_dados: { aluno_nome: 'Bia Souza', resp_nome: 'Ana Souza', resp_telefone: '(62) 98222-3344' },
      });
      const todos = await lead({ aluno_nome: 'Bia Souza' });
      expect(todos).toHaveLength(1);
      expect(todos[0].etapa).toBe('ficha');
      expect(todos[0].pre_matricula_id).toBeTruthy();
    });

    it('quem chega direto pela ficha entra no funil', async () => {
      await anon.rpc('enviar_pre_matricula', {
        p_codigo: codigo,
        p_dados: { aluno_nome: 'Leo Prado', resp_nome: 'Rui Prado', resp_telefone: '(62) 98333-4455' },
      });
      const [l] = await lead({ aluno_nome: 'Leo Prado' });
      expect(l.origem).toBe('link_matricula');
      expect(l.etapa).toBe('ficha');
    });

    it('aprovar a ficha marca matriculado, com o atleta', async () => {
      const [l] = await lead({ aluno_nome: 'Bia Souza' });
      const { data: alunoId } = await gestor.rpc('aprovar_pre_matricula', { p_id: l.pre_matricula_id });
      const [depois] = await lead({ id: l.id });
      expect(depois.etapa).toBe('matriculado');
      expect(depois.aluno_id).toBe(alunoId);
    });

    it('recusar a ficha marca perdido, com o motivo', async () => {
      const [l] = await lead({ aluno_nome: 'Leo Prado' });
      await gestor.rpc('recusar_pre_matricula', { p_id: l.pre_matricula_id, p_motivo: 'Turma cheia' });
      const [depois] = await lead({ id: l.id });
      expect(depois.etapa).toBe('perdido');
      expect(depois.motivo_perda).toBe('Turma cheia');
    });
  });

  describe('só o gestor', () => {
    it('o professor não lê nem cria lead', async () => {
      const { data } = await professor.from('leads').select('id').eq('escolinha_id', esc.id);
      expect(data).toEqual([]);
      const { error } = await professor
        .from('leads').insert({ escolinha_id: esc.id, aluno_nome: 'Intruso', telefone: '(62) 90000-0000' });
      expect(error).toBeTruthy();
    });

    it('o anônimo não lê a tabela', async () => {
      const { data, error } = await anon.from('leads').select('id').limit(1);
      expect(error || data?.length === 0).toBeTruthy();
    });
  });
});
