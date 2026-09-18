/* Pix copia e cola (BR Code estático), montado no próprio app — sem
   banco nem intermediário. É o que o responsável cola no app do banco;
   o mesmo texto vira o QR code. Segue o Manual de Padrões para Iniciação
   do Pix do Banco Central: campos TLV (id, tamanho, valor) e CRC16 no fim.

   Estático quer dizer: o dinheiro cai direto na chave da escolinha, e a
   baixa continua sendo do gestor. A cobrança com baixa automática vem
   com o Asaas. */
import { cpfValido, soDigitos } from './documento.js';

const campo = (id, valor) => id + String(valor.length).padStart(2, '0') + valor;

/* Nome e cidade: o padrão pede ASCII e corta em 25 e 15 caracteres. */
const ascii = (texto, max) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/* A chave do cadastro vem como a pessoa digitou. O Pix exige o formato
   canônico: CPF/CNPJ só com dígitos, telefone com +55, e-mail em
   minúsculas, chave aleatória como está. */
export function normalizarChave(chave) {
  const c = String(chave ?? '').trim();
  if (!c) return null;
  if (c.includes('@')) return c.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return c.toLowerCase();

  const d = soDigitos(c);
  const pareceTelefone = c.startsWith('+') || c.includes('(');
  if (pareceTelefone) return '+' + (d.startsWith('55') && d.length >= 12 ? d : '55' + d);
  if (d.length === 14) return d; // CNPJ
  if (d.length === 11) return cpfValido(d) ? d : '+55' + d; // CPF, ou celular sem máscara
  if (d.length === 13 && d.startsWith('55')) return '+' + d;
  return c;
}

function crc16(texto) {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/* valorCentavos opcional (sem ele, quem paga digita o valor).
   txid: até 25 letras e números — aparece no extrato de alguns bancos e
   ajuda o gestor a achar o pagamento. */
export function pixCopiaECola({ chave, nome, cidade, valorCentavos, txid = '***' }) {
  const k = normalizarChave(chave);
  if (!k) return null;

  const id = txid === '***' ? txid : String(txid).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

  const corpo =
    campo('00', '01') +
    campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', k)) +
    campo('52', '0000') +
    campo('53', '986') +
    (valorCentavos ? campo('54', (valorCentavos / 100).toFixed(2)) : '') +
    campo('58', 'BR') +
    campo('59', ascii(nome, 25) || 'ESCOLINHA') +
    campo('60', ascii(cidade, 15) || 'BRASIL') +
    campo('62', campo('05', id)) +
    '6304';

  return corpo + crc16(corpo);
}
