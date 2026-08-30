import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import {
	findQuizByRef,
	isCourseOwner,
	isEnrolled,
	roleOf,
} from '../extensions/platform/service';
import { deny, getUserFromToken } from '../extensions/platform/http';

/**
 * Quiz read access on `:ref`:
 * - student: enrolled only (gets sanitized quiz via /view)
 * - staff: course owner only
 */
export default async function (
	ctx: Context,
	_config: unknown,
	{ strapi }: { strapi: Core.Strapi },
) {
	const user = await getUserFromToken(ctx, strapi);
	if (!user) return deny(ctx, 401, 'Unauthorized');
	const quiz = await findQuizByRef(strapi, ctx.params.ref as string);
	if (!quiz?.course?.id) return deny(ctx, 404, 'Quiz not found');
	const courseId = quiz.course.id;
	const role = await roleOf(strapi, user.id);
	if (role === 'student') {
		if (!(await isEnrolled(strapi, user.id, courseId)))
			return deny(ctx, 403, 'Not enrolled');
	} else if (!(await isCourseOwner(strapi, user.id, courseId))) {
		return deny(ctx, 403, "You don't have permission to view this course");
	}
	ctx.state.platform = { ...((ctx.state.platform as object) ?? {}), quiz };
	return true;
};
