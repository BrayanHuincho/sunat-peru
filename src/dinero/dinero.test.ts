import { describe, expect, it } from 'vitest';
import { ErrorValidacion } from '../errores.js';
import { decimal, fijo, redondear } from './index.js';

describe('decimal', () => {
  it.each([
    ['12.50', '12.5'],
    [12.5, '12.5'],
    ['+3', '3'],
    ['.5', '0.5'],
    ['5.', '5'],
    ['1e3', '1000'],
    [0, '0'],
  ])('interpreta %s', (entrada, esperado) => {
    expect(decimal(entrada).toString()).toBe(esperado);
  });

  it('acepta un Decimal ya construido', () => {
    expect(decimal(decimal('1.5')).toString()).toBe('1.5');
  });

  it.each(['', ' ', 'abc', '1,50', ' 12', '0x10', '0b11', 'NaN', 'Infinity', '1.2.3'])(
    'rechaza el texto %j',
    (entrada) => {
      expect(() => decimal(entrada)).toThrow(ErrorValidacion);
    },
  );

  it.each([NaN, Infinity, -Infinity])('rechaza el número %s', (entrada) => {
    expect(() => decimal(entrada)).toThrow(ErrorValidacion);
  });

  it('no pierde precisión en la aritmética', () => {
    expect(decimal('0.1').plus('0.2').toString()).toBe('0.3');
    expect(decimal('12345678901234567890.12').times(3).toFixed(2)).toBe('37037036703703703670.36');
  });
});

describe('redondear', () => {
  it.each([
    ['1.005', '1.01'],
    ['1.004', '1'],
    ['2.5', '2.5'],
    ['-1.005', '-1.01'],
    ['0.125', '0.13'],
    ['0.995', '1'],
  ])('%s a dos decimales', (entrada, esperado) => {
    expect(redondear(decimal(entrada)).toString()).toBe(esperado);
  });

  it('redondea hacia arriba la mitad, no al par', () => {
    expect(redondear(decimal('2.5'), 0).toString()).toBe('3');
    expect(redondear(decimal('3.5'), 0).toString()).toBe('4');
    expect(redondear(decimal('-2.5'), 0).toString()).toBe('-3');
  });

  it('respeta los decimales pedidos', () => {
    expect(redondear(decimal('1.23456789'), 4).toString()).toBe('1.2346');
    expect(redondear(decimal('1.2345678951'), 10).toString()).toBe('1.2345678951');
  });

  it('funciona con el número 1.005 sin el error binario de toFixed', () => {
    expect(redondear(decimal(1.005)).toString()).toBe('1.01');
  });
});

describe('fijo', () => {
  it.each([
    ['5', undefined, '5.00'],
    ['5.1', undefined, '5.10'],
    ['1.005', undefined, '1.01'],
    ['1.5', 0, '2'],
    ['1.23456', 4, '1.2346'],
    ['1.2', 10, '1.2000000000'],
    ['-5.5', undefined, '-5.50'],
    ['1e21', undefined, '1000000000000000000000.00'],
  ])('%s con %s decimales', (entrada, decimales, esperado) => {
    expect(fijo(decimal(entrada), decimales)).toBe(esperado);
  });

  it.each(['-0.001', '-0', '-0.004'])('no devuelve cero negativo para %s', (entrada) => {
    expect(fijo(decimal(entrada))).toBe('0.00');
  });
});
