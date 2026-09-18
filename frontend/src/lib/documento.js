/* CPF e CNPJ: só dígitos no banco, com máscara na tela. A validação
   confere os dígitos verificadores — pega o erro de digitação antes que
   ele vá parar no recibo (e, mais tarde, no cadastro do Asaas). */

export const soDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');

function digito(numeros, pesos) {
  const soma = numeros.reduce((t, n, i) => t + n * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(texto) {
  const d = soDigitos(texto);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const n = [...d].map(Number);
  const d1 = digito(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === n[9] && d2 === n[10];
}

export function cnpjValido(texto) {
  const d = soDigitos(texto);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const n = [...d].map(Number);
  const d1 = digito(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digito(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === n[12] && d2 === n[13];
}

export const documentoValido = (texto) => cpfValido(texto) || cnpjValido(texto);

export function mascaraDocumento(texto) {
  const d = soDigitos(texto);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return texto ?? '';
}

export const tipoDocumento = (texto) => (soDigitos(texto).length === 14 ? 'CNPJ' : 'CPF');
