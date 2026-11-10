import { describe, expect, it } from 'vitest';
import { clasificarCodigo, explicarCodigo } from './index.js';

describe('clasificarCodigo', () => {
  it.each([
    ['0', 'aceptado'],
    ['0000', 'aceptado'],
    ['4000', 'observado'],
    ['4252', 'observado'],
    ['2000', 'rechazado'],
    ['3999', 'rechazado'],
    ['0100', 'transitorio'],
    ['0109', 'transitorio'],
    ['0130', 'transitorio'],
    ['0138', 'transitorio'],
    ['0200', 'transitorio'],
    ['0204', 'transitorio'],
    ['0101', 'credenciales'],
    ['0106', 'credenciales'],
    ['0110', 'credenciales'],
    ['0114', 'credenciales'],
    ['1033', 'duplicado'],
    ['0107', 'desconocido'],
    ['0115', 'desconocido'],
    ['0139', 'desconocido'],
    ['0205', 'desconocido'],
    ['1999', 'desconocido'],
    ['', 'desconocido'],
    ['HTTP', 'desconocido'],
    ['12345', 'desconocido'],
  ])('%s es %s', (codigo, tipo) => {
    expect(clasificarCodigo(codigo)).toEqual({ tipo });
  });

  it('entiende los códigos con prefijo de fault y sin ceros a la izquierda', () => {
    expect(clasificarCodigo('soap-env:Client.0100')).toEqual({ tipo: 'transitorio' });
    expect(clasificarCodigo('soap-env:Client.1033')).toEqual({ tipo: 'duplicado' });
    expect(clasificarCodigo(' 102 ')).toEqual({ tipo: 'credenciales' });
  });
});

describe('explicarCodigo', () => {
  it('usa la explicación propia del código cuando existe', () => {
    expect(explicarCodigo('2335')).toContain('alterado');
    expect(explicarCodigo('soap-env:Client.1033')).toContain('ya tiene un comprobante');
  });

  it('cae en la explicación del tipo de código', () => {
    expect(explicarCodigo('4252')).toContain('observaciones');
    expect(explicarCodigo('2999')).toContain('rechazó');
    expect(explicarCodigo('0135')).toContain('reintentar');
  });

  it('no inventa explicación para lo desconocido', () => {
    expect(explicarCodigo('HTTP')).toBeNull();
    expect(explicarCodigo('1999')).toBeNull();
  });
});
