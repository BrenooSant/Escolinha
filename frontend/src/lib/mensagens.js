/* O banco redige a mensagem inteira menos uma coisa: o endereço do
   site, que ele não tem como saber. Por isso o texto guardado na fila
   ainda traz {{link}} — e é aqui que ele vira URL. */

export const ROTULO_TIPO = {
  lembrete_vencendo: 'Mensalidade a vencer',
  lembrete_atrasado: 'Mensalidade atrasada',
  aniversario: 'Aniversário',
};

export const TOM_TIPO = {
  lembrete_vencendo: 'warn',
  lembrete_atrasado: 'bad',
  aniversario: 'ok',
};

/* Sem responsável cadastrado não há link nenhum para mandar. Aí a
   linha inteira sai, em vez de sobrar um "pague por aqui:" apontando
   para lugar nenhum. */
export function textoFinal(mensagem, origem) {
  const texto = mensagem?.texto ?? '';
  if (!texto.includes('{{link}}')) return texto;

  const token = mensagem?.responsavel_token;
  if (!token) {
    return texto
      .split('\n')
      .filter((linha) => !linha.includes('{{link}}'))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  return texto.replaceAll('{{link}}', `${origem}#/portal/${token}`);
}

/* `origin + pathname` e não só `origin`: em subpasta o link do portal
   precisa do caminho junto, senão aponta para a raiz do domínio. */
export const origemDoSite = () => `${window.location.origin}${window.location.pathname}`;
