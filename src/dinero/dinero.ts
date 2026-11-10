import { Decimal as DecimalBase } from 'decimal.js';
import { ErrorValidacion } from '../errores.js';
import type { NumeroEntrada } from '../tipos.js';

// clon propio: la precisión por defecto (20) corta importes grandes y no tocamos la config global
export const Decimal = DecimalBase.clone({ precision: 60, rounding: DecimalBase.ROUND_HALF_UP });
export type Decimal = DecimalBase;

const NUMERO_DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

export function decimal(v: NumeroEntrada | Decimal): Decimal {
  if (typeof v === 'string' && !NUMERO_DECIMAL.test(v)) throw numeroInvalido(v);
  const resultado = new Decimal(v);
  if (!resultado.isFinite()) throw numeroInvalido(v);
  return resultado;
}

export function redondear(v: Decimal, decimales = 2): Decimal {
  return v.toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP);
}

export function fijo(v: Decimal, decimales = 2): string {
  const redondeado = redondear(v, decimales);
  return (redondeado.isZero() ? redondeado.abs() : redondeado).toFixed(decimales);
}

function numeroInvalido(v: NumeroEntrada | Decimal): ErrorValidacion {
  return new ErrorValidacion([{ campo: 'numero', mensaje: `valor numérico inválido: ${String(v)}` }]);
}
