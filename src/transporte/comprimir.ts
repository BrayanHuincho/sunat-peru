import { strToU8, zipSync } from 'fflate';

export function comprimirXml(nombre: string, xml: string): Uint8Array {
  const entrada = nombre.toLowerCase().endsWith('.xml') ? nombre : `${nombre}.xml`;
  return zipSync({ [entrada]: [strToU8(xml), { level: 6 }] });
}
