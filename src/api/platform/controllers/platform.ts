import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import {
	findCourseByRef,
	findLessonFull,
	findLessonByRef,
	findPostByRef,
	findQuizByRef,
	isAdmin,
	roleOf,
	isCourseOwner,
	isEnrolled,
	isStaff,
	ROLE_SLUGS,
	toCourseDTO,
	toLessonDTO,
	toPostDTO,
	toUserDTO,
} from '../../../extensions/platform/service';
import { getUserFromToken } from '../../../extensions/platform/http';

/**
 * Contract-mirror controllers for the LibreLMS frontend. Every handler
 * emits the flat JSON shapes the frontend mock defined.
 */

/* The framework injects `strapi` into policies; in controllers we read it
 * from the global registry (typed). */
function getStrapi(): Core.Strapi {
	return globalThis.strapi as unknown as Core.Strapi;
}
const platform = {
	/* ============ courses ============ */

	async coursesList(ctx: Context) {
		const strapi = getStrapi();
		const rows = await strapi.db.query('api::course.course').findMany({
			populate: ['instructors', 'lessons', 'quizzes'],
			orderBy: { id: 'asc' },
		});
		ctx.body = { data: rows.map(toCourseDTO) };
	},

	async courseFind(ctx: Context) {
		const strapi = getStrapi();
		const course = await findCourseByRef(strapi, ctx.params.ref);
		if (!course) return ctx.throw(404, 'Course not found');
		ctx.body = { data: toCourseDTO(course) };
	},

	async courseCreate(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return ctx.throw(401, 'Unauthorized');
		const role = await roleOf(strapi, user.id);
		if (role !== 'admin' && role !== 'content_manager' && role !== 'instructor')
			return ctx.throw(403, 'Forbidden');
		const body = ctx.request.body as {
			title?: string;
			description?: string;
			coverImageUrl?: string;
			coverImageId?: number | string | null;
		};
		if (!body?.title?.trim()) return ctx.throw(400, 'Title is required');
		const created = await strapi.documents('api::course.course').create({
			data: {
				title: body.title.trim(),
				description: body.description ?? '',
				coverImageUrl: body.coverImageUrl ?? '',
				coverImage: body.coverImageId ?? null,
				// instructor auto-assigns themselves on creation
				instructors: role === 'instructor' ? [user.id] : [],
			} as never,
		});
		const full = await findCourseByRef(strapi, created.documentId);
		ctx.body = { data: toCourseDTO(full) };
	},

	async courseUpdate(ctx: Context) {
		const strapi = getStrapi();
		const course = ctx.state.platform?.course as { id: number } | undefined;
		const body = ctx.request.body as {
			title?: string;
			description?: string;
			coverImageUrl?: string;
			coverImageId?: number | string | null;
		};
		const existing = await findCourseByRef(strapi, ctx.params.ref);
		if (!existing) return ctx.throw(404, 'Course not found');
		await strapi.documents('api::course.course').update({
			documentId: existing.documentId,
			data: {
				...(body.title !== undefined ? { title: body.title.trim() } : {}),
				...(body.description !== undefined
					? { description: body.description }
					: {}),
				...(body.coverImageUrl !== undefined
					? { coverImageUrl: body.coverImageUrl }
					: {}),
				...(body.coverImageId !== undefined
					? { coverImage: body.coverImageId }
					: {}),
			} as never,
		});
		void course;
		const full = await findCourseByRef(strapi, existing.documentId);
		ctx.body = { data: toCourseDTO(full) };
	},

	async courseDelete(ctx: Context) {
		const strapi = getStrapi();
		const existing = await findCourseByRef(strapi, ctx.params.ref);
		if (!existing) return ctx.throw(404, 'Course not found');
		// cascade: lessons, quizzes, enrollments, completions, results
		await strapi.db.query('api::lesson.lesson').deleteMany({
			where: { course: existing.id },
		});
		await strapi.db.query('api::quiz.quiz').deleteMany({
			where: { course: existing.id },
		});
		await strapi.db.query('api::enrollment.enrollment').deleteMany({
			where: { course: existing.id },
		});
		const lessonIds = (existing.lessons ?? []).map((l: { id: number }) => l.id);
		if (lessonIds.length > 0) {
			await strapi.db.query('api::lesson-completion.lesson-completion').deleteMany({
				where: { lesson: { id: { $in: lessonIds } } },
			});
		}
		await strapi.db.query('api::course.course').delete({
			where: { id: existing.id },
		});
		ctx.body = { data: null };
	},

	/* ============ lessons ============ */

	async lessonsList(ctx: Context) {
		const strapi = getStrapi();
		const courseId = ctx.query.courseId as string | undefined;

		// Role gate (mirrors the frontend mock contract):
		// - anonymous: 401
		// - student: enrolled only
		// - instructor: own courses only
		// - staff: all courses
		if (courseId) {
			const user = await getUserFromToken(ctx, strapi);
			if (!user) return ctx.throw(401, 'Unauthorized');
			const course = await findCourseByRef(strapi, courseId, [
				'instructors',
			]);
			if (!course) return ctx.throw(404, 'Course not found');
			const role = await roleOf(strapi, user.id);
			if (role === 'student') {
				if (!(await isEnrolled(strapi, user.id, course.id)))
					return ctx.throw(403, 'Not enrolled');
			} else if (!(await isCourseOwner(strapi, user.id, course.id))) {
				return ctx.throw(
					403,
					"You don't have permission to view this course",
				);
			}
		}

		const docs = (await strapi.documents('api::lesson.lesson').findMany({
			filters: (courseId
				? {
						course: Number.isNaN(Number(courseId))
							? { documentId: courseId }
							: { id: Number(courseId) },
					}
				: {}) as never,
			populate: {
				content: { populate: { videoFile: true } },
				course: true,
			} as never,
			sort: [{ order: 'asc' }] as never,
		})) as unknown as Parameters<typeof toLessonDTO>[0][];
		ctx.body = { data: docs.map(toLessonDTO) };
	},

	async lessonFind(ctx: Context) {
		const strapi = getStrapi();
		const lesson = await findLessonFull(strapi, ctx.params.ref);
		if (!lesson) return ctx.throw(404, 'Lesson not found');
		ctx.body = { data: toLessonDTO(lesson) };
	},

	async lessonCreate(ctx: Context) {
		const strapi = getStrapi();
		const course = ctx.state.platform?.course as { id: number; documentId: string };
		const body = ctx.request.body as {
			title?: string;
			kind?: 'text' | 'video';
			body?: string;
			videoUrl?: string;
			videoFileId?: number | string | null;
		};
		if (!body?.title?.trim()) return ctx.throw(400, 'Title is required');
		const existingCount = await strapi.db
			.query('api::lesson.lesson')
			.count({ where: { course: course.id } });
		const created = await strapi.documents('api::lesson.lesson').create({
			data: {
				title: body.title.trim(),
				order: existingCount + 1,
				course: course.documentId,
				content: {
					kind: body.kind === 'video' ? 'video' : 'text',
					body: body.kind === 'video' ? '' : (body.body ?? ''),
					videoUrl: body.kind === 'video' ? body.videoUrl : '',
					videoFile: body.kind === 'video' ? (body.videoFileId ?? null) : null,
				} as never,
			},
		});
		const full = await findLessonFull(strapi, created.documentId);
		if (!full) return ctx.throw(404, 'Lesson not found');
		ctx.body = { data: toLessonDTO(full) };
	},

	async lessonUpdate(ctx: Context) {
		const strapi = getStrapi();
		const existing = await findLessonFull(strapi, ctx.params.ref);
		if (!existing) return ctx.throw(404, 'Lesson not found');
		const body = ctx.request.body as {
			title?: string;
			kind?: 'text' | 'video';
			body?: string;
			videoUrl?: string;
			videoFileId?: number | string | null;
		};
		const kind = body.kind ?? existing.content?.kind ?? 'text';
		const content = {
			kind,
			body:
				kind === 'video' ? '' : (body.body ?? existing.content?.body ?? ''),
			videoUrl: kind === 'video' ? (body.videoUrl ?? '') : '',
			videoFile:
				kind === 'video'
					? (body.videoFileId ?? existing.content?.videoFile ?? null)
					: null,
		} as never;
		await strapi.documents('api::lesson.lesson').update({
			documentId: existing.documentId,
			data: {
				...(body.title !== undefined ? { title: body.title.trim() } : {}),
				content,
			},
		});
		const full = await findLessonFull(strapi, existing.documentId);
		if (!full) return ctx.throw(404, 'Lesson not found');
		ctx.body = { data: toLessonDTO(full) };
	},

	async lessonDelete(ctx: Context) {
		const strapi = getStrapi();
		const existing = await findLessonByRef(strapi, ctx.params.ref);
		if (!existing) return ctx.throw(404, 'Lesson not found');
		await strapi.db
			.query('api::lesson-completion.lesson-completion')
			.deleteMany({ where: { lesson: existing.id } });
		await strapi.db.query('api::lesson.lesson').delete({
			where: { id: existing.id },
		});
		ctx.body = { data: null };
	},
};

export default platform;
