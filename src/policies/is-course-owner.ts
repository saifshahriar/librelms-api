import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import { findCourseByRef, isCourseOwner } from '../extensions/platform/service';
import { deny, getUserFromToken } from '../extensions/platform/http';

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
	if (!user) return deny(ctx, 401, 'Unauthorized');
	const course = await findCourseByRef(strapi, ctx.params.ref as string);
	if (!course) return deny(ctx, 404, 'Course not found');
	if (!(await isCourseOwner(strapi, user.id, course.id)))
		return deny(ctx, 403, 'Forbidden');
	ctx.state.platform = { ...((ctx.state.platform as object) ?? {}), course };
	return true;
};
