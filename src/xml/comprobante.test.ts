import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';
import type { ComprobanteCalculado, Emisor, LineaCalculada } from '../tipos.js';
import { construirXmlComprobante, nombreArchivo } from './index.js';
import { cdata, escapar } from './nodos.js';

const emisor: Emisor = {
  ruc: '20000000001',
  razonSocial: 'ACME & HIJOS S.A.C.',
  nombreComercial: 'ACME',
  domicilio: {
    ubigeo: '150101',
    departamento: 'LIMA',
    provincia: 'LIMA',
    distrito: 'LIMA',
    direccion: 'AV. LOS OLIVOS 123',
  },
};

const lineaGravada: LineaCalculada = {
  orden: 1,
  codigo: 'P1',
  descripcion: 'Bolsa <grande> & fuerte',
  unidad: 'NIU',
  cantidad: '2.0000',
  valorUnitario: '50.000000',
  precioUnitario: '59.000000',
  descuento: '0.00',
  afectacion: '10',
  base: '100.00',
  igv: '18.00',
  icbper: '1.00',
  total: '119.00',
};

const lineaExonerada: LineaCalculada = {
  orden: 2,
  descripcion: 'Libro',
  unidad: 'NIU',
  cantidad: '1.5000',
  valorUnitario: '20.000000',
  precioUnitario: '20.000000',
  descuento: '5.00',
  afectacion: '20',
  base: '25.00',
  igv: '0.00',
  icbper: '0.00',
  total: '25.00',
};

const factura: ComprobanteCalculado = {
  tipo: '01',
  serie: 'F001',
  correlativo: 1,
  numero: 'F001-1',
  fechaEmision: '2026-11-09',
  horaEmision: '10:00:00',
  moneda: 'PEN',
  porcentajeIgv: '18.00',
  formaPago: { tipo: 'contado' },
  cliente: { tipoDocumento: '6', numeroDocumento: '20000000002', nombre: 'CLIENTE S.A.', direccion: 'JR. UNO 1' },
  lineas: [lineaGravada],
  totales: {
    gravadas: '100.00',
    exoneradas: '0.00',
    inafectas: '0.00',
    descuentos: '0.00',
    igv: '18.00',
    icbper: '1.00',
    totalImpuestos: '19.00',
    valorVenta: '100.00',
    total: '119.00',
  },
  leyendas: [{ codigo: '1000', valor: 'SON CIENTO DIECINUEVE CON 00/100 SOLES' }],
};

function fragmentos(xml: string, etiqueta: string): string[] {
  return xml.match(new RegExp(`<${etiqueta}[ >].*?</${etiqueta}>`, 'g')) ?? [];
}

function primero(xml: string, etiqueta: string): string {
  const [encontrado] = fragmentos(xml, etiqueta);
  if (encontrado === undefined) throw new Error(`falta ${etiqueta}`);
  return encontrado;
}

function comprobarBienFormado(xml: string): void {
  const errores: string[] = [];
  new DOMParser({ onError: (nivel, mensaje) => errores.push(`${nivel}: ${mensaje}`) }).parseFromString(xml, 'text/xml');
  expect(errores).toEqual([]);
}

describe('construirXmlComprobante', () => {
  it('produce xml bien formado y sin espacios entre etiquetas', () => {
    const xml = construirXmlComprobante(factura, emisor);
    comprobarBienFormado(xml);
    expect(xml).not.toMatch(/>\s+</);
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?><Invoice xmlns=')).toBe(true);
  });

  it('es determinista', () => {
    expect(construirXmlComprobante(factura, emisor)).toBe(construirXmlComprobante(factura, emisor));
  });

  it('deja el hueco de la firma y la referencia cac:Signature', () => {
    const xml = construirXmlComprobante(factura, emisor);
    expect(primero(xml, 'ext:UBLExtensions')).toMatchSnapshot();
    expect(primero(xml, 'cac:Signature')).toMatchSnapshot();
  });

  it('emite cabecera, partes y totales como greenter', () => {
    const xml = construirXmlComprobante(factura, emisor);
    expect(primero(xml, 'cac:AccountingSupplierParty')).toMatchSnapshot();
    expect(primero(xml, 'cac:AccountingCustomerParty')).toMatchSnapshot();
    expect(primero(xml, 'cac:LegalMonetaryTotal')).toMatchSnapshot();
    expect(primero(xml, 'cbc:Note')).toBe(
      '<cbc:Note languageLocaleID="1000"><![CDATA[SON CIENTO DIECINUEVE CON 00/100 SOLES]]></cbc:Note>',
    );
    expect(primero(xml, 'cbc:InvoiceTypeCode')).toBe('<cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>');
  });

  it('declara los subtotales por esquema en el orden de greenter', () => {
    const xml = construirXmlComprobante(factura, emisor);
    const total = primero(xml.slice(0, xml.indexOf('<cac:LegalMonetaryTotal>')), 'cac:TaxTotal');
    expect(total).toMatchSnapshot();
    expect([...total.matchAll(/<cac:TaxScheme><cbc:ID>(\d+)/g)].map((m) => m[1])).toEqual([
      '1000',
      '9998',
      '9997',
      '7152',
    ]);
  });

  it('omite icbper cuando es cero', () => {
    const xml = construirXmlComprobante(
      {
        ...factura,
        lineas: [{ ...lineaGravada, icbper: '0.00' }],
        totales: { ...factura.totales, icbper: '0.00' },
      },
      emisor,
    );
    expect(xml).not.toContain('7152');
  });

  it('arma la línea con icbper', () => {
    const xml = construirXmlComprobante(factura, emisor);
    expect(primero(xml, 'cac:InvoiceLine')).toMatchSnapshot();
  });

  it('expresa el descuento de línea como AllowanceCharge sin impuesto', () => {
    const xml = construirXmlComprobante({ ...factura, lineas: [lineaExonerada] }, emisor);
    expect(primero(xml, 'cac:InvoiceLine')).toMatchSnapshot();
    expect(primero(xml, 'cac:AllowanceCharge')).toBe(
      '<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator>' +
        '<cbc:AllowanceChargeReasonCode>00</cbc:AllowanceChargeReasonCode>' +
        '<cbc:MultiplierFactorNumeric>0.16667</cbc:MultiplierFactorNumeric>' +
        '<cbc:Amount currencyID="PEN">5</cbc:Amount>' +
        '<cbc:BaseAmount currencyID="PEN">30</cbc:BaseAmount></cac:AllowanceCharge>',
    );
  });

  it('no emite AllowanceCharge sin descuento', () => {
    expect(construirXmlComprobante(factura, emisor)).not.toContain('cac:AllowanceCharge');
  });

  it('declara contado', () => {
    const xml = construirXmlComprobante(factura, emisor);
    expect(primero(xml, 'cac:PaymentTerms')).toBe(
      '<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>',
    );
  });

  it('declara crédito con cuotas numeradas', () => {
    const xml = construirXmlComprobante(
      {
        ...factura,
        formaPago: {
          tipo: 'credito',
          cuotas: [
            { monto: '59.50', vencimiento: '2026-12-09' },
            { monto: '59.50', vencimiento: '2027-01-09' },
          ],
        },
      },
      emisor,
    );
    expect(fragmentos(xml, 'cac:PaymentTerms')).toMatchSnapshot();
  });

  it('omite la forma de pago en una boleta a crédito', () => {
    const xml = construirXmlComprobante(
      {
        ...factura,
        tipo: '03',
        numero: 'B001-1',
        formaPago: { tipo: 'credito', cuotas: [{ monto: '119.00', vencimiento: '2026-12-09' }] },
      },
      emisor,
    );
    expect(xml).not.toContain('cac:PaymentTerms');
    expect(primero(xml, 'cbc:InvoiceTypeCode')).toContain('>03<');
  });

  it('usa los valores por defecto del cliente sin documento', () => {
    const xml = construirXmlComprobante(
      { ...factura, cliente: { tipoDocumento: '0', numeroDocumento: '', nombre: '' } },
      emisor,
    );
    expect(primero(xml, 'cac:AccountingCustomerParty')).toMatchSnapshot();
  });

  it('escapa los textos fuera de cdata y sigue bien formado con caracteres difíciles', () => {
    const xml = construirXmlComprobante(
      {
        ...factura,
        cliente: { ...factura.cliente, nombre: 'A ]]> B' },
        lineas: [{ ...lineaGravada, codigo: 'A&B<"\'' }],
      },
      {
        ...emisor,
        domicilio: { ...emisor.domicilio, provincia: 'SAN JOSÉ & <MAR>', urbanizacion: "D'ALLO" },
      },
    );
    comprobarBienFormado(xml);
    expect(xml).toContain('<cbc:CityName>SAN JOSÉ &amp; &lt;MAR&gt;</cbc:CityName>');
    expect(xml).toContain('<cbc:CitySubdivisionName>D&#039;ALLO</cbc:CitySubdivisionName>');
    expect(xml).toContain('<cbc:ID>A&amp;B&lt;&quot;&#039;</cbc:ID>');
  });
});

describe('escapado', () => {
  it('parte el cierre de cdata', () => {
    expect(cdata('a]]>b')).toBe('<![CDATA[a]]]]><![CDATA[>b]]>');
  });

  it('quita caracteres que xml 1.0 no admite', () => {
    expect(escapar('a\u0001b')).toBe('ab');
    expect(cdata('a\u0001b')).toBe('<![CDATA[ab]]>');
  });
});

describe('nombreArchivo', () => {
  it('une ruc, tipo y número', () => {
    expect(nombreArchivo('20000000001', { tipo: '01', numero: 'F001-1' })).toBe('20000000001-01-F001-1');
  });
});
