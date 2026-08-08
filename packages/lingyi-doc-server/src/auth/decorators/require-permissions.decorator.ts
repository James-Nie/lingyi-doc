import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissionsMode';

export type PermissionsMode = 'all' | 'any';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const PermissionsMode = (mode: PermissionsMode) =>
  SetMetadata(PERMISSIONS_MODE_KEY, mode);
