import type { Context } from 'koa';
import type { Core } from '@strapi/types';
import {
	findCourseByRef,
	isCourseOwner,
	findQuizFull,
	roleOf,
	findLessonByRef,
	findPostByRef,
	isEnrolled,
	ROLE_SLUGS,
	toCourseDTO,
	toPostDTO,
	toUserDTO,
} from '../../../extensions/platform/service';
import { getUserFromToken } from '../../../extensions/platform/http';

/**
 * Quizzes, posts and student-flow controllers (contract-mirror).
 */

/* The framework injects `strapi` into policies; in controllers we read it
 * from the global registry (typed). */
function getStrapi(): Core.Strapi {
	return globalThis.strapi as unknown as Core.Strapi;
}
const platformExtra = {
	/* ============ quizzes ============ */

	async quizzesList(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return ctx.throw(401, 'Unauthorized');
		const courseId = ctx.query.courseId as string | undefined;

		// role gate (mirrors mock): quizzes only for enrolled students,
		// course owners; 401 for anonymous when scoped
		let viewerIsStudent = false;
		if (courseId) {
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
			viewerIsStudent = role === 'student';
		}

		const where = courseId
			? {
					course: Number.isNaN(Number(courseId))
						? { documentId: courseId }
						: { id: Number(courseId) },
				}
			: {};
		const docs = await strapi.documents('api::quiz.quiz').findMany({
			filters: where as never,
			populate: {
				questions: { populate: { options: true } },
				course: true,
			} as never,
		});
		const rows = docs as unknown as {
			id: number;
			documentId: string;
			course?: { id: number };
			title: string;
			questions?: { text: string; options?: unknown[] }[];
		}[];
		const map = (q: (typeof rows)[number]) => ({
			id: q.id,
			documentId: q.documentId,
			courseId: q.course?.id ?? 0,
			title: q.title,
			questions: (q.questions ?? []).map(
				(question: { text: string; options?: unknown[] }, i: number) => ({
					id: i + 1,
					text: question.text,
					options: (question.options ?? []).map((o) =>
						viewerIsStudent
							? { text: (o as { text: string }).text }
							: {
									text: (o as { text: string }).text,
									isCorrect:
										(o as { isCorrect?: boolean }).isCorrect ?? false,
								},
					),
				}),
			),
		});
		ctx.body = { data: rows.map(map) };
	},

	async quizView(ctx: Context) {
		const strapi = getStrapi();
		const quiz = await findQuizFull(strapi, ctx.params.ref);
		if (!quiz) return ctx.throw(404, 'Quiz not found');
		ctx.body = {
			data: {
				id: quiz.id,
				documentId: quiz.documentId,
				courseId: quiz.course?.id ?? 0,
				title: quiz.title,
				questions: (quiz.questions ?? []).map(
					(question: { text: string; options?: unknown[] }, i: number) => ({
						id: i + 1,
						text: question.text,
						options: (question.options ?? []).map((o) => ({
							text: (o as { text: string }).text,
						})),
					}),
				),
			},
		};
	},

	async quizFind(ctx: Context) {
		// staff/owner variant: full quiz including correct flags
		const strapi = getStrapi();
		const quiz = await findQuizFull(strapi, ctx.params.ref);
		if (!quiz) return ctx.throw(404, 'Quiz not found');
		ctx.body = {
			data: {
				id: quiz.id,
				documentId: quiz.documentId,
				courseId: quiz.course?.id ?? 0,
				title: quiz.title,
				questions: (quiz.questions ?? []).map(
					(question: { text: string; options?: unknown[] }, i: number) => ({
						id: i + 1,
						text: question.text,
						options: (question.options ?? []).map((o) => ({
							text: (o as { text: string }).text,
							isCorrect: (o as { isCorrect?: boolean }).isCorrect ?? false,
						})),
					}),
				),
			},
		};
	},

	async quizCreate(ctx: Context) {
		const strapi = getStrapi();
		const course = ctx.state.platform?.course as {
			id: number;
			documentId: string;
		};
		const body = ctx.request.body as {
			title?: string;
			questions?: {
				text: string;
				options: { text: string; isCorrect: boolean }[];
			}[];
		};
		if (!body?.title?.trim()) return ctx.throw(400, 'Title is required');
		if (!body.questions?.length)
			return ctx.throw(400, 'Questions are required');
		const created = await strapi.documents('api::quiz.quiz').create({
			data: {
				title: body.title.trim(),
				course: course.documentId,
				questions: body.questions.map((q) => ({
					text: q.text,
					options: q.options.map((o) => ({
						text: o.text,
						isCorrect: o.isCorrect,
					})),
				})),
			},
		});
		const full = await findQuizFull(strapi, created.documentId);
		ctx.body = { data: full };
	},

	async quizUpdate(ctx: Context) {
		const strapi = getStrapi();
		const existing = await findQuizFull(strapi, ctx.params.ref);
		if (!existing) return ctx.throw(404, 'Quiz not found');
		const body = ctx.request.body as {
			title?: string;
			questions?: {
				text: string;
				options: { text: string; isCorrect: boolean }[];
			}[];
		};
		await strapi.documents('api::quiz.quiz').update({
			documentId: existing.documentId,
			data: {
				...(body.title !== undefined ? { title: body.title.trim() } : {}),
				...(body.questions !== undefined
					? {
							questions: body.questions.map((q) => ({
								text: q.text,
								options: q.options.map((o) => ({
									text: o.text,
									isCorrect: o.isCorrect,
								})),
							})),
						}
					: {}),
			},
		});
		const full = await findQuizFull(strapi, existing.documentId);
		ctx.body = { data: full };
	},

	async quizDelete(ctx: Context) {
		const strapi = getStrapi();
		const existing = await findQuizFull(strapi, ctx.params.ref);
		if (!existing) return ctx.throw(404, 'Quiz not found');
		await strapi.db.query('api::quiz-result.quiz-result').deleteMany({
			where: { quiz: existing.id },
		});
		await strapi.db.query('api::quiz.quiz').delete({
			where: { id: existing.id },
		});
		ctx.body = { data: null };
	},

	/**
	 * Server-side auto-grading. Body: { answers: number[] } (option index
	 * per question, -1 = skipped). Persists result incl. correctAnswers
	 * for the post-submit review, returns score immediately.
	 */
	async quizSubmit(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return ctx.throw(401, 'Unauthorized');
		const quiz = await findQuizFull(strapi, ctx.params.ref);
		if (!quiz?.course?.id) return ctx.throw(404, 'Quiz not found');
		if (!(await isEnrolled(strapi, user.id, quiz.course.id)))
			return ctx.throw(403, 'Not enrolled');
		const { answers } = ctx.request.body as { answers: number[] };
		if (!Array.isArray(answers))
			return ctx.throw(400, 'answers array is required');

		const questions = quiz.questions ?? [];
		let score = 0;
		const correctAnswers: number[] = [];
		for (const [i, question] of questions.entries()) {
			const options = question.options ?? [];
			const correct = options.findIndex(
				(o: { isCorrect?: boolean }) => o.isCorrect,
			);
			correctAnswers.push(correct);
			if (answers[i] === correct) score++;
		}

		const created = await strapi.db
			.query('api::quiz-result.quiz-result')
			.create({
				data: {
					user: user.id,
					quiz: quiz.id,
					score,
					total: questions.length,
					answers,
					correctAnswers,
					submittedAt: new Date().toISOString(),
				},
			});

		ctx.body = {
			data: {
				id: created.id,
				quizId: quiz.id,
				quizTitle: quiz.title,
				courseId: quiz.course.id,
				courseTitle: quiz.course?.title ?? '',
				score,
				total: questions.length,
				submittedAt: created.submittedAt,
				answers,
				correctAnswers,
			},
		};
	},

	/**
	 * POST /api/platform/upload (multipart). Staff only. Saves the file
	 * through Strapi's upload service (local provider -> public/uploads)
	 * and returns its URL. Used for course covers, lesson videos and
	 * blog covers: direct uploads, not links.
	 */
	async upload(ctx: Context) {
		const strapi = getStrapi();
		const raw = (ctx.request.files as Record<string, unknown>) ?? {};
		const input = raw.files as
			| {
					filepath: string;
					newFilename: string;
					originalFilename: string;
					mimetype: string;
					size: number;
				}
			| {
					filepath: string;
					newFilename: string;
					originalFilename: string;
					mimetype: string;
					size: number;
				}[]
			| undefined;
		if (!input) return ctx.throw(400, 'File is required');
		const list = Array.isArray(input) ? input : [input];
		if (list.length === 0) return ctx.throw(400, 'File is required');

		const uploaded = await strapi
			.plugin('upload')
			.service('upload')
			.upload({ data: {}, files: list as never });
		// plugin returns absolute-path urls like /uploads/foo.png; the
		// frontend prefixes NEXT_PUBLIC_API_URL
		const saved = uploaded as { id: number; url: string; name: string }[];
		ctx.body = {
			data: {
				urls: saved.map((f) => f.url),
				ids: saved.map((f) => f.id),
				names: saved.map((f) => f.name),
			},
		};
	},

	/* ============ enrollments & completions ============ */

	async enroll(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return ctx.throw(401, 'Unauthorized');
		const { courseId } = ctx.request.body as { courseId: number | string };
		const course = await findCourseByRef(strapi, String(courseId));
		if (!course) return ctx.throw(404, 'Course not found');
		if (await isEnrolled(strapi, user.id, course.id))
			return ctx.throw(400, 'Already enrolled');
		const created = await strapi.db
			.query('api::enrollment.enrollment')
			.create({
				data: {
					user: user.id,
					course: course.id,
					enrolledAt: new Date().toISOString(),
				},
			});
		ctx.body = { data: created };
	},

	async completeLesson(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return ctx.throw(401, 'Unauthorized');
		const { lessonId } = ctx.request.body as { lessonId: number | string };
		const lesson = await findLessonByRef(strapi, String(lessonId));
		if (!lesson?.course?.id) return ctx.throw(404, 'Lesson not found');
		if (!(await isEnrolled(strapi, user.id, lesson.course.id)))
			return ctx.throw(403, 'Not enrolled');
		const existing = await strapi.db
			.query('api::lesson-completion.lesson-completion')
			.findOne({ where: { user: user.id, lesson: lesson.id } });
		if (existing) {
			ctx.body = {
				data: {
					id: existing.id,
					userId: user.id,
					lessonId: lesson.id,
					completedAt: existing.completedAt,
				},
			};
			return;
		}
		const created = await strapi.db
			.query('api::lesson-completion.lesson-completion')
			.create({
				data: {
					user: user.id,
					lesson: lesson.id,
					completedAt: new Date().toISOString(),
				},
			});
		ctx.body = {
			data: {
				id: created.id,
				userId: user.id,
				lessonId: lesson.id,
				completedAt: created.completedAt,
			},
		};
	},

	/* ============ progress & student flows ============ */

	/** GET /api/lesson-completions: the caller's own completion rows */
	async completionsList(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return ctx.throw(401, 'Unauthorized');
		const rows = await strapi.db
			.query('api::lesson-completion.lesson-completion')
			.findMany({
				where: { user: user.id },
				populate: ['lesson'],
				orderBy: { completedAt: 'asc' },
			});
		ctx.body = {
			data: rows.map((r) => ({
				id: r.id,
				userId: user.id,
				lessonId: (r.lesson as { id?: number } | null)?.id ?? null,
				completedAt: r.completedAt,
			})),
		};
	},


	async courseProgress(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return ctx.throw(401, 'Unauthorized');
		const course = await findCourseByRef(strapi, ctx.params.ref);
		if (!course) return ctx.throw(404, 'Course not found');

		const lessonIds = (course.lessons ?? []).map(
			(l: { id: number }) => l.id,
		);
		const total = lessonIds.length;
		const completions = await strapi.db
			.query('api::lesson-completion.lesson-completion')
			.findMany({
				where: { user: user.id, lesson: { id: { $in: lessonIds } } },
			});

		if ((await roleOf(strapi, user.id)) === 'student') {
			if (!(await isEnrolled(strapi, user.id, course.id)))
				return ctx.throw(403, 'Not enrolled');
			const done = completions.length;
			ctx.body = {
				data: {
					courseId: course.id,
					totalLessons: total,
					completedLessons: done,
					percent: total > 0 ? Math.round((done / total) * 100) : 0,
				},
			};
			return;
		}

		// staff: per-student progress
		const role = await roleOf(strapi, user.id);
		if (
			!(role === 'admin' || role === 'content_manager') &&
			!(course.instructors ?? []).some((i: { id: number }) => i.id === user.id)
		)
			return ctx.throw(403, 'Forbidden');
		const enrollments = await strapi.db
			.query('api::enrollment.enrollment')
			.findMany({
				where: { course: course.id },
				populate: ['user'],
			});
		const students = [];
		for (const e of enrollments) {
			const done = await strapi.db
				.query('api::lesson-completion.lesson-completion')
				.findMany({
					where: {
						user: e.user.id,
						lesson: { id: { $in: lessonIds } },
					},
					orderBy: { completedAt: 'asc' },
				});
			students.push({
				user: toUserDTO(e.user),
				completedLessons: done.length,
				totalLessons: total,
				percent: total > 0 ? Math.round((done.length / total) * 100) : 0,
				lastActivity: done.at(-1)?.completedAt ?? undefined,
			});
		}
		ctx.body = { data: students };
	},

	async myCourses(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return ctx.throw(401, 'Unauthorized');
		const enrollments = await strapi.db
			.query('api::enrollment.enrollment')
			.findMany({ where: { user: user.id }, populate: ['course'] });
		const out = [];
		for (const e of enrollments) {
			const course = await findCourseByRef(strapi, String(e.course.id));
			if (!course) continue;
			const lessonIds = (course.lessons ?? []).map(
				(l: { id: number }) => l.id,
			);
			const done = await strapi.db
				.query('api::lesson-completion.lesson-completion')
				.count({
					where: { user: user.id, lesson: { id: { $in: lessonIds } } },
				});
			out.push({
				course: toCourseDTO(course),
				progress: {
					courseId: course.id,
					totalLessons: lessonIds.length,
					completedLessons: done,
					percent:
						lessonIds.length > 0
							? Math.round((done / lessonIds.length) * 100)
							: 0,
				},
			});
		}
		ctx.body = { data: out };
	},

	async myQuizResults(ctx: Context) {
		const strapi = getStrapi();
		const user = await getUserFromToken(ctx, strapi);
		if (!user) return ctx.throw(401, 'Unauthorized');
		const results = await strapi.db
			.query('api::quiz-result.quiz-result')
			.findMany({
				where: { user: user.id },
				populate: ['quiz'],
			});
		const out = [];
		for (const r of results) {
			const quiz = await findQuizFull(strapi, String(r.quiz.id));
			const course = quiz?.course
				? await findCourseByRef(strapi, String(quiz.course.id))
				: null;
			out.push({
				id: r.id,
				quizId: r.quiz.id,
				quizTitle: quiz?.title ?? 'Deleted quiz',
				courseId: quiz?.course?.id ?? 0,
				courseTitle: course?.title ?? '',
				score: r.score,
				total: r.total,
				submittedAt: r.submittedAt,
				answers: r.answers,
				correctAnswers: r.correctAnswers,
			});
		}
		ctx.body = { data: out };
	},
};

export default platformExtra;
