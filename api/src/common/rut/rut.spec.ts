import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { cleanRut, computeRutDv, formatRut, isValidRut } from './rut';
import { RutField } from './rut.decorator';
import { UpdateSiiConfigDto } from '../../tenants/dto/update-sii-config.dto';
import { CreateTenantDto } from '../../admin/dto/create-tenant.dto';

describe('RUT', () => {
  it('calcula el dígito verificador (incluye 0 y K)', () => {
    expect(computeRutDv('12345678')).toBe('5');
    expect(computeRutDv('11111111')).toBe('1');
    expect(computeRutDv('12345678')).toBe('5');
    expect(computeRutDv('11111111')).toBe('1');
    expect(computeRutDv('10000013')).toBe('K');
    expect(computeRutDv('10000004')).toBe('0');
  });

  it('acepta el RUT escrito de cualquier forma', () => {
    for (const v of ['123456785', '12345678-5', '12.345.678-5', ' 12 345 678 5 ']) {
      expect(isValidRut(v)).toBe(true);
      expect(formatRut(v)).toBe('12.345.678-5');
    }
    expect(formatRut('10000013k')).toBe('10.000.013-K');
    expect(formatRut('1234567-4')).toBe('1.234.567-4');
  });

  it('rechaza dígito verificador incorrecto y formatos inválidos', () => {
    for (const v of ['78260737-6', '12345', '0012345678', 'abc', '', null, undefined, '1234567890-1']) {
      expect(isValidRut(v)).toBe(false);
      expect(formatRut(v)).toBe('');
    }
  });

  it('cleanRut deja solo dígitos y K', () => {
    expect(cleanRut('10.000.013-k')).toBe('10000013K');
  });
});

describe('RutField en DTOs', () => {
  class RequiredDto {
    @RutField('El RUT')
    rut!: string;
  }
  class OptionalDto {
    @RutField('El RUT emisor', { optional: true })
    rut?: string | null;
  }

  it('formatea y acepta un RUT válido', async () => {
    const dto = plainToInstance(RequiredDto, { rut: '123456785' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.rut).toBe('12.345.678-5');
  });

  it('rechaza un RUT inválido con un mensaje claro', async () => {
    const errors = await validate(plainToInstance(RequiredDto, { rut: '78260737-6' }));
    expect(errors[0].constraints?.isRut).toContain('dígito verificador');
  });

  it('el opcional acepta vacío como borrado', async () => {
    const dto = plainToInstance(OptionalDto, { rut: '' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.rut).toBeNull();
    expect(await validate(plainToInstance(OptionalDto, {}))).toHaveLength(0);
    expect(await validate(plainToInstance(OptionalDto, { rut: '123' }))).toHaveLength(1);
  });
});

describe('DTOs reales con RUT', () => {
  it('configuración SII: formatea los RUT válidos y rechaza los inválidos', async () => {
    const ok = plainToInstance(UpdateSiiConfigDto, { sii_rut_emisor: '123456785', sii_rut_autenticador: '11111111-1' });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.sii_rut_emisor).toBe('12.345.678-5');
    expect(ok.sii_rut_autenticador).toBe('11.111.111-1');
    const bad = await validate(plainToInstance(UpdateSiiConfigDto, { sii_rut_emisor: '78260737-0' }));
    expect(bad.map((e) => e.property)).toEqual(['sii_rut_emisor']);
  });

  it('crear negocio: exige un RUT válido', async () => {
    const base = { name: 'Almacén', owner_username: 'dueno', owner_password: 'clave-segura' };
    expect(await validate(plainToInstance(CreateTenantDto, { ...base, rut: '12.345.678-0' }))).not.toHaveLength(0);
    const ok = plainToInstance(CreateTenantDto, { ...base, rut: '123456785' });
    expect(await validate(ok)).toHaveLength(0);
    expect(ok.rut).toBe('12.345.678-5');
  });
});
