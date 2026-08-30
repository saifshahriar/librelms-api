import { errors } from '@strapi/utils';
import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import { roleOf } from '../extensions/platform/service';
import { getUserFromToken } from '../extensions/platform/http';

/**
 * Content creators: admin, content manager or instructor.
 * Used by the upload route (course covers, lesson videos).
 */
export default async function (
	ctx: Context,
	_config: unknown,
	{ strapi }: { strapi: Core.Strapi },
) {
	const user = await getUserFromToken(ctx, strapi);
	if (!user) throw new errors.UnauthorizedError('Unauthorized');
	const role = await roleOf(strapi, user.id);
	if (
		role !== 'admin' &&
		role !== 'content_manager' &&
		role !== 'instructor'
	)
		throw new errors.ForbiddenError('Forbidden');
	return true;
}
