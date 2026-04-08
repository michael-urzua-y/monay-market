import { IsBoolean } from 'class-validator';

export class UpdatePrinterConfigDto {
  @IsBoolean()
  printer_enabled: boolean;
}
