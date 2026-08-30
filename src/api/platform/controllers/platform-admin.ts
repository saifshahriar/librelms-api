import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import {
	findPostByRef,
	roleOf,
	toPostDTO,
	toUserDTO,
	ROLE_SLUGS,
} from '../../../extensions/platform/service';
import {
	deny,
	getUserFromToken,
} from '../../../extensions/platform/http';

/**
 * Posts, admin stats and user management controllers (contract-mirror).
 */

/* The framework injects `strapi` into policies; in controllers we read it
 * from the global registry (typed). */
function getStrapi(): Core.Strapi {
	return globalThis.strapi as unknown as Core.Strapi;
}
const platformAdmin = {
	/* ============ posts ============ */

	async postsList(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		const wantsPreview = ctx.query.publicationState === 'preview';
		const viewerRole = user ? await roleOf(strapi, user.id) : null;
		const isStaffUser =
			viewerRole === 'admin' || viewerRole === 'content_manager';

		const rows = await strapi.db.query('api::post.post').findMany({
			populate: ['author'],
			orderBy: { createdAt: 'desc' },
			// staff with ?publicationState=preview see drafts too; public
			// sees only published posts
		});
		const visible = wantsPreview && isStaffUser
			? rows
			: rows.filter(
					(p: { publishedAt?: string | null }) => p.publishedAt !== null,
				);
		ctx.body = { data: visible.map(toPostDTO) };
	},

	async postFind(ctx: Context) {
		const strapi = getStrapi();
		const post = await findPostByRef(strapi, ctx.params.ref);
		if (!post) return ctx.throw(404, 'Post not found');
		const user = await getUserFromToken(ctx, strapi);
		const viewerRole = user ? await roleOf(strapi, user.id) : null;
		const isStaffUser =
			viewerRole === 'admin' || viewerRole === 'content_manager';
		if (post.publishedAt === null && !isStaffUser)
			return ctx.throw(404, 'Post not found');
		ctx.body = { data: toPostDTO(post) };
	},

	async postCreate(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return deny(ctx, 401, 'Unauthorized');
		const body = ctx.request.body as {
			title?: string;
			body?: string;
			coverImageUrl?: string;
			published?: boolean;
		};
		if (!body?.title?.trim()) return ctx.throw(400, 'Title is required');
		const created = await strapi.documents('api::post.post').create({
			data: {
				title: body.title.trim(),
				body: body.body ?? '',
				coverImageUrl: body.coverImageUrl ?? '',
				author: user.id,
				publishedAt: body.published ? new Date().toISOString() : undefined,
			},
		});
		const full = await findPostByRef(strapi, created.documentId);
		ctx.body = { data: toPostDTO(full) };
	},

	async postUpdate(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return deny(ctx, 401, 'Unauthorized');
		const existing = await findPostByRef(strapi, ctx.params.ref);
		if (!existing) return ctx.throw(404, 'Post not found');
		// admin: any post; content manager: own posts only
		const role = await roleOf(strapi, user.id);
		if (role !== 'admin' && existing.author?.id !== user.id)
			return ctx.throw(403, 'Forbidden');
		const body = ctx.request.body as {
			title?: string;
			body?: string;
			coverImageUrl?: string;
			published?: boolean;
		};
		await strapi.documents('api::post.post').update({
			documentId: existing.documentId,
			data: {
				...(body.title !== undefined ? { title: body.title.trim() } : {}),
				...(body.body !== undefined ? { body: body.body } : {}),
				...(body.coverImageUrl !== undefined
					? { coverImageUrl: body.coverImageUrl }
					: {}),
				...(body.published === true && !existing.publishedAt
					? { publishedAt: new Date().toISOString() }
					: {}),
				...(body.published === false ? { publishedAt: undefined } : {}),
			},
		});
		const full = await findPostByRef(strapi, existing.documentId);
		ctx.body = { data: toPostDTO(full) };
	},

	async postDelete(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return deny(ctx, 401, 'Unauthorized');
		const existing = await findPostByRef(strapi, ctx.params.ref);
		if (!existing) return ctx.throw(404, 'Post not found');
		const role = await roleOf(strapi, user.id);
		if (role !== 'admin' && existing.author?.id !== user.id)
			return ctx.throw(403, 'Forbidden');
		await strapi.db.query('api::post.post').delete({
			where: { id: existing.id },
		});
		ctx.body = { data: null };
	},

	/* ============ admin: stats & user management ============ */

	async stats(ctx: Context) {
		const strapi = getStrapi();
		const users = await strapi.db
			.query('plugin::users-permissions.user')
			.findMany({ populate: ['role'] });
		const usersByRole: Record<string, number> = {};
		for (const role of ROLE_SLUGS) usersByRole[role] = 0;
		for (const u of users) {
			const t = (u.role as { type?: string } | null)?.type ?? 'student';
			usersByRole[t] = (usersByRole[t] ?? 0) + 1;
		}
		ctx.body = {
			data: {
				usersByRole,
				totalUsers: users.length,
				totalCourses: await strapi.db.query('api::course.course').count(),
				totalEnrollments: await strapi.db
					.query('api::enrollment.enrollment')
					.count(),
				totalLessons: await strapi.db.query('api::lesson.lesson').count(),
				totalQuizzes: await strapi.db.query('api::quiz.quiz').count(),
				publishedPosts: await strapi.db.query('api::post.post').count({
					where: { publishedAt: { $notNull: true } },
				}),
				draftPosts: await strapi.db.query('api::post.post').count({
					where: { publishedAt: null },
				}),
			},
		};
	},


	/** GET /api/users/me: current user with role slug (contract shape) */
	async usersMe(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return deny(ctx, 401, 'Unauthorized');
		const row = await strapi.db
			.query('plugin::users-permissions.user')
			.findOne({ where: { id: user.id }, populate: ['role'] });
		if (!row) return ctx.throw(404, 'User not found');
		ctx.body = { data: toUserDTO(row) };
	},


	/** PUT /api/users/me: update own profile (fullName) */
	async usersMeUpdate(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return deny(ctx, 401, 'Unauthorized');
		const body = (ctx.request as { body: unknown }).body as {
			fullName?: string;
		};
		const row = await strapi.db
			.query('plugin::users-permissions.user')
			.findOne({ where: { id: user.id } });
		if (!row) return ctx.throw(404, 'User not found');
		await strapi.documents('plugin::users-permissions.user').update({
			documentId: row.documentId,
			data: { fullName: body.fullName?.trim() } as never,
		});
		const updated = await strapi.db
			.query('plugin::users-permissions.user')
			.findOne({ where: { id: user.id }, populate: ['role'] });
		ctx.body = { data: toUserDTO(updated) };
	},

	async usersList(ctx: Context) {
		const strapi = getStrapi();
		const rows = await strapi.db
			.query('plugin::users-permissions.user')
			.findMany({ populate: ['role'], orderBy: { id: 'asc' } });
		ctx.body = { data: rows.map(toUserDTO) };
	},

	async setUserRole(ctx: Context) {
		const strapi = getStrapi();
		const targetId = Number.parseInt(ctx.params.id, 10);
		const { role } = ctx.request.body as { role: string };
		if (!ROLE_SLUGS.includes(role as never))
			return ctx.throw(400, 'Invalid role');
		const target = await strapi.db
			.query('plugin::users-permissions.user')
			.findOne({ where: { id: targetId }, populate: ['role'] });
		if (!target) return ctx.throw(404, 'User not found');
		const roleRow = await strapi.db
			.query('plugin::users-permissions.role')
			.findOne({ where: { type: role } });
		if (!roleRow) return ctx.throw(400, 'Role not found');
		await strapi.db.query('plugin::users-permissions.user').update({
			where: { id: targetId },
			data: { role: roleRow.id },
		});
		const updated = await strapi.db
			.query('plugin::users-permissions.user')
			.findOne({ where: { id: targetId }, populate: ['role'] });
		ctx.body = { data: toUserDTO(updated) };
	},
};

export default platformAdmin;
