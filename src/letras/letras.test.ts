import { describe, expect, it } from 'vitest';
import { ErrorValidacion } from '../errores.js';
import { montoEnLetras } from './index.js';

const entero = (n: string): string =>
  montoEnLetras(n, 'PEN')
    .replace(/^SON: /, '')
    .replace(/ CON 00\/100 SOLES$/, '');

describe('montoEnLetras', () => {
  it.each([
    ['0', 'CERO'],
    ['1', 'UNO'],
    ['10', 'DIEZ'],
    ['11', 'ONCE'],
    ['15', 'QUINCE'],
    ['16', 'DIECISÉIS'],
    ['20', 'VEINTE'],
    ['21', 'VEINTIUNO'],
    ['22', 'VEINTIDÓS'],
    ['23', 'VEINTITRÉS'],
    ['26', 'VEINTISÉIS'],
    ['29', 'VEINTINUEVE'],
    ['30', 'TREINTA'],
    ['31', 'TREINTA Y UNO'],
    ['99', 'NOVENTA Y NUEVE'],
    ['100', 'CIEN'],
    ['101', 'CIENTO UNO'],
    ['111', 'CIENTO ONCE'],
    ['121', 'CIENTO VEINTIUNO'],
    ['200', 'DOSCIENTOS'],
    ['500', 'QUINIENTOS'],
    ['700', 'SETECIENTOS'],
    ['900', 'NOVECIENTOS'],
    ['999', 'NOVECIENTOS NOVENTA Y NUEVE'],
    ['1000', 'MIL'],
    ['1001', 'MIL UNO'],
    ['1100', 'MIL CIEN'],
    ['2000', 'DOS MIL'],
    ['16000', 'DIECISÉIS MIL'],
    ['21000', 'VEINTIÚN MIL'],
    ['21021', 'VEINTIÚN MIL VEINTIUNO'],
    ['22000', 'VEINTIDÓS MIL'],
    ['31000', 'TREINTA Y UN MIL'],
    ['100000', 'CIEN MIL'],
    ['101000', 'CIENTO UN MIL'],
    ['121000', 'CIENTO VEINTIÚN MIL'],
    ['999999', 'NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE'],
  ])('%s', (monto, esperado) => {
    expect(entero(monto)).toBe(esperado);
  });

  it.each([
    ['1000000', 'UN MILLÓN'],
    ['1000001', 'UN MILLÓN UNO'],
    ['1001000', 'UN MILLÓN MIL'],
    ['2000000', 'DOS MILLONES'],
    ['21000000', 'VEINTIÚN MILLONES'],
    ['21000021', 'VEINTIÚN MILLONES VEINTIUNO'],
    ['21021000', 'VEINTIÚN MILLONES VEINTIÚN MIL'],
    ['31000000', 'TREINTA Y UN MILLONES'],
    ['100000000', 'CIEN MILLONES'],
    ['101000000', 'CIENTO UN MILLONES'],
    ['121000000', 'CIENTO VEINTIÚN MILLONES'],
    ['1000000000', 'MIL MILLONES'],
    ['1001000000', 'MIL UN MILLONES'],
    ['21000000000', 'VEINTIÚN MIL MILLONES'],
    ['21021000000', 'VEINTIÚN MIL VEINTIÚN MILLONES'],
    ['1000000000000', 'UN BILLÓN'],
    ['1000000000001', 'UN BILLÓN UNO'],
    ['2000000000000', 'DOS BILLONES'],
    ['21000000000000', 'VEINTIÚN BILLONES'],
    ['1000000000000000000', 'UN TRILLÓN'],
  ])('escala %s', (monto, esperado) => {
    expect(entero(monto)).toBe(esperado);
  });

  it.each([
    [495.6, 'SON: CUATROCIENTOS NOVENTA Y CINCO CON 60/100 SOLES'],
    ['1234.5', 'SON: MIL DOSCIENTOS TREINTA Y CUATRO CON 50/100 SOLES'],
    ['0.05', 'SON: CERO CON 05/100 SOLES'],
    ['0.5', 'SON: CERO CON 50/100 SOLES'],
    ['118', 'SON: CIENTO DIECIOCHO CON 00/100 SOLES'],
  ])('importe completo %s', (monto, esperado) => {
    expect(montoEnLetras(monto, 'PEN')).toBe(esperado);
  });

  it('nombra los dólares con tilde', () => {
    expect(montoEnLetras('1500.25', 'USD')).toBe('SON: MIL QUINIENTOS CON 25/100 DÓLARES AMERICANOS');
  });

  it('redondea HALF_UP antes de escribir', () => {
    expect(montoEnLetras('1.005', 'PEN')).toBe('SON: UNO CON 01/100 SOLES');
    expect(montoEnLetras('999.995', 'PEN')).toBe('SON: MIL CON 00/100 SOLES');
    expect(montoEnLetras('0.994', 'PEN')).toBe('SON: CERO CON 99/100 SOLES');
    expect(montoEnLetras('0.995', 'PEN')).toBe('SON: UNO CON 00/100 SOLES');
  });

  it('no pierde exactitud en importes enormes', () => {
    expect(montoEnLetras('9007199254740993.47', 'PEN')).toBe(
      'SON: NUEVE MIL SIETE BILLONES CIENTO NOVENTA Y NUEVE MIL DOSCIENTOS CINCUENTA Y CUATRO MILLONES SETECIENTOS CUARENTA MIL NOVECIENTOS NOVENTA Y TRES CON 47/100 SOLES',
    );
  });

  it('trata como cero un negativo que redondea a cero', () => {
    expect(montoEnLetras('-0.001', 'PEN')).toBe('SON: CERO CON 00/100 SOLES');
  });

  it('rechaza negativos, texto inválido y lo que excede la escala', () => {
    expect(() => montoEnLetras('-1', 'PEN')).toThrow(ErrorValidacion);
    expect(() => montoEnLetras('abc', 'PEN')).toThrow(ErrorValidacion);
    expect(() => montoEnLetras('1e24', 'PEN')).toThrow(ErrorValidacion);
    expect(montoEnLetras('999999999999999999999999', 'PEN')).toContain('TRILLONES');
  });
});
