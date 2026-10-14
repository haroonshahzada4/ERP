import { SetMetadata } from '@nestjs/common';

/** Authenticated user required; no specific permission check. */
export const AUTHENTICATED_KEY = 'authenticated';
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);
