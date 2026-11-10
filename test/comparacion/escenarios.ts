import type { ComprobanteEntrada } from '../../src/tipos.js';
import { fechaLima } from '../integracion/apoyo.js';

export interface EscenarioComparacion {
  nombre: string;
  entrada: ComprobanteEntrada;
  referencia: Record<string, unknown>;
}

interface LineaReferencia {
  codigo: string;
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  precioUnitario: number;
  afectacion: '10' | '20' | '30';
  base: number;
  igv: number;
  icbper?: number;
  descuento?: { base: number; monto: number; factor: number };
}

interface TotalesReferencia {
  gravadas?: number;
  exoneradas?: number;
  inafectas?: number;
  igv: number;
  icbper?: number;
  total: number;
}

const HORA = '10:30:00';
const DNI = { tipoDocumento: '1', numeroDocumento: '12345678', nombre: 'JUAN PEREZ' } as const;
const RUC = { tipoDocumento: '6', numeroDocumento: '20100066603', nombre: 'CLIENTE DE PRUEBA S.A.' } as const;

function itemReferencia(linea: LineaReferencia): Record<string, unknown> {
  const icbper = linea.icbper ?? 0;
  return {
    codigo: linea.codigo,
    descripcion: linea.descripcion,
    unidad: 'NIU',
    cantidad: linea.cantidad,
    valor_unitario: linea.valorUnitario,
    precio_unitario: linea.precioUnitario,
    tipo_afectacion_igv: linea.afectacion,
    porcentaje_igv: linea.afectacion === '10' ? 18 : 0,
    base_igv: linea.base,
    igv: linea.igv,
    icbper,
    factor_icbper: icbper > 0 ? 0.5 : 0,
    total_impuestos: Number((linea.igv + icbper).toFixed(2)),
    valor_venta: linea.base,
    ...(linea.descuento ? { descuento: linea.descuento } : {}),
  };
}

function documentoReferencia(
  entrada: ComprobanteEntrada,
  lineas: LineaReferencia[],
  totales: TotalesReferencia,
  letras: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const gravadas = totales.gravadas ?? 0;
  const exoneradas = totales.exoneradas ?? 0;
  const inafectas = totales.inafectas ?? 0;
  const icbper = totales.icbper ?? 0;
  return {
    tipo_documento: entrada.tipo,
    serie: entrada.serie,
    correlativo: String(entrada.correlativo),
    fecha_emision: entrada.fechaEmision,
    hora_emision: entrada.horaEmision,
    tipo_operacion: '0101',
    moneda: 'PEN',
    forma_pago: 'CONTADO',
    cliente: {
      tipo_documento: entrada.cliente.tipoDocumento,
      numero_documento: entrada.cliente.numeroDocumento,
      razon_social: entrada.cliente.nombre,
      direccion: entrada.cliente.direccion,
    },
    totales: {
      op_gravadas: gravadas,
      op_exoneradas: exoneradas,
      op_inafectas: inafectas,
      igv: totales.igv,
      icbper,
      total_impuestos: Number((totales.igv + icbper).toFixed(2)),
      valor_venta: Number((gravadas + exoneradas + inafectas).toFixed(2)),
      sub_total: totales.total,
      total: totales.total,
    },
    items: lineas.map(itemReferencia),
    leyendas: [{ codigo: '1000', valor: letras }],
    ...extras,
  };
}

function escenario(
  nombre: string,
  base: Omit<ComprobanteEntrada, 'fechaEmision' | 'horaEmision' | 'moneda'>,
  lineas: LineaReferencia[],
  totales: TotalesReferencia,
  letras: string,
  extras?: Record<string, unknown>,
): EscenarioComparacion {
  const entrada: ComprobanteEntrada = { ...base, fechaEmision: fechaLima(), horaEmision: HORA, moneda: 'PEN' };
  return { nombre, entrada, referencia: documentoReferencia(entrada, lineas, totales, letras, extras) };
}

const vencimiento1 = fechaLima(30);
const vencimiento2 = fechaLima(60);

// los importes de referencia estan calculados a mano para no heredar errores de impuestos
export const ESCENARIOS: EscenarioComparacion[] = [
  escenario(
    'boleta gravada con precio incluido',
    {
      tipo: '03',
      serie: 'B001',
      correlativo: 101,
      preciosIncluyenIgv: true,
      cliente: DNI,
      items: [{ codigo: 'P1', descripcion: 'POLO', cantidad: 2, precioUnitario: '59.00', afectacion: '10' }],
    },
    [
      {
        codigo: 'P1',
        descripcion: 'POLO',
        cantidad: 2,
        valorUnitario: 50,
        precioUnitario: 59,
        afectacion: '10',
        base: 100,
        igv: 18,
      },
    ],
    { gravadas: 100, igv: 18, total: 118 },
    'SON: CIENTO DIECIOCHO CON 00/100 SOLES',
  ),
  escenario(
    'boleta sin documento',
    {
      tipo: '03',
      serie: 'B001',
      correlativo: 102,
      preciosIncluyenIgv: true,
      cliente: { tipoDocumento: '0', numeroDocumento: '00000000', nombre: 'CLIENTES VARIOS' },
      items: [{ codigo: 'P2', descripcion: 'GASEOSA', cantidad: 1, precioUnitario: '11.80', afectacion: '10' }],
    },
    [
      {
        codigo: 'P2',
        descripcion: 'GASEOSA',
        cantidad: 1,
        valorUnitario: 10,
        precioUnitario: 11.8,
        afectacion: '10',
        base: 10,
        igv: 1.8,
      },
    ],
    { gravadas: 10, igv: 1.8, total: 11.8 },
    'SON: ONCE CON 80/100 SOLES',
  ),
  escenario(
    'factura gravada con precio sin igv',
    {
      tipo: '01',
      serie: 'F001',
      correlativo: 103,
      preciosIncluyenIgv: false,
      cliente: { ...RUC, direccion: 'JR. CLIENTE 456' },
      items: [
        { codigo: 'S1', descripcion: 'SERVICIO A', cantidad: 3, precioUnitario: '100.00', afectacion: '10' },
        { codigo: 'S2', descripcion: 'SERVICIO B', cantidad: 1, precioUnitario: '50.50', afectacion: '10' },
      ],
    },
    [
      {
        codigo: 'S1',
        descripcion: 'SERVICIO A',
        cantidad: 3,
        valorUnitario: 100,
        precioUnitario: 118,
        afectacion: '10',
        base: 300,
        igv: 54,
      },
      {
        codigo: 'S2',
        descripcion: 'SERVICIO B',
        cantidad: 1,
        valorUnitario: 50.5,
        precioUnitario: 59.59,
        afectacion: '10',
        base: 50.5,
        igv: 9.09,
      },
    ],
    { gravadas: 350.5, igv: 63.09, total: 413.59 },
    'SON: CUATROCIENTOS TRECE CON 59/100 SOLES',
  ),
  escenario(
    'factura con gravado, exonerado e inafecto',
    {
      tipo: '01',
      serie: 'F001',
      correlativo: 104,
      preciosIncluyenIgv: false,
      cliente: RUC,
      items: [
        { codigo: 'G1', descripcion: 'GRAVADO', cantidad: 2, precioUnitario: '10.00', afectacion: '10' },
        { codigo: 'E1', descripcion: 'EXONERADO', cantidad: 1, precioUnitario: '15.00', afectacion: '20' },
        { codigo: 'I1', descripcion: 'INAFECTO', cantidad: 3, precioUnitario: '5.00', afectacion: '30' },
      ],
    },
    [
      {
        codigo: 'G1',
        descripcion: 'GRAVADO',
        cantidad: 2,
        valorUnitario: 10,
        precioUnitario: 11.8,
        afectacion: '10',
        base: 20,
        igv: 3.6,
      },
      {
        codigo: 'E1',
        descripcion: 'EXONERADO',
        cantidad: 1,
        valorUnitario: 15,
        precioUnitario: 15,
        afectacion: '20',
        base: 15,
        igv: 0,
      },
      {
        codigo: 'I1',
        descripcion: 'INAFECTO',
        cantidad: 3,
        valorUnitario: 5,
        precioUnitario: 5,
        afectacion: '30',
        base: 15,
        igv: 0,
      },
    ],
    { gravadas: 20, exoneradas: 15, inafectas: 15, igv: 3.6, total: 53.6 },
    'SON: CINCUENTA Y TRES CON 60/100 SOLES',
  ),
  escenario(
    'factura con descuento sin igv',
    {
      tipo: '01',
      serie: 'F001',
      correlativo: 105,
      preciosIncluyenIgv: false,
      cliente: RUC,
      items: [
        {
          codigo: 'D1',
          descripcion: 'CON DESCUENTO',
          cantidad: 2,
          precioUnitario: '120.00',
          descuento: '20.00',
          afectacion: '10',
        },
      ],
    },
    [
      {
        codigo: 'D1',
        descripcion: 'CON DESCUENTO',
        cantidad: 2,
        valorUnitario: 120,
        precioUnitario: 129.8,
        afectacion: '10',
        base: 220,
        igv: 39.6,
        descuento: { base: 240, monto: 20, factor: 0.08333 },
      },
    ],
    { gravadas: 220, igv: 39.6, total: 259.6 },
    'SON: DOSCIENTOS CINCUENTA Y NUEVE CON 60/100 SOLES',
  ),
  escenario(
    'boleta con descuento y precio incluido',
    {
      tipo: '03',
      serie: 'B001',
      correlativo: 106,
      preciosIncluyenIgv: true,
      cliente: DNI,
      items: [
        {
          codigo: 'D2',
          descripcion: 'CON DESCUENTO',
          cantidad: 3,
          precioUnitario: '59.00',
          descuento: '17.70',
          afectacion: '10',
        },
      ],
    },
    [
      {
        codigo: 'D2',
        descripcion: 'CON DESCUENTO',
        cantidad: 3,
        valorUnitario: 50,
        precioUnitario: 53.1,
        afectacion: '10',
        base: 135,
        igv: 24.3,
        descuento: { base: 150, monto: 15, factor: 0.1 },
      },
    ],
    { gravadas: 135, igv: 24.3, total: 159.3 },
    'SON: CIENTO CINCUENTA Y NUEVE CON 30/100 SOLES',
  ),
  escenario(
    'boleta con icbper',
    {
      tipo: '03',
      serie: 'B001',
      correlativo: 107,
      preciosIncluyenIgv: true,
      cliente: DNI,
      items: [
        {
          codigo: 'B1',
          descripcion: 'BOLSA PLASTICA',
          cantidad: 2,
          precioUnitario: '1.18',
          afectacion: '10',
          aplicaIcbper: true,
        },
        { codigo: 'B2', descripcion: 'CARAMELO', cantidad: 1, precioUnitario: '1.18', afectacion: '10' },
      ],
    },
    [
      {
        codigo: 'B1',
        descripcion: 'BOLSA PLASTICA',
        cantidad: 2,
        valorUnitario: 1,
        precioUnitario: 1.18,
        afectacion: '10',
        base: 2,
        igv: 0.36,
        icbper: 1,
      },
      {
        codigo: 'B2',
        descripcion: 'CARAMELO',
        cantidad: 1,
        valorUnitario: 1,
        precioUnitario: 1.18,
        afectacion: '10',
        base: 1,
        igv: 0.18,
      },
    ],
    { gravadas: 3, igv: 0.54, icbper: 1, total: 4.54 },
    'SON: CUATRO CON 54/100 SOLES',
  ),
  escenario(
    'factura al credito en dos cuotas',
    {
      tipo: '01',
      serie: 'F001',
      correlativo: 108,
      preciosIncluyenIgv: false,
      cliente: RUC,
      formaPago: {
        tipo: 'credito',
        cuotas: [
          { monto: '590.00', vencimiento: vencimiento1 },
          { monto: '590.00', vencimiento: vencimiento2 },
        ],
      },
      items: [
        { codigo: 'C1', descripcion: 'VENTA AL CREDITO', cantidad: 1, precioUnitario: '1000.00', afectacion: '10' },
      ],
    },
    [
      {
        codigo: 'C1',
        descripcion: 'VENTA AL CREDITO',
        cantidad: 1,
        valorUnitario: 1000,
        precioUnitario: 1180,
        afectacion: '10',
        base: 1000,
        igv: 180,
      },
    ],
    { gravadas: 1000, igv: 180, total: 1180 },
    'SON: MIL CIENTO OCHENTA CON 00/100 SOLES',
    {
      forma_pago: 'CREDITO',
      monto_pendiente: 1180,
      cuotas: [
        { monto: 590, fecha_pago: vencimiento1 },
        { monto: 590, fecha_pago: vencimiento2 },
      ],
    },
  ),
];
