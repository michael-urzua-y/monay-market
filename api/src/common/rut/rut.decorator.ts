import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ValidateIf, registerDecorator, ValidationOptions } from 'class-validator';
import { formatRut, isValidRut } from './rut';

/** Valida que el campo sea un RUT chileno con dígito verificador correcto. */
export function IsRut(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isRut',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isValidRut(value),
      },
    });
  };
}

/**
 * Campo RUT de un DTO: acepta cualquier forma de escribirlo, lo deja con formato
 * "12.345.678-5" y rechaza RUT con dígito verificador incorrecto.
 * Con `optional`, null/undefined/'' se aceptan (para borrar el valor).
 */
export function RutField(label: string, { optional = false } = {}) {
  const decorators = [
    Transform(({ value }) => {
      if (value === null || value === undefined) return value;
      if (typeof value === 'string' && value.trim() === '') return optional ? null : value;
      return formatRut(value) || value; // si no es válido se deja tal cual para que falle la validación
    }),
    IsRut({ message: `${label} no es válido: revisa los números y el dígito verificador (ej: 12.345.678-5)` }),
  ];
  if (optional) decorators.unshift(ValidateIf((_, value) => value !== null && value !== undefined));
  return applyDecorators(...decorators);
}
