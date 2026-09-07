/* Link público de matrícula: a única porta por onde entra gente de fora.
   O que ela devolve, o que ela aceita, e onde o visitante pode gravar. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apagarEscolinha, clienteAnonimo, configurado, entrar, novaEscolinha, novoAluno, pngMinimo,
} from './ajuda.js';

describe.skipIf(!configurado)('link público de matrícula', () => {
  let sb, anon, esc, turma, codigo, caminhoFoto;

  const ficha = (extra = {}) => ({
    aluno_nome: 'Gabriel Souza Antunes',
    nascimento: '2015-03-12',
    posicao: 'Meia',
    turma_id: turma.id,
    resp_nome: 'Cristiane Antunes',
    resp_parentesco: 'Mãe',
    resp_telefone: '(62) 99401-7788',
    observacoes: 'Usa óculos de grau; joga sem.',
    ...extra,
  });

  beforeAll(async () => {
    sb = await entrar('dono');
    anon = clienteAnonimo();
    esc = await novaEscolinha(sb, 'matricula');
    turma = esc.turmas[1];
    codigo = esc.escolinha.codigo_matricula;
  });

  afterAll(async () => { await apagarEscolinha(sb, esc?.id); });

  it('o código tem 8 caracteres sem letras ambíguas', () => {
    expect(codigo).toMatch(/^[A-Z2-9]{8}$/);
    expect(codigo).not.toMatch(/[OI01]/);
  });

  it('a página pública mostra turmas e vagas, nunca a lista de atletas', async () => {
    await novoAluno(sb, { escolinhaId: esc.id, turmaId: turma.id, nome: 'Atleta Sigiloso', numero: 5 });

    const { data } = await anon.rpc('escolinha_publica', { p_codigo: codigo });
    expect(data.nome).toBe(esc.nome);
    expect(data.turmas).toHaveLength(4);
    expect(data.turmas[0]).toHaveProperty('vagas');
    expect(JSON.stringify(data)).not.toContain('Atleta Sigiloso');
  });

  it('aceita o código em minúsculas', async () => {
    const { data } = await anon.rpc('escolinha_publica', { p_codigo: codigo.toLowerCase() });
    expect(data.nome).toBe(esc.nome);
  });

  it('código inexistente devolve nulo', async () => {
    const { data } = await anon.rpc('escolinha_publica', { p_codigo: 'NAOEXIST' });
    expect(data).toBeNull();
  });

  it('com as matrículas encerradas, o link para de responder', async () => {
    await sb.from('escolinhas').update({ matriculas_abertas: false }).eq('id', esc.id);
    const { data } = await anon.rpc('escolinha_publica', { p_codigo: codigo });
    expect(data).toBeNull();

    const { error } = await anon.rpc('enviar_pre_matricula', { p_codigo: codigo, p_dados: ficha() });
    expect(error).toBeTruthy();

    await sb.from('escolinhas').update({ matriculas_abertas: true }).eq('id', esc.id);
  });

  it('o responsável grava a foto em pre/<escolinha>/, e só lá', async () => {
    caminhoFoto = `pre/${esc.id}/${crypto.randomUUID()}.png`;
    const ok = await anon.storage.from('fotos').upload(caminhoFoto, pngMinimo(), { contentType: 'image/png' });
    expect(ok.error).toBeNull();

    const foraDePre = await anon.storage.from('fotos').upload(`${esc.id}/direto.png`, pngMinimo());
    expect(foraDePre.error).toBeTruthy();

    const pastaTorta = await anon.storage.from('fotos').upload('pre/naoehuuid/x.png', pngMinimo());
    expect(pastaTorta.error).toBeTruthy();
  });

  it('o responsável envia mas não lê o que mandou', async () => {
    const { data } = await anon.storage.from('fotos').list(`pre/${esc.id}`);
    expect(data ?? []).toEqual([]);
  });

  it('a ficha é aceita e devolve um protocolo', async () => {
    const { data } = await anon.rpc('enviar_pre_matricula', {
      p_codigo: codigo, p_dados: ficha({ foto_path: caminhoFoto }),
    });
    expect(data.ok).toBe(true);
    expect(data.protocolo).toMatch(/^[0-9A-F]{6}$/);
  });

  it('a mesma ficha enviada de novo é barrada', async () => {
    const { error } = await anon.rpc('enviar_pre_matricula', {
      p_codigo: codigo, p_dados: ficha(),
    });
    expect(error?.message ?? '').toMatch(/já foi enviada/i);
  });

  it.each([
    ['nome curto', { aluno_nome: 'Jo' }],
    ['sem responsável', { resp_nome: '' }],
    ['telefone sem DDD', { resp_telefone: '99999' }],
  ])('recusa ficha com %s', async (_, quebrado) => {
    const { error } = await anon.rpc('enviar_pre_matricula', {
      p_codigo: codigo,
      p_dados: ficha({ aluno_nome: 'Outro Nome', resp_telefone: '(62) 91111-2222', ...quebrado }),
    });
    expect(error).toBeTruthy();
  });

  it('recusa foto apontando para a pasta de outra escolinha', async () => {
    const { error } = await anon.rpc('enviar_pre_matricula', {
      p_codigo: codigo,
      p_dados: ficha({
        aluno_nome: 'Foto Alheia',
        resp_telefone: '(62) 93333-4444',
        foto_path: 'pre/00000000-0000-0000-0000-000000000000/x.png',
      }),
    });
    expect(error).toBeTruthy();
  });

  it('a ficha não vira aluno sozinha', async () => {
    const { data } = await sb.from('vw_alunos').select('nome').eq('escolinha_id', esc.id);
    expect(data.map((a) => a.nome)).not.toContain('Gabriel Souza Antunes');
  });

  it('aprovar cria responsável, atleta, mensalidade — e leva a foto junto', async () => {
    const { data: pend } = await sb
      .from('pre_matriculas').select('*').eq('escolinha_id', esc.id).eq('status', 'pendente');
    expect(pend).toHaveLength(1);

    const { data: novoId } = await sb.rpc('aprovar_pre_matricula', {
      p_id: pend[0].id, p_turma_id: turma.id, p_numero: null,
    });

    const { data: aluno } = await sb.from('vw_alunos').select('*').eq('id', novoId).single();
    expect(aluno.nome).toBe('Gabriel Souza Antunes');
    expect(aluno.turma_nome).toBe(turma.nome);
    expect(aluno.responsavel_nome).toBe('Cristiane Antunes');
    expect(aluno.foto_path).toBe(caminhoFoto);
    expect(aluno.mensalidade_id).toBeTruthy();
    expect(aluno.numero).toBeTruthy();
  });

  it('o professor lê a foto que o pai mandou, por URL assinada', async () => {
    const { data } = await sb.storage.from('fotos').createSignedUrl(caminhoFoto, 60);
    expect(data?.signedUrl).toContain('token=');
  });

  it('irmão com o mesmo telefone entra sob o mesmo responsável', async () => {
    await anon.rpc('enviar_pre_matricula', {
      p_codigo: codigo,
      p_dados: ficha({ aluno_nome: 'Irmã Antunes' }),
    });

    const { data: pend } = await sb
      .from('pre_matriculas').select('*').eq('escolinha_id', esc.id).eq('status', 'pendente');
    const { data: irmaId } = await sb.rpc('aprovar_pre_matricula', { p_id: pend[0].id });

    const { data: alunos } = await sb
      .from('vw_alunos').select('*').eq('escolinha_id', esc.id).eq('ativo', true);
    const irma = alunos.find((a) => a.id === irmaId);
    const gabriel = alunos.find((a) => a.nome === 'Gabriel Souza Antunes');
    expect(irma.responsavel_id).toBe(gabriel.responsavel_id);
  });

  it('recusar não cria atleta nenhum', async () => {
    await anon.rpc('enviar_pre_matricula', {
      p_codigo: codigo,
      p_dados: ficha({ aluno_nome: 'Não Vai Entrar', resp_telefone: '(62) 95555-6666' }),
    });
    const { data: pend } = await sb
      .from('pre_matriculas').select('*').eq('escolinha_id', esc.id).eq('status', 'pendente');

    await sb.rpc('recusar_pre_matricula', { p_id: pend[0].id, p_motivo: 'Sem vaga na categoria' });

    const { data: decidida } = await sb.from('pre_matriculas').select('*').eq('id', pend[0].id).single();
    expect(decidida.status).toBe('recusada');
    expect(decidida.aluno_id).toBeNull();

    const { data: alunos } = await sb.from('vw_alunos').select('nome').eq('escolinha_id', esc.id);
    expect(alunos.map((a) => a.nome)).not.toContain('Não Vai Entrar');
  });

  it('trocar o código invalida o link antigo', async () => {
    const { data: novo } = await sb.rpc('trocar_codigo_matricula', { p_escolinha: esc.id });
    expect(novo).not.toBe(codigo);

    const { data: velho } = await anon.rpc('escolinha_publica', { p_codigo: codigo });
    expect(velho).toBeNull();
  });
});
