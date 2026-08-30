import type { Context } from 'koa';
import type { Core } from '@strapi/types';

/**
 * Resolve the authenticated users-permissions user from the request's
 * Bearer token. Works on routes with `auth: false` (our contract-mirror
 * routes) by verifying the token manually through the plugin's services.
 */
export async function getUserFromToken(
	ctx: Context,
	strapi: Core.Strapi,
): Promise<{ id: number } | null> {
	try {
		const header = ctx.request.headers.authorization ?? '';
		if (!header.startsWith('Bearer ')) return null;
		const token = header.slice(7).trim();
		const decoded = (await strapi
			.plugin('users-permissions')
			.service('jwt')
			.verify(token)) as { id?: number; userId?: number } | null;
		// session tokens carry `userId`; legacy tokens carry `id`
		const userId = decoded?.userId ?? decoded?.id;
		if (!userId) return null;
		const user = await strapi
			.plugin('users-permissions')
			.service('user')
			.fetchAuthenticatedUser(Number(userId));
		if (!user || user.blocked) return null;
		ctx.state.user = user;
		return { id: user.id };
	} catch {
		return null;
	}
}
