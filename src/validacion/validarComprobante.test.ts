import { describe, expect, it } from 'vitest';
import { ErrorValidacion } from '../errores.js';
import type { ComprobanteEntrada, Emisor, ItemEntrada } from '../tipos.js';
import { validarComprobante } from './index.js';

const HOY = '2026-11-09';

const emisor: Emisor = {
  ruc: '20100066603',
  razonSocial: 'EMPRESA SAC',
  domicilio: { ubigeo: '150101', departamento: 'LIMA', provincia: 'LIMA', distrito: 'LIMA', direccion: 'AV. UNO 123' },
};

const item: ItemEntrada = { descripcion: 'Producto', cantidad: 2, precioUnitario: '50.00' };

function factura(cambios: Partial<ComprobanteEntrada> = {}): ComprobanteEntrada {
  return {
    tipo: '01',
    serie: 'F001',
    correlativo: 1,
    fechaEmision: HOY,
    cliente: { tipoDocumento: '6', numeroDocumento: '20000000001', nombre: 'CLIENTE SAC' },
    items: [item],
    ...cambios,
  };
}

function boleta(cambios: Partial<ComprobanteEntrada> = {}): ComprobanteEntrada {
  return factura({
    tipo: '03',
    serie: 'B001',
    cliente: { tipoDocumento: '1', numeroDocumento: '12345678', nombre: 'JUAN PEREZ' },
    ...cambios,
  });
}

function problemas(entrada: ComprobanteEntrada, e: Emisor = emisor, hoy = HOY) {
  try {
    validarComprobante(entrada, e, hoy);
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorValidacion);
    return (error as ErrorValidacion).problemas;
  }
  return [];
}

const campos = (entrada: ComprobanteEntrada, e?: Emisor, hoy?: string) =>
  problemas(entrada, e, hoy).map((p) => p.campo);
const sinDocumento = { tipoDocumento: '0', numeroDocumento: '-', nombre: 'CLIENTES VARIOS' } as const;
const conImporte = (precio: string): ItemEntrada[] => [
  { descripcion: 'X', cantidad: 1, precioUnitario: precio, afectacion: '20' },
];

describe('validarComprobante', () => {
  it('acepta una factura y una boleta correctas', () => {
    expect(problemas(factura())).toEqual([]);
    expect(problemas(boleta())).toEqual([]);
  });

  it('reúne todos los problemas en un solo error', () => {
    const lista = campos(
      factura({
        serie: 'B001',
        correlativo: 0,
        fechaEmision: '2026-12-01',
        cliente: { tipoDocumento: '1', numeroDocumento: '123', nombre: '' },
        items: [item, item, { descripcion: '', cantidad: 0, precioUnitario: -1 }],
      }),
      { ...emisor, ruc: '123' },
    );
    expect(lista).toEqual([
      'emisor.ruc',
      'serie',
      'correlativo',
      'fechaEmision',
      'cliente.tipoDocumento',
      'cliente.numeroDocumento',
      'cliente.nombre',
      'items[2].descripcion',
      'items[2].cantidad',
      'items[2].precioUnitario',
    ]);
  });

  describe('RUC', () => {
    it.each(['20100066603', '20000000001', '10001000000', '10000100001'])('acepta %s', (numero) => {
      expect(campos(factura({ cliente: { tipoDocumento: '6', numeroDocumento: numero, nombre: 'X' } }))).toEqual([]);
    });

    it.each(['20100066604', '30100066603', '2010006660', 'abcdefghijk'])('rechaza %s', (numero) => {
      expect(campos(factura({ cliente: { tipoDocumento: '6', numeroDocumento: numero, nombre: 'X' } }))).toEqual([
        'cliente.numeroDocumento',
      ]);
    });

    it('valida también el RUC del emisor', () => {
      expect(campos(factura(), { ...emisor, ruc: '20100066604' })).toEqual(['emisor.ruc']);
    });
  });

  it('exige 8 dígitos en el DNI', () => {
    const cliente = { tipoDocumento: '1', numeroDocumento: '1234567', nombre: 'X' } as const;
    expect(campos(boleta({ cliente }))).toEqual(['cliente.numeroDocumento']);
  });

  it('exige RUC en la factura', () => {
    const cliente = { tipoDocumento: '1', numeroDocumento: '12345678', nombre: 'X' } as const;
    expect(campos(factura({ cliente }))).toEqual(['cliente.tipoDocumento']);
  });

  it('valida carné y tipo de documento', () => {
    expect(campos(boleta({ cliente: { tipoDocumento: '4', numeroDocumento: 'A1', nombre: 'X' } }))).toEqual([
      'cliente.numeroDocumento',
    ]);
    expect(campos(boleta({ cliente: { tipoDocumento: '9' as '1', numeroDocumento: '1', nombre: 'X' } }))).toEqual([
      'cliente.tipoDocumento',
    ]);
  });

  describe('numeración', () => {
    it('exige el prefijo según el tipo', () => {
      expect(campos(factura({ serie: 'B001' }))).toEqual(['serie']);
      expect(campos(boleta({ serie: 'F001' }))).toEqual(['serie']);
    });

    it.each(['F01', 'F0001', 'f001', 'F-01'])('rechaza la serie %s', (serie) => {
      expect(campos(factura({ serie }))).toEqual(['serie']);
    });

    it('rechaza un tipo desconocido', () => {
      expect(campos(factura({ tipo: '07' as '01' }))).toEqual(['tipo']);
    });

    it.each([0, -1, 1.5, 100_000_000, Number.NaN])('rechaza el correlativo %s', (correlativo) => {
      expect(campos(factura({ correlativo }))).toEqual(['correlativo']);
    });

    it('acepta los extremos del correlativo', () => {
      expect(campos(factura({ correlativo: 1 }))).toEqual([]);
      expect(campos(factura({ correlativo: 99_999_999 }))).toEqual([]);
    });
  });

  describe('fechas', () => {
    it('factura hasta 3 días atrás y boleta hasta 7', () => {
      expect(campos(factura({ fechaEmision: '2026-11-06' }))).toEqual([]);
      expect(campos(factura({ fechaEmision: '2026-11-05' }))).toEqual(['fechaEmision']);
      expect(campos(boleta({ fechaEmision: '2026-11-02' }))).toEqual([]);
      expect(campos(boleta({ fechaEmision: '2026-11-01' }))).toEqual(['fechaEmision']);
    });

    it('nunca futura', () => {
      expect(campos(factura({ fechaEmision: '2026-11-10' }))).toEqual(['fechaEmision']);
    });

    it.each(['2026-02-30', '2026-13-01', '09/11/2026', ''])('rechaza la fecha %s', (fechaEmision) => {
      expect(campos(factura({ fechaEmision }))).toEqual(['fechaEmision']);
    });

    it('depende solo de hoy', () => {
      expect(campos(factura({ fechaEmision: '2020-01-01' }), emisor, '2020-01-02')).toEqual([]);
    });

    it('rechaza un hoy inválido y una hora mal formada', () => {
      expect(campos(factura(), emisor, 'ayer')).toEqual(['hoy']);
      expect(campos(factura({ horaEmision: '25:00:00' }))).toEqual(['horaEmision']);
      expect(campos(factura({ horaEmision: '10:30:00' }))).toEqual([]);
    });
  });

  describe('ítems', () => {
    it('exige al menos un ítem', () => {
      expect(campos(factura({ items: [] }))).toEqual(['items']);
    });

    it.each([0, -1, 'abc', '', '1e3'])('rechaza la cantidad %s', (cantidad) => {
      expect(campos(factura({ items: [item, { ...item, cantidad }] }))).toEqual(['items[1].cantidad']);
    });

    it('acepta precio cero y cantidades decimales', () => {
      expect(campos(factura({ items: [{ ...item, cantidad: '0.5', precioUnitario: 0 }] }))).toEqual([]);
    });

    it('limita el descuento al importe del ítem', () => {
      expect(campos(factura({ items: [{ ...item, descuento: '100.00' }] }))).toEqual([]);
      expect(campos(factura({ items: [{ ...item, descuento: '100.01' }] }))).toEqual(['items[0].descuento']);
      expect(campos(factura({ items: [{ ...item, descuento: -1 }] }))).toEqual(['items[0].descuento']);
    });

    it('rechaza una afectación desconocida', () => {
      expect(campos(factura({ items: [{ ...item, afectacion: '40' as '10' }] }))).toEqual(['items[0].afectacion']);
    });
  });

  describe('configuración', () => {
    it('rechaza moneda desconocida', () => {
      expect(campos(factura({ moneda: 'EUR' as 'PEN' }))).toEqual(['moneda']);
    });

    it('pide el IGV como porcentaje', () => {
      expect(campos(factura({ porcentajeIgv: 18 }))).toEqual([]);
      expect(campos(factura({ porcentajeIgv: '0.18' }))).toEqual(['porcentajeIgv']);
    });
  });

  describe('tope de S/ 700', () => {
    it('admite exactamente 700 sin documento', () => {
      expect(campos(boleta({ cliente: sinDocumento, items: conImporte('700.00') }))).toEqual([]);
    });

    it('rechaza más de 700 sin documento', () => {
      expect(campos(boleta({ cliente: sinDocumento, items: conImporte('700.01') }))).toEqual([
        'cliente.numeroDocumento',
      ]);
    });

    it('trata un número de ceros como sin documento', () => {
      const cliente = { tipoDocumento: '1', numeroDocumento: '00000000', nombre: 'X' } as const;
      expect(campos(boleta({ cliente, items: conImporte('700.01') }))).toEqual(['cliente.numeroDocumento']);
    });

    it('admite más de 700 con DNI', () => {
      expect(campos(boleta({ items: conImporte('5000.00') }))).toEqual([]);
    });

    it('no aplica en dólares', () => {
      expect(campos(boleta({ cliente: sinDocumento, moneda: 'USD', items: conImporte('700.01') }))).toEqual([]);
    });

    it('se informa aunque otro campo ajeno al importe esté mal', () => {
      const lista = campos(
        boleta({ serie: 'X', cliente: sinDocumento, items: [{ ...conImporte('800.00')[0]!, descripcion: '' }] }),
      );
      expect(lista).toEqual(['serie', 'items[0].descripcion', 'cliente.numeroDocumento']);
    });
  });

  describe('cuotas', () => {
    const items = conImporte('100.00');
    const credito = (cuotas: { monto: string | number; vencimiento: string }[]) =>
      factura({ items, formaPago: { tipo: 'credito', cuotas } });

    it('acepta cuotas que suman el total', () => {
      expect(
        campos(
          credito([
            { monto: '40.00', vencimiento: '2026-12-01' },
            { monto: 60, vencimiento: '2027-01-01' },
          ]),
        ),
      ).toEqual([]);
    });

    it('acepta contado sin cuotas', () => {
      expect(campos(factura({ formaPago: { tipo: 'contado' } }))).toEqual([]);
    });

    it('exige al menos una cuota', () => {
      expect(campos(credito([]))).toEqual(['formaPago.cuotas']);
    });

    it('exige que sumen el total', () => {
      const lista = problemas(credito([{ monto: '99.99', vencimiento: '2026-12-01' }]));
      expect(lista.map((p) => p.campo)).toEqual(['formaPago.cuotas']);
      expect(lista[0]!.mensaje).toContain('99.99');
      expect(lista[0]!.mensaje).toContain('100.00');
    });

    it('exige monto positivo y vencimiento posterior a la emisión', () => {
      const lista = campos(
        credito([
          { monto: 0, vencimiento: HOY },
          { monto: '100.00', vencimiento: 'pronto' },
        ]),
      );
      expect(lista).toEqual([
        'formaPago.cuotas[0].monto',
        'formaPago.cuotas[0].vencimiento',
        'formaPago.cuotas[1].vencimiento',
      ]);
    });

    it('rechaza una forma de pago desconocida', () => {
      expect(campos(factura({ formaPago: { tipo: 'canje' } as unknown as { tipo: 'contado' } }))).toEqual([
        'formaPago.tipo',
      ]);
    });
  });

  it('no revienta con una entrada incompleta', () => {
    const lista = campos({ tipo: '01' } as ComprobanteEntrada, {} as Emisor);
    expect(lista).toEqual(
      expect.arrayContaining(['emisor.ruc', 'serie', 'correlativo', 'fechaEmision', 'cliente', 'items']),
    );
  });

  it('da mensajes con el valor recibido', () => {
    const [problema] = problemas(factura({ items: [{ ...item, cantidad: 'abc' }] }));
    expect(problema).toEqual({ campo: 'items[0].cantidad', mensaje: expect.stringContaining('"abc"') });
  });
});
