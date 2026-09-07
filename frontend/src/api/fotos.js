import { supabase } from '../lib/supabase.js';
import { exec } from './cliente.js';

const BUCKET = 'fotos';

/* O caminho carrega a escolinha na primeira pasta — é assim que a
   política do Storage sabe quem pode ver o quê. */
export async function enviar(escolinhaId, alunoId, arquivo) {
  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
  const caminho = `${escolinhaId}/${alunoId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
  if (error) throw new Error(error.message);

  await exec(supabase.from('alunos').update({ foto_path: caminho }).eq('id', alunoId));
  return caminho;
}

/* O bucket é privado (são fotos de menores), então a exibição usa URL
   assinada de curta duração em vez de link público. */
export async function url(caminho, segundos = 3600) {
  if (!caminho) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, segundos);
  if (error) return null;
  return data.signedUrl;
}

/* Foto enviada pelo responsável na matrícula, sem login. A política do
   Storage só deixa gravar em `pre/<escolinha>/`, e só gravar: quem lê
   depois é o professor daquela escolinha. */
export async function enviarNaMatricula(escolinhaId, arquivo) {
  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
  const aleatorio = crypto.randomUUID();
  const caminho = `pre/${escolinhaId}/${aleatorio}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { contentType: arquivo.type });
  if (error) throw new Error(error.message);

  return caminho;
}

export async function remover(alunoId, caminho) {
  if (caminho) await supabase.storage.from(BUCKET).remove([caminho]);
  await exec(supabase.from('alunos').update({ foto_path: null }).eq('id', alunoId));
}
