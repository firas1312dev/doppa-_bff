import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export class ActiveUserData {
  sub: string; // User ID
  email: string;
  role: 'MEMBER' | 'TRAINER' | 'MANAGER' | 'ADMIN';
  tenantId: string;
}

export const ActiveUser = createParamDecorator(
  (field: keyof ActiveUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: ActiveUserData = request.user;
    return field ? user?.[field] : user;
  },
);
