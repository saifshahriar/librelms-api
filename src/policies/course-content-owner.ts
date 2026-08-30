import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import { findCourseByRef, isCourseOwner } from '../extensions/platform/service';
import { deny, getUserFromToken } from '../extensions/platform/http';

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
	if (!user) return deny(ctx, 401, 'Unauthorized');
	const body = ctx.request.body as { courseId?: number | string };
	const ref = String(body?.courseId ?? '');
	const course = await findCourseByRef(strapi, ref);
	if (!course) return deny(ctx, 404, 'Course not found');
	if (!(await isCourseOwner(strapi, user.id, course.id)))
		return deny(ctx, 403, 'Forbidden');
	ctx.state.platform = { ...((ctx.state.platform as object) ?? {}), course };
	return true;
};
