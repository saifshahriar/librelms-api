import type { Core } from '@strapi/strapi';

export type RoleSlug = 'admin' | 'content_manager' | 'instructor' | 'student';

export const ROLE_SLUGS: RoleSlug[] = [
	'admin',
	'content_manager',
	'instructor',
	'student',
];

const STAFF: RoleSlug[] = ['admin', 'content_manager'];

/**
 * Resolve the users-permissions role slug ("type") for a user id.
 */
export async function roleOf(
	strapi: Core.Strapi,
	userId: number,
): Promise<RoleSlug | null> {
	const found = await strapi.db
		.query('plugin::users-permissions.user')
		.findOne({
			where: { id: userId },
			populate: ['role'],
		});
	return (found?.role?.type as RoleSlug) ?? null;
}

export async function isStaff(strapi: Core.Strapi, userId: number) {
	const role = await roleOf(strapi, userId);
	return role !== null && STAFF.includes(role);
}

export async function isAdmin(strapi: Core.Strapi, userId: number) {
	return (await roleOf(strapi, userId)) === 'admin';
}

export async function isStudent(strapi: Core.Strapi, userId: number) {
	return (await roleOf(strapi, userId)) === 'student';
}

/**
 * admin | content_manager | instructor listed in course.instructors
 */
export async function isCourseOwner(
	strapi: Core.Strapi,
	userId: number,
	courseId: number,
): Promise<boolean> {
	const role = await roleOf(strapi, userId);
	if (role === 'admin' || role === 'content_manager') return true;
	if (role !== 'instructor') return false;
	const course = await strapi.db.query('api::course.course').findOne({
		where: { id: courseId },
		populate: ['instructors'],
	});
	return (
		course?.instructors?.some((i: { id: number }) => i.id === userId) ?? false
	);
}

export async function isEnrolled(
	strapi: Core.Strapi,
	userId: number,
	courseId: number,
): Promise<boolean> {
	const existing = await strapi.db.query('api::enrollment.enrollment').findOne({
		where: { user: userId, course: courseId },
	});
	return existing !== null;
}

/**
 * `:ref` route params accept numeric id or documentId.
 */
export async function findCourseByRef(
	strapi: Core.Strapi,
	ref: string,
	populate: string[] = ['instructors', 'lessons', 'quizzes'],
) {
	const numeric = Number.parseInt(ref, 10);
	const where = Number.isNaN(numeric) ? { documentId: ref } : { id: numeric };
	return strapi.db.query('api::course.course').findOne({
		where,
		populate,
	});
}

export async function findLessonByRef(
	strapi: Core.Strapi,
	ref: string,
	populate: string[] = ['course'],
) {
	const numeric = Number.parseInt(ref, 10);
	const where = Number.isNaN(numeric) ? { documentId: ref } : { id: numeric };
	return strapi.db.query('api::lesson.lesson').findOne({ where, populate });
}

export async function findQuizByRef(
	strapi: Core.Strapi,
	ref: string,
	populate: string[] = ['course'],
) {
	const numeric = Number.parseInt(ref, 10);
	const where = Number.isNaN(numeric) ? { documentId: ref } : { id: numeric };
	return strapi.db.query('api::quiz.quiz').findOne({ where, populate });
}

/**
 * Quiz rows carry repeatable/nested components; the db layer returns
 * them on the row only when requested via deep populate. This helper
 * reads the raw quiz including questions/options for grading.
 */
/**
 * Full quiz row with nested components (questions+options) and course.
 * Used everywhere quiz content matters: view, grading, CRUD echo.
 */
export async function findQuizFull(
	strapi: Core.Strapi,
	ref: string,
): Promise<{
	id: number;
	documentId: string;
	title: string;
	course?: { id: number; title?: string };
	questions?: {
		id?: number;
		text: string;
		options?: { text: string; isCorrect?: boolean }[];
	}[];
} | null> {
	const numeric = Number.parseInt(ref, 10);
	const filters = Number.isNaN(numeric)
		? { documentId: ref }
		: { id: numeric };
	const doc = await strapi.documents('api::quiz.quiz').findFirst({
		filters: filters as never,
		populate: {
			questions: { populate: { options: true } },
			course: true,
		} as never,
	});
	if (!doc) return null;
	return doc as unknown as {
		id: number;
		documentId: string;
		title: string;
		course?: { id: number; title?: string };
		questions?: {
			id?: number;
			text: string;
			options?: { text: string; isCorrect?: boolean }[];
		}[];
	};
}

export async function findPostByRef(strapi: Core.Strapi, ref: string) {
	const numeric = Number.parseInt(ref, 10);
	const where = Number.isNaN(numeric) ? { documentId: ref } : { id: numeric };
	return strapi.db.query('api::post.post').findOne({
		where,
		populate: ['author'],
	});
}

/* ---------------- DTO mappers (frontend contract) ---------------- */

export interface UserDTO {
	id: number;
	username: string;
	email: string;
	role: RoleSlug;
	fullName?: string;
}

export function toUserDTO(u: {
	id: number;
	username: string;
	email: string;
	role?: { type?: string } | string;
	fullName?: string | null;
}): UserDTO {
	return {
		id: u.id,
		username: u.username,
		email: u.email,
		role: (typeof u.role === 'string' ? u.role : (u.role?.type ?? 'student')) as RoleSlug,
		fullName: u.fullName ?? undefined,
	};
}

export function toCourseDTO(c: {
	id: number;
	documentId: string;
	title: string;
	description?: string | null;
	coverImageUrl?: string | null;
	instructors?: Array<{ id: number }>;
	lessons?: Array<{ id: number; order?: number }>;
	quizzes?: Array<{ id: number }>;
	createdAt?: string | Date;
}) {
	const lessons = [...(c.lessons ?? [])].sort(
		(a, b) => (a.order ?? 0) - (b.order ?? 0),
	);
	return {
		id: c.id,
		documentId: c.documentId,
		title: c.title,
		description: c.description ?? '',
		coverImageUrl: c.coverImageUrl ?? '',
		instructorIds: (c.instructors ?? []).map((i) => i.id),
		lessonIds: lessons.map((l) => l.id),
		quizIds: (c.quizzes ?? []).map((q) => q.id),
		createdAt:
			c.createdAt instanceof Date
				? c.createdAt.toISOString()
				: (c.createdAt ?? new Date().toISOString()),
	};
}

interface LessonContentRow {
	kind?: 'text' | 'video';
	body?: string | null;
	videoUrl?: string | null;
}

export function toLessonDTO(l: {
	id: number;
	documentId: string;
	course?: { id: number };
	title: string;
	order: number;
	content?: LessonContentRow | null;
}) {
	const kind = l.content?.kind ?? 'text';
	return {
		id: l.id,
		documentId: l.documentId,
		courseId: l.course?.id ?? 0,
		title: l.title,
		order: l.order,
		content:
			kind === 'video'
				? { kind: 'video' as const, videoUrl: l.content?.videoUrl ?? '' }
				: { kind: 'text' as const, body: l.content?.body ?? '' },
	};
}

export function toPostDTO(p: {
	id: number;
	documentId: string;
	title: string;
	body?: string | null;
	coverImageUrl?: string | null;
	author?: { id: number; fullName?: string | null; username?: string } | null;
	publishedAt?: string | Date | null;
	createdAt?: string | Date;
}) {
	return {
		id: p.id,
		documentId: p.documentId,
		title: p.title,
		body: p.body ?? '',
		coverImageUrl: p.coverImageUrl ?? '',
		authorId: p.author?.id ?? 0,
		authorName: p.author?.fullName ?? p.author?.username ?? 'Unknown',
		publishedAt: p.publishedAt
			? p.publishedAt instanceof Date
				? p.publishedAt.toISOString()
				: p.publishedAt
			: null,
		createdAt:
			p.createdAt instanceof Date
				? p.createdAt.toISOString()
				: (p.createdAt ?? new Date().toISOString()),
	};
}
