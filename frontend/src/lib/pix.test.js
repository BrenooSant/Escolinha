/* O BR Code tem de bater byte a byte com o padrão: um caractere errado
   e o app do banco recusa, ou pior, cobra outra chave. */
import { describe, expect, it } from 'vitest';
import { normalizarChave, pixCopiaECola } from './pix.js';
import { cnpjValido, cpfValido, mascaraDocumento } from './documento.js';

describe('pix copia e cola', () => {
  it('reproduz o exemplo do manual do Banco Central, com o mesmo CRC', () => {
    expect(
      pixCopiaECola({
        chave: '123e4567-e12b-12d1-a456-426655440000',
        nome: 'Fulano de Tal',
        cidade: 'BRASILIA',
      })
    ).toBe(
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000' +
        '5204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D'
    );
  });

  it('põe o valor com ponto e duas casas', () => {
    const br = pixCopiaECola({ chave: 'a@b.com', nome: 'X', cidade: 'Y', valorCentavos: 13500 });
    expect(br).toContain('5406135.00');
  });

  it('tira acento e corta nome em 25 e cidade em 15', () => {
    const br = pixCopiaECola({
      chave: 'a@b.com',
      nome: 'Escolinha Craque do Amanhã Futebol Clube',
      cidade: 'São José dos Campos, SP',
    });
    expect(br).toContain('5925Escolinha Craque do Aman');
    expect(br).toContain('6015Sao Jose dos Ca');
  });

  it('txid só com letras e números, até 25', () => {
    const br = pixCopiaECola({ chave: 'a@b.com', nome: 'X', cidade: 'Y', txid: '6f1c2d3e-aaaa-bbbb-cccc-1234567890ab' });
    expect(br).toContain('62290525' + '6f1c2d3eaaaabbbbcccc12345');
  });

  it('sem chave, não gera nada', () => {
    expect(pixCopiaECola({ chave: '', nome: 'X', cidade: 'Y' })).toBeNull();
  });
});

describe('chave pix', () => {
  it('CNPJ e CPF com máscara viram só dígitos', () => {
    expect(normalizarChave('12.345.678/0001-95')).toBe('12345678000195');
    expect(normalizarChave('529.982.247-25')).toBe('52998224725');
  });

  it('telefone vira +55 com DDD', () => {
    expect(normalizarChave('(62) 99118-5540')).toBe('+5562991185540');
    expect(normalizarChave('+55 62 99118-5540')).toBe('+5562991185540');
    // 11 dígitos que não são um CPF válido: é celular sem máscara
    expect(normalizarChave('62991185540')).toBe('+5562991185540');
  });

  it('e-mail em minúsculas, chave aleatória como está', () => {
    expect(normalizarChave('Pix@Escolinha.com')).toBe('pix@escolinha.com');
    expect(normalizarChave('123E4567-E12B-12D1-A456-426655440000')).toBe('123e4567-e12b-12d1-a456-426655440000');
  });
});

describe('CPF e CNPJ', () => {
  it('confere os dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('529.982.247-24')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
  });

  it('põe a máscara certa pelo tamanho', () => {
    expect(mascaraDocumento('52998224725')).toBe('529.982.247-25');
    expect(mascaraDocumento('11222333000181')).toBe('11.222.333/0001-81');
  });
});
