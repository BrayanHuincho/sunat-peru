import type { Decimal } from 'decimal.js';
import { decimal, fijo, redondear } from '../dinero/index.js';
import { montoEnLetras } from '../letras/index.js';
import type {
  Afectacion,
  ComprobanteCalculado,
  ComprobanteEntrada,
  FormaPago,
  ItemEntrada,
  LineaCalculada,
  TotalesCalculados,
} from '../tipos.js';

const IGV_POR_DEFECTO = '18';
const ICBPER_POR_UNIDAD = '0.50';
const UNIDAD_POR_DEFECTO = 'NIU';
const HORA_POR_DEFECTO = '00:00:00';
const DECIMALES_UNITARIOS = 6;
const DECIMALES_CANTIDAD = 10;
const CODIGO_LEYENDA_MONTO_EN_LETRAS = '1000';

interface Tasas {
  factor: Decimal;
  uno: Decimal;
  incluyeIgv: boolean;
}

interface LineaEnCalculo {
  item: ItemEntrada;
  afectacion: Afectacion;
  cantidad: Decimal;
  valorUnitario: Decimal;
  precioLista: Decimal;
  descuento: Decimal;
  base: Decimal;
  igv: Decimal;
  icbper: Decimal;
}

const sumar = (valores: Decimal[]): Decimal => valores.reduce((suma, valor) => suma.add(valor), decimal(0));

function calcularLinea(item: ItemEntrada, { factor, uno, incluyeIgv }: Tasas): LineaEnCalculo {
  const afectacion = item.afectacion ?? '10';
  const gravada = afectacion === '10';
  const cantidad = decimal(item.cantidad);
  const precio = decimal(item.precioUnitario);
  const descuento = redondear(decimal(item.descuento ?? 0));
  const importe = redondear(cantidad.mul(precio)).sub(descuento);
  const desglosar = gravada && incluyeIgv;

  const base = desglosar ? redondear(importe.div(uno)) : importe;
  const igv = desglosar ? importe.sub(base) : gravada ? redondear(base.mul(factor)) : decimal(0);

  return {
    item,
    afectacion,
    cantidad,
    valorUnitario: desglosar ? precio.div(uno) : precio,
    precioLista: gravada && !incluyeIgv ? precio.mul(uno) : precio,
    descuento,
    base,
    igv,
    icbper: item.aplicaIcbper ? redondear(cantidad.mul(ICBPER_POR_UNIDAD)) : decimal(0),
  };
}

function ajustarIgvAlDocumento(lineas: LineaEnCalculo[], factor: Decimal): void {
  const gravadas = lineas.filter((linea) => linea.afectacion === '10');
  const igvDocumento = redondear(sumar(gravadas.map((linea) => linea.base)).mul(factor));
  let diferencia = igvDocumento.sub(sumar(gravadas.map((linea) => linea.igv)));

  // con muchas líneas de céntimos la diferencia supera el igv de la mayor, y una línea con igv negativo la rechaza sunat
  for (const linea of [...gravadas].sort((a, b) => b.base.comparedTo(a.base))) {
    if (diferencia.isZero()) break;
    const ajuste = diferencia.isNegative() && diferencia.lt(linea.igv.neg()) ? linea.igv.neg() : diferencia;
    linea.igv = linea.igv.add(ajuste);
    diferencia = diferencia.sub(ajuste);
  }
}

function aLineaCalculada(linea: LineaEnCalculo, indice: number): LineaCalculada {
  const { item, cantidad, descuento, base, igv, icbper } = linea;
  const precioUnitario = descuento.gt(0) && cantidad.gt(0) ? base.add(igv).div(cantidad) : linea.precioLista;

  return {
    orden: indice + 1,
    ...(item.codigo === undefined ? {} : { codigo: item.codigo }),
    descripcion: item.descripcion,
    unidad: item.unidad ?? UNIDAD_POR_DEFECTO,
    cantidad: fijo(cantidad, DECIMALES_CANTIDAD),
    valorUnitario: fijo(redondear(linea.valorUnitario, DECIMALES_UNITARIOS), DECIMALES_UNITARIOS),
    precioUnitario: fijo(redondear(precioUnitario, DECIMALES_UNITARIOS), DECIMALES_UNITARIOS),
    descuento: fijo(descuento),
    afectacion: linea.afectacion,
    base: fijo(base),
    igv: fijo(igv),
    icbper: fijo(icbper),
    total: fijo(base.add(igv).add(icbper)),
  };
}

function totalizar(lineas: LineaEnCalculo[]): TotalesCalculados {
  const baseDe = (afectacion: Afectacion) =>
    sumar(lineas.filter((linea) => linea.afectacion === afectacion).map((linea) => linea.base));
  const gravadas = baseDe('10');
  const exoneradas = baseDe('20');
  const inafectas = baseDe('30');
  const igv = sumar(lineas.map((linea) => linea.igv));
  const icbper = sumar(lineas.map((linea) => linea.icbper));
  const valorVenta = gravadas.add(exoneradas).add(inafectas);

  return {
    gravadas: fijo(gravadas),
    exoneradas: fijo(exoneradas),
    inafectas: fijo(inafectas),
    descuentos: fijo(sumar(lineas.map((linea) => linea.descuento))),
    igv: fijo(igv),
    icbper: fijo(icbper),
    totalImpuestos: fijo(igv.add(icbper)),
    valorVenta: fijo(valorVenta),
    total: fijo(valorVenta.add(igv).add(icbper)),
  };
}

function calcularFormaPago(formaPago: FormaPago | undefined): ComprobanteCalculado['formaPago'] {
  if (formaPago?.tipo !== 'credito') return { tipo: 'contado' };
  return {
    tipo: 'credito',
    cuotas: formaPago.cuotas.map(({ monto, vencimiento }) => ({
      monto: fijo(redondear(decimal(monto))),
      vencimiento,
    })),
  };
}

export function calcularComprobante(entrada: ComprobanteEntrada): ComprobanteCalculado {
  const moneda = entrada.moneda ?? 'PEN';
  const porcentaje = decimal(entrada.porcentajeIgv ?? IGV_POR_DEFECTO);
  const factor = porcentaje.div(100);
  const incluyeIgv = entrada.preciosIncluyenIgv ?? false;
  const tasas: Tasas = { factor, uno: factor.add(1), incluyeIgv };

  const lineas = entrada.items.map((item) => calcularLinea(item, tasas));
  if (!incluyeIgv) ajustarIgvAlDocumento(lineas, factor);

  const totales = totalizar(lineas);

  return {
    tipo: entrada.tipo,
    serie: entrada.serie,
    correlativo: entrada.correlativo,
    numero: `${entrada.serie}-${entrada.correlativo}`,
    fechaEmision: entrada.fechaEmision,
    horaEmision: entrada.horaEmision ?? HORA_POR_DEFECTO,
    moneda,
    porcentajeIgv: fijo(porcentaje),
    formaPago: calcularFormaPago(entrada.formaPago),
    cliente: { ...entrada.cliente },
    lineas: lineas.map(aLineaCalculada),
    totales,
    leyendas: [{ codigo: CODIGO_LEYENDA_MONTO_EN_LETRAS, valor: montoEnLetras(totales.total, moneda) }],
  };
}
