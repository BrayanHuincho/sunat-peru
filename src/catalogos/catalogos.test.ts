import { describe, expect, it } from 'vitest';
import {
  AFECTACIONES,
  TIPOS_COMPROBANTE,
  TIPOS_DOCUMENTO_IDENTIDAD,
  TIPOS_PRECIO,
  TRIBUTOS,
  UNIDADES,
  UNIDAD_POR_DEFECTO,
  esUnidad,
} from './index.js';

describe('catálogos', () => {
  it('cubre los comprobantes del alcance', () => {
    expect(TIPOS_COMPROBANTE['01']).toBe('FACTURA');
    expect(TIPOS_COMPROBANTE['03']).toBe('BOLETA DE VENTA');
  });

  it('usa la clave del tributo como su código', () => {
    for (const [clave, tributo] of Object.entries(TRIBUTOS)) expect(tributo.codigo).toBe(clave);
  });

  it('tiene ICBPER con el código 7152', () => {
    expect(TRIBUTOS['7152'].nombre).toBe('ICBPER');
  });

  it('cubre todos los tipos de documento de identidad', () => {
    expect(Object.keys(TIPOS_DOCUMENTO_IDENTIDAD).sort()).toEqual(['0', '1', '4', '6', '7', 'A']);
  });

  it.each([
    ['10', '1000', 'S'],
    ['20', '9997', 'E'],
    ['30', '9998', 'O'],
  ] as const)('afectación %s va con tributo %s y categoría %s', (afectacion, tributo, categoria) => {
    expect(AFECTACIONES[afectacion].tributo).toBe(tributo);
    expect(AFECTACIONES[afectacion].categoria).toBe(categoria);
    expect(TRIBUTOS[tributo]).toBeDefined();
  });

  it('distingue precio con IGV de valor referencial', () => {
    expect(Object.keys(TIPOS_PRECIO)).toEqual(['01', '02']);
  });

  it('la unidad por defecto existe', () => {
    expect(UNIDADES[UNIDAD_POR_DEFECTO]).toBeDefined();
  });

  it.each(['NIU', 'ZZ', 'KGM'])('reconoce la unidad %s', (codigo) => {
    expect(esUnidad(codigo)).toBe(true);
  });

  it.each(['', 'niu', 'XXX', 'toString', '__proto__'])('rechaza la unidad %j', (codigo) => {
    expect(esUnidad(codigo)).toBe(false);
  });
});
