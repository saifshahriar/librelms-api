import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import { roleOf } from '../extensions/platform/service';
import { deny, getUserFromToken } from '../extensions/platform/http';

/** Students only (enroll, take quizzes, track own progress). */
export default async function (
	ctx: Context,
	_config: unknown,
	{ strapi }: { strapi: Core.Strapi },
) {
	const user = await getUserFromToken(ctx, strapi);
	if (!user) return deny(ctx, 401, 'Unauthorized');
	const role = await roleOf(strapi, user.id);
	if (role !== 'student') return deny(ctx, 403, 'Forbidden');
	return true;
};
