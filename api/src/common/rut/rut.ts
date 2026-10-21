/**
 * RUT chileno: limpieza, validación del dígito verificador (módulo 11) y formato.
 *
 * Formato guardado y mostrado: "12.345.678-5". Se acepta escrito de cualquier
 * forma ("123456785", "12345678-5", "12.345.678-5", con k minúscula, etc.).
 * Los proveedores SII que lo necesitan sin puntos los quitan al enviar.
 */

/** Solo dígitos y K, en mayúscula: "12.345.678-5" → "123456785". */
export function cleanRut(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).toUpperCase().replace(/[^0-9K]/g, '');
}

/** Dígito verificador del cuerpo del RUT (sin DV). */
export function computeRutDv(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const dv = 11 - (sum % 11);
  if (dv === 11) return '0';
  if (dv === 10) return 'K';
  return String(dv);
}

/** RUT válido: cuerpo de 7 u 8 dígitos (sin ceros a la izquierda) y DV correcto. */
export function isValidRut(value: unknown): boolean {
  const clean = cleanRut(value);
  if (clean.length < 8 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^[1-9]\d{6,7}$/.test(body)) return false;
  return computeRutDv(body) === dv;
}

/** "123456785" → "12.345.678-5". Devuelve '' si no es un RUT válido. */
export function formatRut(value: unknown): string {
  if (!isValidRut(value)) return '';
  const clean = cleanRut(value);
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${clean.slice(-1)}`;
}
