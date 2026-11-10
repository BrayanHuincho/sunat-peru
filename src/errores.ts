export interface ProblemaValidacion {
  campo: string;
  mensaje: string;
}

export class ErrorSunat extends Error {
  readonly codigo: string;

  constructor(mensaje: string, codigo = 'SUNAT') {
    super(mensaje);
    this.name = new.target.name;
    this.codigo = codigo;
  }
}

export class ErrorValidacion extends ErrorSunat {
  readonly problemas: ProblemaValidacion[];

  constructor(problemas: ProblemaValidacion[], mensaje = resumir(problemas), codigo = 'VALIDACION') {
    super(mensaje, codigo);
    this.problemas = problemas;
  }
}

export class ErrorCertificado extends ErrorSunat {
  constructor(mensaje: string, codigo = 'CERTIFICADO') {
    super(mensaje, codigo);
  }
}

export class ErrorTransporte extends ErrorSunat {
  readonly reintentable: boolean;

  constructor(mensaje: string, reintentable = false, codigo = 'TRANSPORTE') {
    super(mensaje, codigo);
    this.reintentable = reintentable;
  }
}

function resumir(problemas: ProblemaValidacion[]): string {
  return problemas.map((p) => `${p.campo}: ${p.mensaje}`).join('; ') || 'comprobante inválido';
}
