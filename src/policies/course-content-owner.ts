import { errors } from '@strapi/utils';
import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import { findCourseByRef, isCourseOwner } from '../extensions/platform/service';
import { getUserFromToken } from '../extensions/platform/http';

/**
 * Lesson/quiz creation for a course: body.courseId must be a course the
 * user owns (staff always pass; instructors only their own).
 */
export default async function (
	ctx: Context,
	_config: unknown,
	{ strapi }: { strapi: Core.Strapi },
) {
	const user = await getUserFromToken(ctx, strapi);
	if (!user) throw new errors.UnauthorizedError('Unauthorized');
	const body = ctx.request.body as { courseId?: number | string };
	const ref = String(body?.courseId ?? '');
	const course = await findCourseByRef(strapi, ref);
	if (!course) throw new errors.NotFoundError('Course not found');
	if (!(await isCourseOwner(strapi, user.id, course.id)))
		throw new errors.ForbiddenError('Forbidden');
	ctx.state.platform = { ...((ctx.state.platform as object) ?? {}), course };
	return true;
}
