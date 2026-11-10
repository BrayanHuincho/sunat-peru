import type { ComprobanteCalculado, Emisor } from '../tipos.js';

export function cadenaQr(emisor: Emisor, comprobante: ComprobanteCalculado, hash: string): string {
  const { tipo, serie, correlativo, totales, fechaEmision, cliente } = comprobante;
  return [
    emisor.ruc,
    tipo,
    serie,
    String(correlativo).padStart(6, '0'),
    totales.igv,
    totales.total,
    fechaEmision,
    cliente.tipoDocumento,
    cliente.numeroDocumento || '-',
    hash,
  ].join('|');
}
