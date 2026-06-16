import { UserRole } from '../../entities/enums';

export interface JwtPayload {
  user_id: string;
  role: UserRole;
  tenant_id: string;
}
