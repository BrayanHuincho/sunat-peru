import type { ComprobanteCalculado, Emisor, LineaCalculada, Moneda } from '../tipos.js';
import { hoja, nodo } from './nodos.js';
import {
  adquirente,
  cantidadYValor,
  descuentoLinea,
  extensionesFirma,
  firma,
  formaPago,
  impuestosDocumento,
  impuestosLinea,
  item,
  leyendas,
  precio,
  proveedor,
  referenciaPrecio,
  totalMonetario,
} from './partes.js';

const DECLARACION = '<?xml version="1.0" encoding="utf-8"?>';
const ESPACIOS_INVOICE =
  'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"' +
  ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"' +
  ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"' +
  ' xmlns:ds="http://www.w3.org/2000/09/xmldsig#"' +
  ' xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"';
const TIPO_OPERACION_VENTA_INTERNA = '0101';

function lineaFactura(moneda: Moneda, linea: LineaCalculada, porcentajeIgv: string): string {
  return nodo(
    'cac:InvoiceLine',
    cantidadYValor('cbc:InvoicedQuantity', moneda, linea),
    referenciaPrecio(moneda, linea),
    descuentoLinea(moneda, linea),
    impuestosLinea(moneda, linea, porcentajeIgv),
    item(linea),
    precio(moneda, linea),
  );
}

export function construirXmlComprobante(comprobante: ComprobanteCalculado, emisor: Emisor): string {
  const { moneda, totales } = comprobante;
  const contenido = [
    extensionesFirma(),
    hoja('cbc:UBLVersionID', '2.1'),
    hoja('cbc:CustomizationID', '2.0'),
    hoja('cbc:ID', comprobante.numero),
    hoja('cbc:IssueDate', comprobante.fechaEmision),
    hoja('cbc:IssueTime', comprobante.horaEmision),
    hoja('cbc:InvoiceTypeCode', comprobante.tipo, { listID: TIPO_OPERACION_VENTA_INTERNA }),
    leyendas(comprobante.leyendas),
    hoja('cbc:DocumentCurrencyCode', moneda),
    firma(emisor),
    proveedor(emisor),
    adquirente(comprobante.cliente),
    formaPago(comprobante),
    impuestosDocumento(moneda, totales),
    totalMonetario(moneda, totales),
    ...comprobante.lineas.map((linea) => lineaFactura(moneda, linea, comprobante.porcentajeIgv)),
  ].join('');
  return `${DECLARACION}<Invoice ${ESPACIOS_INVOICE}>${contenido}</Invoice>`;
}

export function nombreArchivo(ruc: string, comprobante: { tipo: string; numero: string }): string {
  return `${ruc}-${comprobante.tipo}-${comprobante.numero}`;
}
