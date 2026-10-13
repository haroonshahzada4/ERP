import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ADMIN_KEY = 'platformAdmin';

export const RequirePlatformAdmin = () => SetMetadata(PLATFORM_ADMIN_KEY, true);
