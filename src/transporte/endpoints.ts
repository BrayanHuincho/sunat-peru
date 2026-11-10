import type { Entorno } from '../tipos.js';

const ENDPOINTS: Record<Entorno, string> = {
  beta: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  produccion: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
};

export function endpointPara(entorno: Entorno): string {
  return ENDPOINTS[entorno];
}
