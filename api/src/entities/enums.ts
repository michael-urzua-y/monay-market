export enum SubscriptionPlan {
  BASICO = 'basico',
  PRO = 'pro',
}

export enum SubscriptionStatus {
  ACTIVA = 'activa',
  EXPIRADA = 'expirada',
  CANCELADA = 'cancelada',
}

export enum UserRole {
  DUENO = 'dueno',
  CAJERO = 'cajero',
}

export enum PaymentMethod {
  EFECTIVO = 'efectivo',
  TARJETA = 'tarjeta',
}

export enum BoletaStatus {
  NO_APLICA = 'no_aplica',
  EMITIDA = 'emitida',
  PENDIENTE = 'pendiente',
  ERROR = 'error',
}

export enum SiiProvider {
  HAULMER = 'haulmer',
  OPENFACTURA = 'openfactura',
  FACTURACION_CL = 'facturacion_cl',
}
