import { decimal, fijo, redondear } from '../dinero/index.js';
import { ErrorValidacion, type ProblemaValidacion } from '../errores.js';
import { calcularComprobante } from '../impuestos/index.js';
import type { Cliente, ComprobanteEntrada, Emisor, ItemEntrada } from '../tipos.js';
import { diasEntre, esFechaValida, esHoraValida, esNumeroEntrada, esRucValido, tieneTexto } from './reglas.js';

type Numero = ReturnType<typeof decimal>;

const TOPE_BOLETA_SIN_DOCUMENTO = 700;
const CORRELATIVO_MAXIMO = 99_999_999;
const DIAS_ATRAS: Record<string, number> = { '01': 3, '03': 7 };
const LETRA_SERIE: Record<string, string> = { '01': 'F', '03': 'B' };
const NOMBRE_TIPO: Record<string, string> = { '01': 'factura', '03': 'boleta' };
const TIPOS_DOCUMENTO = ['0', '1', '4', '6', '7', 'A'];
const AFECTACIONES = ['10', '20', '30'];

class Recolector {
  readonly problemas: ProblemaValidacion[] = [];

  agregar(campo: string, mensaje: string): void {
    this.problemas.push({ campo, mensaje });
  }

  numero(campo: string, valor: unknown): Numero | null {
    if (esNumeroEntrada(valor)) return decimal(valor);
    this.agregar(campo, `debe ser un número, por ejemplo 10 o "10.50"; se recibió ${JSON.stringify(valor)}`);
    return null;
  }
}

function validarEmisor(emisor: Emisor, r: Recolector): void {
  if (!esRucValido(String(emisor?.ruc))) {
    r.agregar(
      'emisor.ruc',
      `"${emisor?.ruc}" no es un RUC válido: revisa los 11 dígitos, el prefijo (10, 15, 16, 17 o 20) y el dígito verificador`,
    );
  }
  if (!tieneTexto(emisor?.razonSocial)) r.agregar('emisor.razonSocial', 'indica la razón social del emisor');
  if (!/^\d{6}$/.test(String(emisor?.domicilio?.ubigeo)))
    r.agregar('emisor.domicilio.ubigeo', 'el ubigeo debe tener 6 dígitos');
}

function validarNumeracion(entrada: ComprobanteEntrada, r: Recolector): void {
  const letra = LETRA_SERIE[entrada.tipo];
  if (!letra) r.agregar('tipo', `"${entrada.tipo}" no es un tipo admitido: usa "01" (factura) o "03" (boleta)`);

  if (typeof entrada.serie !== 'string' || !/^[A-Z][A-Z0-9]{3}$/.test(entrada.serie)) {
    r.agregar(
      'serie',
      `"${entrada.serie}" no es una serie válida: debe tener 4 caracteres en mayúscula, por ejemplo ${letra ?? 'F'}001`,
    );
  } else if (letra && entrada.serie[0] !== letra) {
    r.agregar(
      'serie',
      `la serie de una ${NOMBRE_TIPO[entrada.tipo]} debe empezar con ${letra}; se recibió "${entrada.serie}"`,
    );
  }

  if (!Number.isInteger(entrada.correlativo) || entrada.correlativo < 1 || entrada.correlativo > CORRELATIVO_MAXIMO) {
    r.agregar('correlativo', `debe ser un entero entre 1 y ${CORRELATIVO_MAXIMO}; se recibió ${entrada.correlativo}`);
  }
}

function validarFechas(entrada: ComprobanteEntrada, hoy: string, r: Recolector): void {
  const { fechaEmision, horaEmision, tipo } = entrada;
  if (!esFechaValida(hoy)) r.agregar('hoy', `"${hoy}" no es una fecha real en formato YYYY-MM-DD`);

  if (!esFechaValida(fechaEmision)) {
    r.agregar('fechaEmision', `"${fechaEmision}" no es una fecha real en formato YYYY-MM-DD`);
  } else if (esFechaValida(hoy)) {
    const antiguedad = diasEntre(fechaEmision, hoy);
    const maximo = DIAS_ATRAS[tipo];
    if (antiguedad < 0) {
      r.agregar('fechaEmision', `la fecha ${fechaEmision} es futura; hoy es ${hoy}`);
    } else if (maximo !== undefined && antiguedad > maximo) {
      r.agregar(
        'fechaEmision',
        `una ${NOMBRE_TIPO[tipo]} admite hasta ${maximo} días de antigüedad y esta tiene ${antiguedad}`,
      );
    }
  }

  if (horaEmision !== undefined && !esHoraValida(horaEmision)) {
    r.agregar('horaEmision', `"${horaEmision}" no tiene el formato HH:MM:SS`);
  }
}

function validarNumeroDocumento({ tipoDocumento, numeroDocumento }: Cliente, r: Recolector): void {
  const numero = String(numeroDocumento ?? '').trim();
  if (tipoDocumento === '6' && !esRucValido(numero)) {
    r.agregar(
      'cliente.numeroDocumento',
      `"${numero}" no es un RUC válido: revisa los 11 dígitos, el prefijo (10, 15, 16, 17 o 20) y el dígito verificador`,
    );
  }
  if (tipoDocumento === '1' && !/^\d{8}$/.test(numero)) {
    r.agregar('cliente.numeroDocumento', `el DNI debe tener 8 dígitos; se recibió "${numero}"`);
  }
  if (['4', '7', 'A'].includes(tipoDocumento) && !/^[A-Za-z0-9]{4,15}$/.test(numero)) {
    r.agregar(
      'cliente.numeroDocumento',
      `el documento debe tener entre 4 y 15 letras o dígitos; se recibió "${numero}"`,
    );
  }
}

function validarCliente(entrada: ComprobanteEntrada, r: Recolector): void {
  const { cliente, tipo } = entrada;
  if (!cliente || typeof cliente !== 'object') {
    r.agregar('cliente', 'indica los datos del cliente');
    return;
  }
  if (!TIPOS_DOCUMENTO.includes(cliente.tipoDocumento)) {
    r.agregar('cliente.tipoDocumento', `"${cliente.tipoDocumento}" no es válido: usa 0, 1, 4, 6, 7 o A`);
  } else if (tipo === '01' && cliente.tipoDocumento !== '6') {
    r.agregar(
      'cliente.tipoDocumento',
      'la factura exige un cliente con RUC (tipo 6); para personas sin RUC emite una boleta',
    );
  }
  validarNumeroDocumento(cliente, r);
  if (!tieneTexto(cliente.nombre)) {
    r.agregar('cliente.nombre', 'indica el nombre del cliente; si no se identifica puedes usar "CLIENTES VARIOS"');
  }
}

function validarItem(item: ItemEntrada, campo: string, r: Recolector): boolean {
  const antes = r.problemas.length;
  if (!item || typeof item !== 'object') {
    r.agregar(campo, 'el ítem está vacío');
    return false;
  }
  if (!tieneTexto(item.descripcion)) r.agregar(`${campo}.descripcion`, 'indica la descripción del ítem');

  const cantidad = r.numero(`${campo}.cantidad`, item.cantidad);
  if (cantidad && !cantidad.greaterThan(0))
    r.agregar(`${campo}.cantidad`, `debe ser mayor que cero; se recibió ${item.cantidad}`);

  const precio = r.numero(`${campo}.precioUnitario`, item.precioUnitario);
  if (precio?.isNegative())
    r.agregar(`${campo}.precioUnitario`, `no puede ser negativo; se recibió ${item.precioUnitario}`);

  if (item.descuento !== undefined) {
    const descuento = r.numero(`${campo}.descuento`, item.descuento);
    if (descuento?.isNegative()) {
      r.agregar(`${campo}.descuento`, `no puede ser negativo; se recibió ${item.descuento}`);
    } else if (descuento && cantidad && precio) {
      const importe = redondear(cantidad.mul(precio));
      if (redondear(descuento).greaterThan(importe)) {
        r.agregar(
          `${campo}.descuento`,
          `el descuento (${fijo(redondear(descuento))}) supera el importe del ítem (${fijo(importe)})`,
        );
      }
    }
  }

  if (item.afectacion !== undefined && !AFECTACIONES.includes(item.afectacion)) {
    r.agregar(
      `${campo}.afectacion`,
      `"${item.afectacion}" no es válida: usa 10 (gravado), 20 (exonerado) o 30 (inafecto)`,
    );
  }
  return r.problemas.length === antes || soloFaltaDescripcion(r.problemas.slice(antes), campo);
}

function soloFaltaDescripcion(problemas: ProblemaValidacion[], campo: string): boolean {
  return problemas.every((p) => p.campo === `${campo}.descripcion`);
}

function validarItems(entrada: ComprobanteEntrada, r: Recolector): boolean {
  if (!Array.isArray(entrada.items) || entrada.items.length === 0) {
    r.agregar('items', 'el comprobante necesita al menos un ítem');
    return false;
  }
  return entrada.items.map((item, i) => validarItem(item, `items[${i}]`, r)).every(Boolean);
}

function validarConfiguracion(entrada: ComprobanteEntrada, r: Recolector): boolean {
  const antes = r.problemas.length;
  if (entrada.moneda !== undefined && entrada.moneda !== 'PEN' && entrada.moneda !== 'USD') {
    r.agregar('moneda', `"${entrada.moneda}" no es válida: usa PEN o USD`);
  }
  if (entrada.porcentajeIgv !== undefined) {
    const porcentaje = r.numero('porcentajeIgv', entrada.porcentajeIgv);
    if (porcentaje && (porcentaje.lessThan(1) || porcentaje.greaterThan(100))) {
      r.agregar(
        'porcentajeIgv',
        `debe expresarse como porcentaje entre 1 y 100, por ejemplo 18 y no 0.18; se recibió ${entrada.porcentajeIgv}`,
      );
    }
  }
  return r.problemas.length === antes;
}

// se calcula con datos neutros para que un error en la serie o el cliente no oculte los problemas de importes
function totalDelComprobante(entrada: ComprobanteEntrada): Numero {
  const { moneda, preciosIncluyenIgv, porcentajeIgv } = entrada;
  const { total } = calcularComprobante({
    tipo: '03',
    serie: 'B001',
    correlativo: 1,
    fechaEmision: '2000-01-01',
    horaEmision: '00:00:00',
    moneda,
    preciosIncluyenIgv,
    porcentajeIgv,
    formaPago: { tipo: 'contado' },
    cliente: { tipoDocumento: '0', numeroDocumento: '-', nombre: '-' },
    items: entrada.items.map((item) => ({ ...item, descripcion: '-' })),
  }).totales;
  return decimal(total);
}

function validarTopeBoleta(entrada: ComprobanteEntrada, total: Numero, r: Recolector): void {
  const { cliente, moneda = 'PEN', tipo } = entrada;
  if (tipo !== '03' || !cliente || typeof cliente !== 'object') return;
  const numero = String(cliente.numeroDocumento ?? '').trim();
  const sinDocumento = cliente.tipoDocumento === '0' || numero === '' || /^0+$/.test(numero);
  // en USD no se puede evaluar: la entrada no trae tipo de cambio para llevar el total a soles
  if (sinDocumento && moneda === 'PEN' && total.greaterThan(TOPE_BOLETA_SIN_DOCUMENTO)) {
    r.agregar(
      'cliente.numeroDocumento',
      `una boleta de más de S/ ${TOPE_BOLETA_SIN_DOCUMENTO} debe identificar al cliente; el total es S/ ${fijo(total)}`,
    );
  }
}

function validarFormaPago(entrada: ComprobanteEntrada, total: Numero | null, r: Recolector): void {
  const { formaPago, fechaEmision } = entrada;
  if (formaPago === undefined || formaPago.tipo === 'contado') return;
  if (formaPago.tipo !== 'credito') {
    r.agregar('formaPago.tipo', `"${(formaPago as { tipo: unknown }).tipo}" no es válida: usa contado o credito`);
    return;
  }
  if (!Array.isArray(formaPago.cuotas) || formaPago.cuotas.length === 0) {
    r.agregar('formaPago.cuotas', 'una venta al crédito necesita al menos una cuota con monto y vencimiento');
    return;
  }

  const antes = r.problemas.length;
  let suma = decimal(0);
  formaPago.cuotas.forEach((cuota, i) => {
    const campo = `formaPago.cuotas[${i}]`;
    const monto = r.numero(`${campo}.monto`, cuota?.monto);
    if (monto && !monto.greaterThan(0))
      r.agregar(`${campo}.monto`, `debe ser mayor que cero; se recibió ${cuota.monto}`);
    if (monto) suma = suma.add(monto);

    if (!esFechaValida(cuota?.vencimiento)) {
      r.agregar(`${campo}.vencimiento`, `"${cuota?.vencimiento}" no es una fecha real en formato YYYY-MM-DD`);
    } else if (esFechaValida(fechaEmision) && cuota.vencimiento <= fechaEmision) {
      r.agregar(
        `${campo}.vencimiento`,
        `debe ser posterior a la fecha de emisión (${fechaEmision}); se recibió ${cuota.vencimiento}`,
      );
    }
  });

  const montosValidos = !r.problemas.slice(antes).some((p) => p.campo.endsWith('.monto'));
  if (total && montosValidos && !redondear(suma).equals(redondear(total))) {
    r.agregar(
      'formaPago.cuotas',
      `las cuotas suman ${fijo(redondear(suma))} y deben sumar el total del comprobante, ${fijo(redondear(total))}`,
    );
  }
}

export function validarComprobante(entrada: ComprobanteEntrada, emisor: Emisor, hoy: string): void {
  const r = new Recolector();
  validarEmisor(emisor, r);
  validarNumeracion(entrada, r);
  validarFechas(entrada, hoy, r);
  validarCliente(entrada, r);
  const configuracionValida = validarConfiguracion(entrada, r);
  const itemsValidos = validarItems(entrada, r);

  const total = configuracionValida && itemsValidos ? totalDelComprobante(entrada) : null;
  if (total) validarTopeBoleta(entrada, total, r);
  validarFormaPago(entrada, total, r);

  if (r.problemas.length > 0) throw new ErrorValidacion(r.problemas);
}
