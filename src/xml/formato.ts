import { Decimal } from 'decimal.js';

export function redondear(valor: Decimal.Value, decimales: number): Decimal {
  return new Decimal(valor).toDecimalPlaces(decimales, Decimal.ROUND_HALF_UP);
}

export function esPositivo(valor: Decimal.Value): boolean {
  return new Decimal(valor).gt(0);
}

export function importe(valor: Decimal.Value): string {
  return new Decimal(valor).toFixed(2, Decimal.ROUND_HALF_UP);
}

export function sinCeros(valor: Decimal.Value): string {
  return new Decimal(valor).toFixed();
}

// igual que n_format_limit de greenter: solo fija decimales cuando se pasa del límite
export function limitado(valor: Decimal.Value, decimales: number): string {
  const numero = new Decimal(valor);
  return numero.decimalPlaces() > decimales ? numero.toFixed(decimales, Decimal.ROUND_HALF_UP) : numero.toFixed();
}

export function recortar(texto: string, largo: number): string {
  return Array.from(texto).slice(0, largo).join('');
}
