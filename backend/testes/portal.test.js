/* Portal do responsável: link pessoal sem senha. O risco aqui não é
   quebrar — é mostrar demais, ou para a pessoa errada. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apagarEscolinha, clienteAnonimo, configurado, entrar, novaEscolinha, novoAluno, novoResponsavel,
} from './ajuda.js';

describe.skipIf(!configurado)('portal do responsável', () => {
  let sb, anon, esc, turma, resp, aluno, token, mensalidade;

  beforeAll(async () => {
    sb = await entrar('dono');
    anon = clienteAnonimo();
    esc = await novaEscolinha(sb, 'portal');
    turma = esc.turmas[1];

    resp = await novoResponsavel(sb, {
      escolinhaId: esc.id, nome: 'Vanessa Duarte', telefone: '(62) 99441-9083',
    });
    aluno = await novoAluno(sb, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Helena Duarte', numero: 7,
      responsavel_id: resp.id, nascimento: '2016-04-02',
    });

    const { data: quesitos } = await sb.from('quesitos_avaliacao').select('*').eq('escolinha_id', esc.id);
    await sb.rpc('salvar_avaliacao', {
      p_aluno: aluno.id,
      p_data: new Date().toISOString().slice(0, 10),
      p_notas: quesitos.slice(0, 3).map((q) => ({ quesito_id: q.id, nota: 4 })),
      p_observacao: 'CONFIDENCIAL conversar com a mãe sobre as faltas',
    });
    await sb.rpc('gerar_mensalidades', { p_escolinha: esc.id, p_competencia: null });

    const { data } = await sb.rpc('token_responsavel', { p_responsavel: resp.id });
    token = data;
  });

  afterAll(async () => { await apagarEscolinha(sb, esc?.id); });

  it('o token tem 32 caracteres', () => {
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('abre pelo token e mostra o filho', async () => {
    const { data } = await anon.rpc('portal_responsavel', { p_token: token });
    expect(data.responsavel.nome).toBe('Vanessa Duarte');
    expect(data.filhos).toHaveLength(1);
    expect(data.filhos[0].nome).toBe('Helena Duarte');
    mensalidade = data.filhos[0].mensalidades[0];
    expect(mensalidade.status).toBe('aberta');
  });

  it('mostra as notas da avaliação, nunca a observação do professor', async () => {
    const { data } = await anon.rpc('portal_responsavel', { p_token: token });
    expect(data.filhos[0].avaliacao.media).toBeTruthy();
    expect(data.filhos[0].avaliacao.notas).toHaveLength(3);
    expect(JSON.stringify(data)).not.toContain('CONFIDENCIAL');
  });

  it('token inexistente devolve nulo, sem vazar nada', async () => {
    const { data, error } = await anon.rpc('portal_responsavel', { p_token: 'naoexiste' });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('avisar que pagou marca como pendente, sem dar baixa', async () => {
    await anon.rpc('avisar_pagamento', {
      p_token: token, p_mensalidade: mensalidade.id, p_obs: 'PIX ontem à noite',
    });

    const { data } = await sb.from('vw_mensalidades').select('*').eq('id', mensalidade.id).single();
    expect(data.avisado_em).toBeTruthy();
    expect(data.aviso_obs).toBe('PIX ontem à noite');
    expect(data.status).toBe('aberta');
  });

  it('o token de um responsável não avisa por filho de outro', async () => {
    const intruso = await novoResponsavel(sb, {
      escolinhaId: esc.id, nome: 'Outro Pai', telefone: '(62) 90000-0002',
    });
    const { data: t } = await sb.rpc('token_responsavel', { p_responsavel: intruso.id });

    const { error } = await anon.rpc('avisar_pagamento', {
      p_token: t, p_mensalidade: mensalidade.id,
    });
    expect(error).toBeTruthy();
  });

  it('a confirmação do professor aparece como quitada para o pai', async () => {
    await sb.rpc('registrar_pagamento', { p_mensalidade: mensalidade.id, p_metodo: 'pix' });

    const { data } = await anon.rpc('portal_responsavel', { p_token: token });
    expect(data.filhos[0].mensalidades[0].status).toBe('paga');
  });

  it('irmãos aparecem no mesmo link', async () => {
    await novoAluno(sb, {
      escolinhaId: esc.id, turmaId: turma.id, nome: 'Irmão Duarte', numero: 8,
      responsavel_id: resp.id,
    });

    const { data } = await anon.rpc('portal_responsavel', { p_token: token });
    expect(data.filhos.map((f) => f.nome).sort()).toEqual(['Helena Duarte', 'Irmão Duarte']);
  });

  it('trocar o link mata o antigo na hora', async () => {
    const { data: novo } = await sb.rpc('trocar_token_responsavel', { p_responsavel: resp.id });
    expect(novo).not.toBe(token);

    const { data: velho } = await anon.rpc('portal_responsavel', { p_token: token });
    expect(velho).toBeNull();

    const { data: valendo } = await anon.rpc('portal_responsavel', { p_token: novo });
    expect(valendo.filhos).toHaveLength(2);
  });

  it('atleta arquivado some do portal', async () => {
    await sb.from('alunos').update({ ativo: false }).eq('id', aluno.id);
    const { data: t } = await sb.rpc('token_responsavel', { p_responsavel: resp.id });

    const { data } = await anon.rpc('portal_responsavel', { p_token: t });
    expect(data.filhos.map((f) => f.nome)).toEqual(['Irmão Duarte']);
  });
});
