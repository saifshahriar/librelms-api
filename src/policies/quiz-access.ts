import { errors } from '@strapi/utils';
import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import {
	findQuizByRef,
	isCourseOwner,
	isEnrolled,
	roleOf,
} from '../extensions/platform/service';
import { getUserFromToken } from '../extensions/platform/http';

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
	if (!user) throw new errors.UnauthorizedError('Unauthorized');
	const quiz = await findQuizByRef(strapi, ctx.params.ref as string);
	if (!quiz?.course?.id) throw new errors.NotFoundError('Quiz not found');
	const courseId = quiz.course.id;
	const role = await roleOf(strapi, user.id);
	if (role === 'student') {
		if (!(await isEnrolled(strapi, user.id, courseId)))
			throw new errors.ForbiddenError('Not enrolled');
	} else if (!(await isCourseOwner(strapi, user.id, courseId))) {
		throw new errors.ForbiddenError(
			"You don't have permission to view this course",
		);
	}
	ctx.state.platform = { ...((ctx.state.platform as object) ?? {}), quiz };
	return true;
}
