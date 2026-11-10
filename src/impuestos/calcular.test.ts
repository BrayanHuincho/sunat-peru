import { describe, expect, it } from 'vitest';
import { decimal, redondear } from '../dinero/index.js';
import { montoEnLetras } from '../letras/index.js';
import type { ComprobanteCalculado, ComprobanteEntrada, ItemEntrada } from '../tipos.js';
import { calcularComprobante } from './index.js';

const comprobante = (items: ItemEntrada[], extra: Partial<ComprobanteEntrada> = {}): ComprobanteEntrada => ({
  tipo: '03',
  serie: 'B001',
  correlativo: 7,
  fechaEmision: '2026-11-09',
  cliente: { tipoDocumento: '1', numeroDocumento: '12345678', nombre: 'Ana' },
  items,
  ...extra,
});

const item = (
  cantidad: string | number,
  precioUnitario: string | number,
  extra: Partial<ItemEntrada> = {},
): ItemEntrada => ({
  descripcion: 'producto',
  cantidad,
  precioUnitario,
  ...extra,
});

const sinIgv = (...items: ItemEntrada[]) => calcularComprobante(comprobante(items));
const conIgv = (...items: ItemEntrada[]) => calcularComprobante(comprobante(items, { preciosIncluyenIgv: true }));
const igvs = (c: ComprobanteCalculado) => c.lineas.map((l) => l.igv);

describe('precios sin IGV', () => {
  it('21 x 20', () => {
    const { lineas, totales } = sinIgv(item(21, 20));
    expect(lineas[0]).toMatchObject({
      igv: '75.60',
      base: '420.00',
      precioUnitario: '23.600000',
      valorUnitario: '20.000000',
      total: '495.60',
    });
    expect(totales).toMatchObject({ gravadas: '420.00', igv: '75.60', total: '495.60' });
  });

  it('no pierde precisión con importes que en double fallan', () => {
    expect(sinIgv(item('1.1', '1.1')).totales.gravadas).toBe('1.21');
    expect(sinIgv(item(3, '89.9')).lineas[0]?.precioUnitario).toBe('106.082000');
  });

  it('valor unitario con cinco decimales vuelve a sumar 76.00', () => {
    expect(sinIgv(item(2, (38 / 1.18).toFixed(5))).totales.total).toBe('76.00');
  });

  it('una sola línea no se ajusta', () => {
    expect(sinIgv(item(3, '33.33')).totales).toMatchObject({ gravadas: '99.99', igv: '18.00' });
  });
});

describe('precios con IGV', () => {
  it.each([
    ['38', '32.20', '5.80', '32.203390'],
    ['118', '100.00', '18.00', '100.000000'],
    ['10', '8.47', '1.53', '8.474576'],
  ])('precio %s', (precio, base, igv, valorUnitario) => {
    const { lineas, totales } = conIgv(item(1, precio));
    expect(totales).toMatchObject({ gravadas: base, igv });
    expect(totales.total).toBe(decimal(precio).toFixed(2));
    expect(lineas[0]?.valorUnitario).toBe(valorUnitario);
    expect(lineas[0]?.precioUnitario).toBe(decimal(precio).toFixed(6));
  });

  it('no ajusta y cada línea conserva lo cobrado', () => {
    const c = conIgv(item(1, '0.05'), item(1, '0.05'), item(1, '0.05'));
    expect(c.totales.total).toBe('0.15');
    for (const linea of c.lineas) expect(linea.total).toBe('0.05');
  });

  it('respeta un porcentaje distinto', () => {
    const c = calcularComprobante(comprobante([item(1, 110)], { preciosIncluyenIgv: true, porcentajeIgv: 10 }));
    expect(c.porcentajeIgv).toBe('10.00');
    expect(c.totales).toMatchObject({ gravadas: '100.00', igv: '10.00' });
  });
});

describe('afectaciones', () => {
  it('exonerada e inafecta no llevan IGV', () => {
    const { lineas, totales } = sinIgv(item(1, 100, { afectacion: '20' }), item(2, 10, { afectacion: '30' }));
    expect(totales).toMatchObject({
      exoneradas: '100.00',
      inafectas: '20.00',
      gravadas: '0.00',
      igv: '0.00',
      total: '120.00',
    });
    expect(lineas.map((l) => l.afectacion)).toEqual(['20', '30']);
  });

  it('exonerada con precio incluido no desglosa', () => {
    const { lineas, totales } = conIgv(item(3, '9.90', { afectacion: '20' }));
    expect(totales).toMatchObject({ exoneradas: '29.70', total: '29.70' });
    expect(lineas[0]).toMatchObject({ valorUnitario: '9.900000', precioUnitario: '9.900000', igv: '0.00' });
  });

  it('documento mixto', () => {
    const { totales } = conIgv(item(2, 59), item(1, 10, { afectacion: '20' }), item(1, 5, { afectacion: '30' }));
    expect(totales).toEqual({
      gravadas: '100.00',
      exoneradas: '10.00',
      inafectas: '5.00',
      descuentos: '0.00',
      igv: '18.00',
      icbper: '0.00',
      totalImpuestos: '18.00',
      valorVenta: '115.00',
      total: '133.00',
    });
  });
});

describe('ajuste de céntimo', () => {
  it('baja el IGV de la línea mayor cuando las líneas se pasan', () => {
    const c = sinIgv(item(1, '0.03'), item(1, '0.05'), item(1, '0.03'));
    expect(igvs(c)).toEqual(['0.01', '0.00', '0.01']);
    expect(c.totales.igv).toBe('0.02');
  });

  it('sube en la primera de mayor base si hay empate', () => {
    const c = sinIgv(item(1, '0.02'), item(1, '0.02'), item(1, '0.02'));
    expect(igvs(c)).toEqual(['0.01', '0.00', '0.00']);
    expect(c.totales.igv).toBe('0.01');
  });

  it('no toca el IGV si ya cuadra', () => {
    const c = sinIgv(item(1, '0.05'), item(1, '0.05'), item(1, '0.05'));
    expect(igvs(c)).toEqual(['0.01', '0.01', '0.01']);
    expect(c.totales).toMatchObject({ igv: '0.03', total: '0.18' });
  });

  it('ignora las líneas no gravadas', () => {
    const c = sinIgv(item(1, 1000, { afectacion: '20' }), item(1, '0.02'), item(1, '0.02'), item(1, '0.02'));
    expect(igvs(c)).toEqual(['0.00', '0.01', '0.00', '0.00']);
  });

  it('nunca deja una línea con IGV negativo', () => {
    const c = sinIgv(...Array.from({ length: 100 }, () => item(1, '0.03')));
    expect(c.totales.igv).toBe('0.54');
    expect(c.lineas.every((l) => decimal(l.igv).gte(0))).toBe(true);
    expect(c.lineas.filter((l) => l.igv === '0.01')).toHaveLength(54);
  });
});

describe('descuentos por línea', () => {
  it('sin IGV', () => {
    const { lineas, totales } = sinIgv(item(1, 45), item(2, 120, { descuento: 20 }));
    expect(lineas[1]).toMatchObject({
      valorUnitario: '120.000000',
      base: '220.00',
      igv: '39.60',
      precioUnitario: '129.800000',
      descuento: '20.00',
    });
    expect(totales).toMatchObject({ total: '312.70', descuentos: '20.00' });
  });

  it('con IGV incluido se cobra exacto', () => {
    const { lineas, totales } = conIgv(item(3, 59, { descuento: '17.7' }));
    expect(totales.total).toBe('159.30');
    expect(lineas[0]).toMatchObject({
      base: '135.00',
      igv: '24.30',
      precioUnitario: '53.100000',
      valorUnitario: '50.000000',
    });
  });

  it('céntimos que no dividen exacto siguen cuadrando', () => {
    expect(conIgv(item(7, '13.9', { descuento: '3.33' }), item(1, 10)).totales.total).toBe('103.97');
  });

  it('exonerada', () => {
    const { lineas, totales } = sinIgv(item(4, 25, { afectacion: '20', descuento: 10 }));
    expect(lineas[0]).toMatchObject({ base: '90.00', igv: '0.00', precioUnitario: '22.500000' });
    expect(totales.exoneradas).toBe('90.00');
  });

  it('el descuento se redondea a dos decimales', () => {
    expect(sinIgv(item(1, 10, { descuento: '1.005' })).lineas[0]?.descuento).toBe('1.01');
  });
});

describe('ICBPER', () => {
  it('va fuera de la base y del IGV', () => {
    const { lineas, totales } = conIgv(item(3, '1.18', { aplicaIcbper: true }));
    expect(lineas[0]).toMatchObject({ icbper: '1.50', total: '5.04', precioUnitario: '1.180000' });
    expect(totales).toMatchObject({
      icbper: '1.50',
      gravadas: '3.00',
      igv: '0.54',
      totalImpuestos: '2.04',
      total: '5.04',
    });
  });

  it('no se aplica sin la marca', () => {
    expect(conIgv(item(3, 1)).totales.icbper).toBe('0.00');
  });

  it('se suma en exoneradas y con cantidades fraccionadas', () => {
    expect(sinIgv(item('1.5', 2, { afectacion: '20', aplicaIcbper: true })).totales).toMatchObject({
      icbper: '0.75',
      total: '3.75',
    });
  });
});

describe('datos del documento', () => {
  it('aplica los valores por defecto', () => {
    const c = sinIgv(item(1, 1));
    expect(c).toMatchObject({
      numero: 'B001-7',
      moneda: 'PEN',
      porcentajeIgv: '18.00',
      horaEmision: '00:00:00',
      formaPago: { tipo: 'contado' },
    });
    expect(c.lineas[0]).toMatchObject({ orden: 1, unidad: 'NIU', afectacion: '10', cantidad: '1.0000000000' });
    expect(c.lineas[0]).not.toHaveProperty('codigo');
  });

  it('respeta los valores entregados', () => {
    const c = calcularComprobante(
      comprobante([item(1, 1, { codigo: 'A1', unidad: 'ZZ' })], { horaEmision: '10:30:00', moneda: 'USD' }),
    );
    expect(c).toMatchObject({ horaEmision: '10:30:00', moneda: 'USD' });
    expect(c.lineas[0]).toMatchObject({ codigo: 'A1', unidad: 'ZZ' });
  });

  it.each(['PEN', 'USD'] as const)('leyenda 1000 con el total en %s', (moneda) => {
    const c = calcularComprobante(comprobante([item(3, '1.18', { aplicaIcbper: true })], { moneda }));
    expect(c.leyendas).toEqual([{ codigo: '1000', valor: montoEnLetras(c.totales.total, moneda) }]);
  });

  it('formatea las cuotas de crédito', () => {
    const cuotas = [
      { monto: 50, vencimiento: '2026-12-09' },
      { monto: '68.005', vencimiento: '2027-01-09' },
    ];
    const c = calcularComprobante(comprobante([item(1, 100)], { formaPago: { tipo: 'credito', cuotas } }));
    expect(c.formaPago).toEqual({
      tipo: 'credito',
      cuotas: [
        { monto: '50.00', vencimiento: '2026-12-09' },
        { monto: '68.01', vencimiento: '2027-01-09' },
      ],
    });
  });

  it('no modifica la entrada', () => {
    const entrada = comprobante([item(2, '10.5', { descuento: 1, aplicaIcbper: true })]);
    const copia = structuredClone(entrada);
    calcularComprobante(entrada);
    expect(entrada).toEqual(copia);
  });

  it('es determinista', () => {
    const entrada = comprobante([item(1, '0.02'), item(1, '0.02')]);
    expect(calcularComprobante(entrada)).toEqual(calcularComprobante(entrada));
  });
});

const generador = (semilla: number) => () => {
  semilla = (semilla + 0x6d2b79f5) | 0;
  let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const sumaDe = (valores: string[]) => valores.reduce((suma, v) => suma.add(v), decimal(0)).toFixed(2);
const DOS_DECIMALES = /^-?\d+\.\d{2}$/;
const SEIS_DECIMALES = /^\d+\.\d{6}$/;

function verificarInvariantes(c: ComprobanteCalculado, entrada: ComprobanteEntrada): void {
  const { lineas, totales } = c;
  const baseDe = (afectacion: string) => sumaDe(lineas.filter((l) => l.afectacion === afectacion).map((l) => l.base));
  const porcentaje = decimal(entrada.porcentajeIgv ?? 18).div(100);

  expect(baseDe('10')).toBe(totales.gravadas);
  expect(baseDe('20')).toBe(totales.exoneradas);
  expect(baseDe('30')).toBe(totales.inafectas);
  expect(sumaDe(lineas.map((l) => l.base))).toBe(totales.valorVenta);
  expect(sumaDe(lineas.map((l) => l.igv))).toBe(totales.igv);
  expect(sumaDe(lineas.map((l) => l.icbper))).toBe(totales.icbper);
  expect(sumaDe(lineas.map((l) => l.descuento))).toBe(totales.descuentos);
  expect(sumaDe(lineas.map((l) => l.total))).toBe(totales.total);
  expect(sumaDe([totales.igv, totales.icbper])).toBe(totales.totalImpuestos);
  expect(sumaDe([totales.valorVenta, totales.igv, totales.icbper])).toBe(totales.total);
  expect(montoEnLetras(totales.total, c.moneda)).toBe(c.leyendas[0]?.valor);

  for (const valor of Object.values(totales)) expect(valor).toMatch(DOS_DECIMALES);

  if (!entrada.preciosIncluyenIgv) {
    expect(totales.igv).toBe(redondear(decimal(totales.gravadas).mul(porcentaje)).toFixed(2));
  }

  lineas.forEach((linea, i) => {
    const original = entrada.items[i] as ItemEntrada;
    const importe = redondear(decimal(original.cantidad).mul(original.precioUnitario)).sub(linea.descuento);

    expect(linea.orden).toBe(i + 1);
    expect(linea.valorUnitario).toMatch(SEIS_DECIMALES);
    expect(linea.precioUnitario).toMatch(SEIS_DECIMALES);
    expect(linea.total).toBe(sumaDe([linea.base, linea.igv, linea.icbper]));
    expect(decimal(linea.igv).gte(0)).toBe(true);
    if (linea.afectacion !== '10') expect(linea.igv).toBe('0.00');
    if (linea.afectacion !== '10' || !entrada.preciosIncluyenIgv) expect(linea.base).toBe(importe.toFixed(2));
    if (linea.afectacion === '10' && entrada.preciosIncluyenIgv) {
      expect(sumaDe([linea.base, linea.igv])).toBe(importe.toFixed(2));
    }
    const icbperEsperado = original.aplicaIcbper ? redondear(decimal(original.cantidad).mul('0.5')).toFixed(2) : '0.00';
    expect(linea.icbper).toBe(icbperEsperado);
  });
}

describe('invariantes por fuerza bruta', () => {
  it('grilla exhaustiva de una línea en todas las combinaciones', () => {
    const cantidades = ['1', '2', '3', '7', '0.5', '1.333', '12.75'];
    const precios = ['0.01', '0.03', '0.05', '0.99', '1.18', '9.90', '10', '33.33', '89.9', '1234.565', '32.203390'];
    const descuentos = [undefined, '0.01', '0.25'];
    for (const afectacion of ['10', '20', '30'] as const) {
      for (const preciosIncluyenIgv of [true, false]) {
        for (const aplicaIcbper of [true, false]) {
          for (const cantidad of cantidades) {
            for (const precio of precios) {
              for (const descuento of descuentos) {
                if (descuento && decimal(cantidad).mul(precio).lt('0.50')) continue;
                const entrada = comprobante(
                  [item(cantidad, precio, { afectacion, aplicaIcbper, ...(descuento ? { descuento } : {}) })],
                  { preciosIncluyenIgv },
                );
                verificarInvariantes(calcularComprobante(entrada), entrada);
              }
            }
          }
        }
      }
    }
  });

  it.each([true, false])('todos los pares de céntimos con precios incluidos = %s', (preciosIncluyenIgv) => {
    for (let a = 1; a <= 120; a++) {
      for (let b = 1; b <= 120; b += 3) {
        const entrada = comprobante([item(1, (a / 100).toFixed(2)), item(1, (b / 100).toFixed(2))], {
          preciosIncluyenIgv,
        });
        verificarInvariantes(calcularComprobante(entrada), entrada);
      }
    }
  });

  it.each([true, false])('documentos aleatorios con precios incluidos = %s', (preciosIncluyenIgv) => {
    const azar = generador(preciosIncluyenIgv ? 20261109 : 19900101);
    const entre = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));
    const afectaciones = ['10', '10', '10', '20', '30'] as const;

    for (let n = 0; n < 3000; n++) {
      const items = Array.from({ length: entre(1, 25) }, () => {
        const cantidad = (entre(1, 5000) / 100).toFixed(2);
        const precio = (entre(1, azar() < 0.5 ? 100 : 500000) / 1000).toFixed(3);
        const bruto = redondear(decimal(cantidad).mul(precio));
        const descuento = azar() < 0.3 ? bruto.mul(azar()).toDecimalPlaces(2, 1).toFixed(2) : undefined;
        return item(cantidad, precio, {
          afectacion: afectaciones[entre(0, 4)] as '10' | '20' | '30',
          aplicaIcbper: azar() < 0.2,
          ...(descuento ? { descuento } : {}),
        });
      });
      const entrada = comprobante(items, { preciosIncluyenIgv, ...(azar() < 0.2 ? { porcentajeIgv: '10' } : {}) });
      verificarInvariantes(calcularComprobante(entrada), entrada);
    }
  });
});
