import { decimal, fijo } from '../dinero/index.js';
import { ErrorValidacion } from '../errores.js';
import type { Moneda, NumeroEntrada } from '../tipos.js';

const HASTA_VEINTINUEVE = [
  '',
  'UNO',
  'DOS',
  'TRES',
  'CUATRO',
  'CINCO',
  'SEIS',
  'SIETE',
  'OCHO',
  'NUEVE',
  'DIEZ',
  'ONCE',
  'DOCE',
  'TRECE',
  'CATORCE',
  'QUINCE',
  'DIECISÉIS',
  'DIECISIETE',
  'DIECIOCHO',
  'DIECINUEVE',
  'VEINTE',
  'VEINTIUNO',
  'VEINTIDÓS',
  'VEINTITRÉS',
  'VEINTICUATRO',
  'VEINTICINCO',
  'VEINTISÉIS',
  'VEINTISIETE',
  'VEINTIOCHO',
  'VEINTINUEVE',
];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = [
  '',
  'CIENTO',
  'DOSCIENTOS',
  'TRESCIENTOS',
  'CUATROCIENTOS',
  'QUINIENTOS',
  'SEISCIENTOS',
  'SETECIENTOS',
  'OCHOCIENTOS',
  'NOVECIENTOS',
];
const ESCALAS = [
  { singular: '', plural: '' },
  { singular: 'MILLÓN', plural: 'MILLONES' },
  { singular: 'BILLÓN', plural: 'BILLONES' },
  { singular: 'TRILLÓN', plural: 'TRILLONES' },
];
const MONEDAS: Record<Moneda, string> = { PEN: 'SOLES', USD: 'DÓLARES AMERICANOS' };

function menorQueMil(n: number): string {
  if (n === 100) return 'CIEN';
  const resto = n % 100;
  const unidades = n % 10;
  const texto =
    resto < 30
      ? HASTA_VEINTINUEVE[resto]
      : `${DECENAS[Math.floor(resto / 10)]}${unidades ? ` Y ${HASTA_VEINTINUEVE[unidades]}` : ''}`;
  return [CENTENAS[Math.floor(n / 100)], texto].filter(Boolean).join(' ');
}

// "uno" se apocopa delante de mil y de millón: veintiún mil, treinta y un millones
function apocopar(texto: string): string {
  return texto.replace(/VEINTIUNO$/, 'VEINTIÚN').replace(/UNO$/, 'UN');
}

function menorQueMillon(n: number, apocopado: boolean): string {
  const miles = Math.floor(n / 1000);
  const resto = n % 1000;
  const textoResto = menorQueMil(resto);
  const partes = [
    miles === 1 ? 'MIL' : miles > 0 ? `${apocopar(menorQueMil(miles))} MIL` : '',
    apocopado ? apocopar(textoResto) : textoResto,
  ];
  return partes.filter(Boolean).join(' ');
}

function enteroEnLetras(digitos: string): string {
  if (/^0+$/.test(digitos)) return 'CERO';
  const grupos: number[] = [];
  for (let fin = digitos.length; fin > 0; fin -= 6) {
    grupos.push(Number(digitos.slice(Math.max(0, fin - 6), fin)));
  }
  if (grupos.length > ESCALAS.length) {
    throw new ErrorValidacion([{ campo: 'total', mensaje: 'importe demasiado grande para expresarlo en letras' }]);
  }
  return grupos
    .map((grupo, indice) => {
      if (grupo === 0) return '';
      if (indice === 0) return menorQueMillon(grupo, false);
      const { singular, plural } = ESCALAS[indice]!;
      return grupo === 1 ? `UN ${singular}` : `${menorQueMillon(grupo, true)} ${plural}`;
    })
    .reverse()
    .filter(Boolean)
    .join(' ');
}

export function montoEnLetras(total: NumeroEntrada, moneda: Moneda): string {
  const importe = fijo(decimal(total));
  if (importe.startsWith('-')) {
    throw new ErrorValidacion([{ campo: 'total', mensaje: 'el importe no puede ser negativo' }]);
  }
  const [entero = '0', centimos = '00'] = importe.split('.');
  return `SON: ${enteroEnLetras(entero)} CON ${centimos}/100 ${MONEDAS[moneda]}`;
}
