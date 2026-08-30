import { errors } from '@strapi/utils';
import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import {
	findLessonByRef,
	isCourseOwner,
	isEnrolled,
	roleOf,
} from '../extensions/platform/service';
import { getUserFromToken } from '../extensions/platform/http';

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
	if (!user) throw new errors.UnauthorizedError('Unauthorized');
	const lesson = await findLessonByRef(strapi, ctx.params.ref as string);
	if (!lesson?.course?.id)
		throw new errors.NotFoundError('Lesson not found');
	const courseId = lesson.course.id;
	const role = await roleOf(strapi, user.id);
	if (role === 'student') {
		if (!(await isEnrolled(strapi, user.id, courseId)))
			throw new errors.ForbiddenError('Not enrolled');
	} else if (!(await isCourseOwner(strapi, user.id, courseId))) {
		throw new errors.ForbiddenError(
			"You don't have permission to view this course",
		);
	}
	ctx.state.platform = { ...((ctx.state.platform as object) ?? {}), lesson };
	return true;
}
