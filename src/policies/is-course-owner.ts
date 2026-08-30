import { errors } from '@strapi/utils';
import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import { findCourseByRef, isCourseOwner } from '../extensions/platform/service';
import { getUserFromToken } from '../extensions/platform/http';

/**
 * Course owner check on `:ref` (course id/documentId):
 * admin | content_manager | instructor in course.instructors.
 */
export default async function (
	ctx: Context,
	_config: unknown,
	{ strapi }: { strapi: Core.Strapi },
) {
	const user = await getUserFromToken(ctx, strapi);
	if (!user) throw new errors.UnauthorizedError('Unauthorized');
	const course = await findCourseByRef(strapi, ctx.params.ref as string);
	if (!course) throw new errors.NotFoundError('Course not found');
	if (!(await isCourseOwner(strapi, user.id, course.id)))
		throw new errors.ForbiddenError('Forbidden');
	ctx.state.platform = { ...((ctx.state.platform as object) ?? {}), course };
	return true;
}
