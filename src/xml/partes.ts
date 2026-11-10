import { Decimal } from 'decimal.js';
import type {
  Afectacion,
  Cliente,
  ComprobanteCalculado,
  Emisor,
  Leyenda,
  LineaCalculada,
  Moneda,
  TotalesCalculados,
} from '../tipos.js';
import { esPositivo, importe, limitado, recortar, redondear, sinCeros } from './formato.js';
import { hoja, hojaCdata, nodo } from './nodos.js';

const FACTOR_ICBPER = '0.50';
const CODIGO_DESCUENTO_LINEA = '00';

interface Tributo {
  id: string;
  nombre: string;
  codigo: string;
}

const IGV: Tributo = { id: '1000', nombre: 'IGV', codigo: 'VAT' };
const EXONERADO: Tributo = { id: '9997', nombre: 'EXO', codigo: 'VAT' };
const INAFECTO: Tributo = { id: '9998', nombre: 'INA', codigo: 'FRE' };
const ICBPER: Tributo = { id: '7152', nombre: 'ICBPER', codigo: 'OTH' };

const TRIBUTO_POR_AFECTACION: Record<Afectacion, Tributo> = { '10': IGV, '20': EXONERADO, '30': INAFECTO };

function monto(nombre: string, moneda: Moneda, valor: Decimal.Value): string {
  return hoja(nombre, importe(valor), { currencyID: moneda });
}

function esquema(tributo: Tributo): string {
  return nodo(
    'cac:TaxScheme',
    hoja('cbc:ID', tributo.id),
    hoja('cbc:Name', tributo.nombre),
    hoja('cbc:TaxTypeCode', tributo.codigo),
  );
}

export function extensionesFirma(): string {
  return nodo('ext:UBLExtensions', nodo('ext:UBLExtension', '<ext:ExtensionContent/>'));
}

export function firma(emisor: Emisor): string {
  return nodo(
    'cac:Signature',
    hoja('cbc:ID', `SIGN${emisor.ruc}`),
    nodo(
      'cac:SignatoryParty',
      nodo('cac:PartyIdentification', hoja('cbc:ID', emisor.ruc)),
      nodo('cac:PartyName', hojaCdata('cbc:Name', emisor.razonSocial)),
    ),
    nodo('cac:DigitalSignatureAttachment', nodo('cac:ExternalReference', hoja('cbc:URI', '#GREENTER-SIGN'))),
  );
}

export function proveedor(emisor: Emisor): string {
  const domicilio = emisor.domicilio;
  return nodo(
    'cac:AccountingSupplierParty',
    nodo(
      'cac:Party',
      nodo('cac:PartyIdentification', hoja('cbc:ID', emisor.ruc, { schemeID: '6' })),
      nodo('cac:PartyName', hojaCdata('cbc:Name', emisor.nombreComercial || emisor.razonSocial)),
      nodo(
        'cac:PartyLegalEntity',
        hojaCdata('cbc:RegistrationName', emisor.razonSocial),
        nodo(
          'cac:RegistrationAddress',
          hoja('cbc:ID', domicilio.ubigeo),
          hoja('cbc:AddressTypeCode', domicilio.codigoLocal || '0000'),
          hoja('cbc:CitySubdivisionName', domicilio.urbanizacion || '-'),
          hoja('cbc:CityName', domicilio.provincia),
          hoja('cbc:CountrySubentity', domicilio.departamento),
          hoja('cbc:District', domicilio.distrito),
          nodo('cac:AddressLine', hojaCdata('cbc:Line', domicilio.direccion)),
          nodo('cac:Country', hoja('cbc:IdentificationCode', 'PE')),
        ),
      ),
    ),
  );
}

export function adquirente(cliente: Cliente): string {
  const numero = cliente.numeroDocumento || (cliente.tipoDocumento === '0' ? '00000000' : '-');
  return nodo(
    'cac:AccountingCustomerParty',
    nodo(
      'cac:Party',
      nodo('cac:PartyIdentification', hoja('cbc:ID', numero, { schemeID: cliente.tipoDocumento })),
      nodo(
        'cac:PartyLegalEntity',
        hojaCdata('cbc:RegistrationName', recortar(cliente.nombre || 'CLIENTES VARIOS', 250)),
        cliente.direccion &&
          nodo(
            'cac:RegistrationAddress',
            nodo('cac:AddressLine', hojaCdata('cbc:Line', cliente.direccion)),
            nodo('cac:Country', hoja('cbc:IdentificationCode', 'PE')),
          ),
      ),
    ),
  );
}

export function leyendas(lista: Leyenda[]): string {
  return lista.map((l) => hojaCdata('cbc:Note', l.valor, { languageLocaleID: l.codigo })).join('');
}

function terminoPago(medio: string, ...detalle: string[]): string {
  return nodo('cac:PaymentTerms', hoja('cbc:ID', 'FormaPago'), hoja('cbc:PaymentMeansID', medio), ...detalle);
}

export function formaPago(comprobante: ComprobanteCalculado): string {
  const { formaPago: pago, moneda, tipo, totales } = comprobante;
  if (pago.tipo === 'contado') return terminoPago('Contado');
  // la boleta no admite crédito: el gateway omite el bloque completo y aquí se replica
  if (tipo === '03') return '';
  const cuotas = pago.cuotas.map((cuota, indice) =>
    terminoPago(
      `Cuota${String(indice + 1).padStart(3, '0')}`,
      monto('cbc:Amount', moneda, cuota.monto),
      hoja('cbc:PaymentDueDate', cuota.vencimiento),
    ),
  );
  return terminoPago('Credito', monto('cbc:Amount', moneda, totales.total)) + cuotas.join('');
}

function subtotalDocumento(moneda: Moneda, tributo: Tributo, base: string, impuesto: string): string {
  return nodo(
    'cac:TaxSubtotal',
    monto('cbc:TaxableAmount', moneda, base),
    hoja('cbc:TaxAmount', impuesto, { currencyID: moneda }),
    nodo('cac:TaxCategory', esquema(tributo)),
  );
}

export function impuestosDocumento(moneda: Moneda, totales: TotalesCalculados): string {
  return nodo(
    'cac:TaxTotal',
    monto('cbc:TaxAmount', moneda, totales.totalImpuestos),
    subtotalDocumento(moneda, IGV, totales.gravadas, importe(totales.igv)),
    subtotalDocumento(moneda, INAFECTO, totales.inafectas, '0'),
    subtotalDocumento(moneda, EXONERADO, totales.exoneradas, '0'),
    esPositivo(totales.icbper) &&
      nodo('cac:TaxSubtotal', monto('cbc:TaxAmount', moneda, totales.icbper), nodo('cac:TaxCategory', esquema(ICBPER))),
  );
}

export function totalMonetario(moneda: Moneda, totales: TotalesCalculados): string {
  return nodo(
    'cac:LegalMonetaryTotal',
    monto('cbc:LineExtensionAmount', moneda, totales.valorVenta),
    monto('cbc:TaxInclusiveAmount', moneda, totales.total),
    monto('cbc:PayableAmount', moneda, totales.total),
  );
}

export function referenciaPrecio(moneda: Moneda, linea: LineaCalculada): string {
  return nodo(
    'cac:PricingReference',
    nodo(
      'cac:AlternativeConditionPrice',
      hoja('cbc:PriceAmount', limitado(linea.precioUnitario, 10), { currencyID: moneda }),
      hoja('cbc:PriceTypeCode', '01'),
    ),
  );
}

export function descuentoLinea(moneda: Moneda, linea: LineaCalculada): string {
  const baseLista = redondear(new Decimal(linea.cantidad).mul(linea.valorUnitario), 2);
  // se deriva de la base y no de linea.descuento porque con precios con igv ese viene con impuesto
  const descuento = baseLista.sub(linea.base);
  if (!esPositivo(linea.descuento) || !descuento.gt(0) || !baseLista.gt(0)) return '';
  return nodo(
    'cac:AllowanceCharge',
    hoja('cbc:ChargeIndicator', 'false'),
    hoja('cbc:AllowanceChargeReasonCode', CODIGO_DESCUENTO_LINEA),
    hoja('cbc:MultiplierFactorNumeric', limitado(redondear(descuento.div(baseLista), 5), 5)),
    hoja('cbc:Amount', sinCeros(descuento), { currencyID: moneda }),
    hoja('cbc:BaseAmount', sinCeros(baseLista), { currencyID: moneda }),
  );
}

export function impuestosLinea(moneda: Moneda, linea: LineaCalculada, porcentajeIgv: string): string {
  return nodo(
    'cac:TaxTotal',
    monto('cbc:TaxAmount', moneda, new Decimal(linea.igv).add(linea.icbper)),
    nodo(
      'cac:TaxSubtotal',
      monto('cbc:TaxableAmount', moneda, linea.base),
      monto('cbc:TaxAmount', moneda, linea.igv),
      nodo(
        'cac:TaxCategory',
        hoja('cbc:Percent', linea.afectacion === '10' ? sinCeros(porcentajeIgv) : '0'),
        hoja('cbc:TaxExemptionReasonCode', linea.afectacion),
        esquema(TRIBUTO_POR_AFECTACION[linea.afectacion]),
      ),
    ),
    esPositivo(linea.icbper) &&
      nodo(
        'cac:TaxSubtotal',
        monto('cbc:TaxAmount', moneda, linea.icbper),
        hoja('cbc:BaseUnitMeasure', sinCeros(linea.cantidad), { unitCode: 'NIU' }),
        nodo('cac:TaxCategory', monto('cbc:PerUnitAmount', moneda, FACTOR_ICBPER), esquema(ICBPER)),
      ),
  );
}

export function item(linea: LineaCalculada): string {
  return nodo(
    'cac:Item',
    hojaCdata('cbc:Description', recortar(linea.descripcion, 500)),
    nodo('cac:SellersItemIdentification', hoja('cbc:ID', recortar(linea.codigo || '-', 30))),
  );
}

export function precio(moneda: Moneda, linea: LineaCalculada): string {
  return nodo('cac:Price', hoja('cbc:PriceAmount', limitado(linea.valorUnitario, 10), { currencyID: moneda }));
}

export function cantidadYValor(etiqueta: string, moneda: Moneda, linea: LineaCalculada): string {
  return (
    hoja('cbc:ID', String(linea.orden)) +
    hoja(etiqueta, sinCeros(linea.cantidad), { unitCode: linea.unidad }) +
    monto('cbc:LineExtensionAmount', moneda, linea.base)
  );
}
