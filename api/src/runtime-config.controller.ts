import { Controller, Get, Header } from '@nestjs/common';

type RuntimeConfig = Record<string, string>;

function serializeConfig(config: RuntimeConfig): string {
  return JSON.stringify(config)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

@Controller()
export class RuntimeConfigController {
  @Get('runtime-config.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
  getRuntimeConfig(): string {
    const config: RuntimeConfig = {
      MONAY_API_URL: process.env.PWA_API_URL || '',
      MONAY_LOGIN_URL: process.env.PWA_LOGIN_URL || '',
    };

    return [
      `window.MONAY_RUNTIME_CONFIG = ${serializeConfig(config)};`,
      'Object.assign(window, window.MONAY_RUNTIME_CONFIG);',
    ].join('\n');
  }
}
