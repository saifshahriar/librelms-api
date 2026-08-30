import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import { deny, getUserFromToken } from '../extensions/platform/http';

/**
 * Allow only authenticated users; attach ctx.state.platform = { userId }.
 */
export default async function (
	ctx: Context,
	_config: unknown,
	{ strapi }: { strapi: Core.Strapi },
) {
	const user = await getUserFromToken(ctx, strapi);
	if (!user) return deny(ctx, 401, 'Unauthorized');
	ctx.state.platform = { userId: user.id };
	return true;
};
