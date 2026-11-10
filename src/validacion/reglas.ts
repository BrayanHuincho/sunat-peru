const PREFIJOS_RUC = new Set(['10', '15', '16', '17', '20']);
const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const MS_POR_DIA = 86_400_000;

export function esRucValido(ruc: string): boolean {
  if (!/^\d{11}$/.test(ruc) || !PREFIJOS_RUC.has(ruc.slice(0, 2))) return false;
  const suma = PESOS_RUC.reduce((total, peso, indice) => total + peso * Number(ruc[indice]), 0);
  return (11 - (suma % 11)) % 10 === Number(ruc[10]);
}

export function esFechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const instante = Date.parse(`${fecha}T00:00:00Z`);
  return !Number.isNaN(instante) && new Date(instante).toISOString().slice(0, 10) === fecha;
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_POR_DIA);
}

export function esHoraValida(hora: unknown): boolean {
  return typeof hora === 'string' && /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(hora);
}

export function tieneTexto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim() !== '';
}

export function esNumeroEntrada(valor: unknown): valor is string | number {
  if (typeof valor === 'number') return Number.isFinite(valor);
  return typeof valor === 'string' && /^-?\d+(\.\d+)?$/.test(valor);
}
