import { describe, expect, it } from 'vitest';
import type { ComprobanteCalculado, Emisor } from '../tipos.js';
import { cadenaQr } from './index.js';

const emisor = { ruc: '20000000001' } as Emisor;

function comprobante(numeroDocumento: string): ComprobanteCalculado {
  return {
    tipo: '03',
    serie: 'B001',
    correlativo: 42,
    fechaEmision: '2026-03-10',
    cliente: { tipoDocumento: '0', numeroDocumento, nombre: 'Varios' },
    totales: { igv: '18.00', total: '118.00' },
  } as ComprobanteCalculado;
}

describe('cadenaQr', () => {
  it('rellena el correlativo a seis dígitos', () => {
    expect(cadenaQr(emisor, comprobante('12345678'), 'HASH')).toBe(
      '20000000001|03|B001|000042|18.00|118.00|2026-03-10|0|12345678|HASH',
    );
  });

  it('usa un guion cuando el cliente no tiene documento', () => {
    expect(cadenaQr(emisor, comprobante(''), 'HASH')).toContain('|0|-|HASH');
  });
});
