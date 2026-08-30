import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import {
	findLessonByRef,
	isCourseOwner,
	isEnrolled,
	roleOf,
} from '../extensions/platform/service';
import { deny, getUserFromToken } from '../extensions/platform/http';

/**
 * Lesson access on `:ref`:
 * - staff & course owner: allowed
 * - student: allowed only when enrolled in the lesson's course
 */
export default async function (
	ctx: Context,
	_config: unknown,
	{ strapi }: { strapi: Core.Strapi },
) {
	const user = await getUserFromToken(ctx, strapi);
	if (!user) return deny(ctx, 401, 'Unauthorized');
	const lesson = await findLessonByRef(strapi, ctx.params.ref as string);
	if (!lesson?.course?.id)
		return deny(ctx, 404, 'Lesson not found');
	const courseId = lesson.course.id;
	const role = await roleOf(strapi, user.id);
	if (role === 'student') {
		if (!(await isEnrolled(strapi, user.id, courseId)))
			return deny(ctx, 403, 'Not enrolled');
	} else if (!(await isCourseOwner(strapi, user.id, courseId))) {
		return deny(ctx, 403, "You don't have permission to view this course");
	}
	ctx.state.platform = { ...((ctx.state.platform as object) ?? {}), lesson };
	return true;
};
