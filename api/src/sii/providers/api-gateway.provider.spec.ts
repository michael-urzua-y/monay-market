import { ConfigService } from '@nestjs/config';
import { PaymentMethod, SiiProvider } from '../../entities/enums';
import {
  SiiCredentialError,
  SiiPermanentError,
  SiiSaleData,
} from '../interfaces/sii-provider.interface';
import { ApiGatewayProvider } from './api-gateway.provider';

describe('ApiGatewayProvider', () => {
  let provider: ApiGatewayProvider;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'SII_APIGATEWAY_BASE_URL') return 'https://app.apigateway.cl/api/v2/';
      return undefined;
    }),
  } as unknown as ConfigService;

  const saleData: SiiSaleData = {
    sale_id: 'sale-1',
    rut_emisor: '76.123.456-7',
    rut_autenticador: '18.673.997-3',
    items: [
      {
        nombre: 'Pan amasado',
        cantidad: 2,
        precio_unitario: 1500,
        subtotal: 3000,
      },
    ],
    monto_neto: 2521,
    iva: 479,
    monto_total: 3000,
    fecha: new Date('2026-06-08T12:00:00Z'),
    payment_method: PaymentMethod.TARJETA,
    clave_tributaria: 'clave-sii',
    codigo_sucursal: 2,
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    provider = new ApiGatewayProvider(configService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('uses API Gateway provider name', () => {
    expect(provider.providerName).toBe(SiiProvider.API_GATEWAY);
  });

  it('returns a simulated boleta in sandbox mode', async () => {
    const result = await provider.emitBoleta('sandbox', saleData, true);

    expect(result.folio).toEqual(expect.any(String));
    expect(result.pdf_url).toBe('https://www.apigateway.cl/test.pdf');
    expect(result.timbre_electronico).toContain('api_gateway');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts an eBoleta request to API Gateway in real mode', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: {
            folio: 123456,
            pdf_url: 'https://app.apigateway.cl/boletas/123456.pdf',
            timbre_electronico: '<TED>api-gateway-real</TED>',
          },
        }),
    });

    const result = await provider.emitBoleta('token-real', saleData, false);

    expect(result).toEqual({
      folio: '123456',
      pdf_url: 'https://app.apigateway.cl/boletas/123456.pdf',
      timbre_electronico: '<TED>api-gateway-real</TED>',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.apigateway.cl/api/v2/sii/eboleta/emitidas/emitir',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Token token-real',
          'Content-Type': 'application/json',
        },
      }),
    );

    const [, requestOptions] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestOptions.body);

    expect(body.auth.pass).toEqual({
      rut: '18673997-3',
      clave: 'clave-sii',
    });
    expect(body.dte.vendedor).toBe('76123456-7');
    expect(body.dte.Encabezado.IdDoc).toEqual({
      TipoDTE: 39,
      MedioPago: 2,
    });
    expect(body.dte.Encabezado.Emisor).toEqual({
      RUTEmisor: '76123456-7',
      CdgSIISucur: 2,
    });
    expect(body.dte.Detalle).toEqual([
      {
        NmbItem: 'Pan amasado',
        QtyItem: 2,
        PrcItem: 1500,
      },
    ]);
  });

  it('consolidates multiple products into one API Gateway line', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: {
            folio: 109,
            pdf_url: 'https://app.apigateway.cl/boletas/109.pdf',
            TED: '<TED>api-gateway-consolidada</TED>',
          },
        }),
    });

    await provider.emitBoleta(
      'token-real',
      {
        ...saleData,
        items: [
          { nombre: 'Pan', cantidad: 2.5, precio_unitario: 1200, subtotal: 3000 },
          { nombre: 'Sal Lobos 1kg', cantidad: 1, precio_unitario: 100, subtotal: 100 },
          { nombre: "Lay's tamaño S Sabor Jamón Serrano", cantidad: 1, precio_unitario: 990, subtotal: 990 },
        ],
        monto_total: 4090,
      },
      false,
    );

    const [, requestOptions] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestOptions.body);

    expect(body.dte.Detalle).toHaveLength(1);
    expect(body.dte.Detalle[0]).toEqual({
      NmbItem: 'Venta 3 productos',
      QtyItem: 1,
      PrcItem: 4090,
    });
  });

  it('requires API Gateway timbre in real mode', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          data: {
            folio: 123456,
            pdf_url: 'https://app.apigateway.cl/boletas/123456.pdf',
          },
        }),
    });

    await expect(provider.emitBoleta('token-real', saleData, false)).rejects.toThrow(
      'API Gateway no retornó timbre electrónico de la boleta',
    );
  });

  it('requires SII tax password outside sandbox mode', async () => {
    await expect(
      provider.emitBoleta(
        'token-real',
        { ...saleData, clave_tributaria: null },
        false,
      ),
    ).rejects.toThrow(SiiCredentialError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('includes API Gateway error body when credentials are rejected', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ detail: 'Producto eBoleta no activo' }),
    });

    await expect(
      provider.emitBoleta('token-real', saleData, false),
    ).rejects.toThrow(
      'API Gateway rechazó token o credenciales (HTTP 403): Producto eBoleta no activo',
    );
  });

  it('treats API Gateway 400 responses as permanent errors', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          message: 'Error en generar DTE: "No tiene folios asignados (no rows)".',
        }),
    });

    await expect(
      provider.emitBoleta('token-real', saleData, false),
    ).rejects.toThrow(SiiPermanentError);
  });
});
