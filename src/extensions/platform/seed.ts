/**
 * Idempotent seed: demo users (one per role), 3 courses, 9 markdown
 * lessons, 3 quizzes, enrollments, completions, a quiz result and posts.
 * Skips anything that already exists. Run with SEED_DEMO=true.
 */
import type { Core } from '@strapi/types';

const daysAgo = (n: number) =>
	new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

export async function seedDemo(strapi: Core.Strapi) {
	// roles first (idempotent)
	for (const role of [
		{ type: 'admin', name: 'Admin', description: 'Full control of the platform' },
		{ type: 'content_manager', name: 'Content Manager', description: 'Manages courses, lessons, quizzes and blog posts' },
		{ type: 'instructor', name: 'Instructor', description: 'Manages lessons and quizzes of their own courses' },
		{ type: 'student', name: 'Student', description: 'Enrolls in courses, takes quizzes, tracks progress' },
	]) {
		const exists = await strapi.db
			.query('plugin::users-permissions.role')
			.findOne({ where: { type: role.type } });
		if (!exists) {
			await strapi.db
				.query('plugin::users-permissions.role')
				.create({ data: role });
			strapi.log.info(`[seed] created role ${role.type}`);
		}
	}

	const userQ = strapi.db.query('plugin::users-permissions.user');
	const courseQ = strapi.db.query('api::course.course');
	const lessonQ = strapi.db.query('api::lesson.lesson');
	const quizQ = strapi.db.query('api::quiz.quiz');
	const enrollQ = strapi.db.query('api::enrollment.enrollment');
	const completeQ = strapi.db.query('api::lesson-completion.lesson-completion');
	const resultQ = strapi.db.query('api::quiz-result.quiz-result');
	const postQ = strapi.db.query('api::post.post');

	async function ensureUser(
		username: string,
		email: string,
		fullName: string,
		roleType: string,
		password: string,
	) {
		const existing = await userQ.findOne({
			where: { email },
			populate: ['role'],
		});
		if (existing) {
			// password written by an older seed may be unhashed: re-issue
			// through the document service so the hashing lifecycle runs
			await strapi.documents('plugin::users-permissions.user').update({
				documentId: existing.documentId,
				data: { password },
			});
			return existing;
		}
		const role = await strapi.db
			.query('plugin::users-permissions.role')
			.findOne({ where: { type: roleType } });
		const created = await strapi.documents(
			'plugin::users-permissions.user',
		).create({
			data: {
				username,
				email,
				fullName,
				role: role.id,
				password,
				confirmed: true,
				provider: 'local',
			},
		});
		strapi.log.info(`[seed] user ${username} (${roleType})`);
		return userQ.findOne({ where: { documentId: created.documentId } });
	}

	const admin = await ensureUser(
		'admin',
		'admin@librelms.dev',
		'Alice Admin',
		'admin',
		'admin123',
	);
	const manager = await ensureUser(
		'manager',
		'manager@librelms.dev',
		'Mateo Manager',
		'content_manager',
		'manager123',
	);
	const instructor = await ensureUser(
		'instructor',
		'instructor@librelms.dev',
		'Ivy Instructor',
		'instructor',
		'instructor123',
	);
	const student = await ensureUser(
		'student',
		'student@librelms.dev',
		'Sam Student',
		'student',
		'student123',
	);
	const student2 = await ensureUser(
		'student2',
		'student2@librelms.dev',
		'Sofia Student',
		'student',
		'student123',
	);

	if ((await courseQ.count()) > 0) {
		strapi.log.info('[seed] content exists, skipping');
		return;
	}

	/* courses */
	const react = await courseQ.create({
		data: {
			title: 'React Fundamentals',
			description:
				'Master the building blocks of modern React: components, state, props and hooks.',
			instructors: [instructor.id],
			publishedAt: daysAgo(20),
		},
	});
	const ts = await courseQ.create({
		data: {
			title: 'TypeScript Deep Dive',
			description:
				'Go beyond annotations: generics, narrowing, utility types and real-world patterns.',
			instructors: [instructor.id],
			publishedAt: daysAgo(15),
		},
	});
	const css = await courseQ.create({
		data: {
			title: 'CSS Layout Mastery',
			description:
				'Flexbox and grid, explained visually. Build any layout with confidence.',
			instructors: [manager.id],
			publishedAt: daysAgo(8),
		},
	});

	/* lessons */
	const mkLesson = async (
		course: { id: number; documentId: string },
		title: string,
		order: number,
		content: Record<string, unknown>,
	) => {
		const created = await strapi.documents('api::lesson.lesson').create({
			data: {
				title,
				order,
				course: course.documentId,
				content: content as never,
			},
		});
		return lessonQ.findOne({ where: { documentId: created.documentId } });
	};

	const mkQuiz = async (
		course: { id: number; documentId: string },
		title: string,
		questions: {
			text: string;
			options: { text: string; isCorrect: boolean }[];
		}[],
	) => {
		const created = await strapi.documents('api::quiz.quiz').create({
			data: {
				title,
				course: course.documentId,
				questions: questions as never,
			},
		});
		return quizQFind(created.documentId);
	};

	const quizQFind = async (documentId: string) =>
		strapi.db
			.query('api::quiz.quiz')
			.findOne({ where: { documentId }, populate: ['course'] });

	await mkLesson(react, 'JSX and Components', 1, {
		kind: 'text',
		body: "JSX is a syntax extension for JavaScript that lets you write UI as functions of data.\n\nEvery React interface is a tree of **components**. A component is just a function that receives props and returns markup:\n\n```tsx\nfunction Greeting({ name }: { name: string }) {\n  return <h1>Hello, {name}!</h1>;\n}\n```\n\nIn this lesson we cover:\n\n- What JSX compiles down to (the `jsx` runtime calls)\n- Rendering custom components vs host elements\n- Why **keys** matter when rendering lists\n\n> Try it: build a small `Card` component that renders a title and children.",
	});
	await mkLesson(react, 'Props and State', 2, {
		kind: 'text',
		body: "Props flow down; state is local to a component.\n\nKey ideas:\n\n- Props are *read-only* inputs\n- `useState` gives a component its own memory\n- Never mutate state directly; always call the setter\n- When several components need the same state, *lift it up*\n\nWorked example: a counter reset by its parent via a prop-driven effect.\n\n```tsx\nfunction Counter() {\n  const [n, setN] = useState(0);\n  return <button onClick={() => setN(n + 1)}>{n}</button>;\n}\n```",
	});
	await mkLesson(react, 'Hooks in Practice (Video)', 3, {
		kind: 'video',
		videoUrl: 'https://www.youtube.com/watch?v=O6P86uwqfwo',
	});
	await mkLesson(react, 'Lists, Keys and Conditional Rendering', 4, {
		kind: 'text',
		body: 'Rendering collections is a daily task. Rules of thumb:\n\n- Derive UI from data with `.map()`\n- Give each item a stable key (not the array index when items reorder)\n- Use early returns or `&&` for conditional UI\n\nMini-challenge: render a filtered, sorted lesson list with alternating styles.',
	});
	await mkLesson(ts, 'Type Annotations Everywhere', 1, {
		kind: 'text',
		body: "TypeScript's core value: move errors from runtime to compile time.\n\nThis lesson covers:\n\n- Primitive and object types\n- Type aliases vs interfaces\n- Function signatures and return types\n- Structural typing: why shape beats name",
	});
	await mkLesson(ts, 'Generics and Utility Types', 2, {
		kind: 'text',
		body: 'Generics make functions and types reusable without sacrificing safety.\n\nTopics:\n\n- Generic functions and interfaces\n- Constraints with `extends`\n- `Partial`, `Pick`, `Omit`, `Record`, `ReturnType`\n- When to reach for `unknown` vs `any`',
	});
	await mkLesson(ts, 'Narrowing and Control Flow Analysis', 3, {
		kind: 'text',
		body: 'The compiler is smart. Help it help you.\n\nTopics:\n\n- `typeof`, `instanceof`, `in` guards\n- Discriminated unions with a literal field\n- Exhaustiveness checking with `never`\n- Assertion functions and user-defined type guards',
	});
	await mkLesson(css, 'Flexbox Thinking', 1, {
		kind: 'text',
		body: 'Flexbox lays out content along one axis at a time.\n\nMental model:\n\n- main axis vs cross axis\n- `flex-grow` / `shrink` / `basis`\n- `gap` beats margin for spacing\n- Common patterns: navbar, media object, card grid',
	});
	await mkLesson(css, 'Grid for Page Structure', 2, {
		kind: 'text',
		body: 'Grid handles two dimensions: rows AND columns.\n\nTopics:\n\n- `grid-template-columns` with `fr` units\n- Explicit vs implicit tracks\n- Areas for page scaffolding\n- When grid beats flexbox (and when it does not)',
	});

	/* quizzes */
	const reactQuiz = await mkQuiz(react, 'React Basics Check', [
				{
					text: 'What is a React component, conceptually?',
					options: [
						{ text: 'A function that takes props and returns UI', isCorrect: true },
						{ text: 'A class that extends HTMLElement', isCorrect: false },
						{ text: 'A special HTML tag the browser understands', isCorrect: false },
						{ text: 'A database record', isCorrect: false },
					],
				},
				{
					text: 'Which rule applies to hooks?',
					options: [
						{
							text: 'They can only be called at the top level of components',
							isCorrect: true,
						},
						{ text: 'They can be called inside loops freely', isCorrect: false },
						{ text: 'They only work in class components', isCorrect: false },
						{ text: 'They must return a promise', isCorrect: false },
					],
				},
				{
					text: 'Why give list items a stable key?',
					options: [
						{ text: 'To help React identify items across renders', isCorrect: true },
						{ text: 'It styles the list', isCorrect: false },
						{ text: 'It is required by HTML', isCorrect: false },
						{ text: 'Keys sort the list automatically', isCorrect: false },
					],
				},
	]);
	const tsQuiz = await mkQuiz(ts, 'TypeScript Quick Check', [
				{
					text: 'What does Partial<T> do?',
					options: [
						{ text: 'Makes all properties of T optional', isCorrect: true },
						{ text: 'Makes all properties required', isCorrect: false },
						{ text: 'Deletes half the properties', isCorrect: false },
						{ text: 'Creates a string from T', isCorrect: false },
					],
				},
				{
					text: 'What is structural typing?',
					options: [
						{
							text: 'Compatibility is determined by shape, not name',
							isCorrect: true,
						},
						{ text: 'Types must share a name', isCorrect: false },
						{ text: 'It only applies to classes', isCorrect: false },
						{ text: 'It is a runtime concept', isCorrect: false },
					],
				},
	]);
	await mkQuiz(css, 'CSS Layout Check', [
				{
					text: 'Which layout system handles two axes at once?',
					options: [
						{ text: 'CSS Grid', isCorrect: true },
						{ text: 'Flexbox', isCorrect: false },
						{ text: 'Floats', isCorrect: false },
						{ text: 'Position absolute', isCorrect: false },
					],
				},
				{
					text: 'What does 1fr mean in grid-template-columns?',
					options: [
						{ text: 'One fraction of the leftover space', isCorrect: true },
						{ text: 'One rem', isCorrect: false },
						{ text: 'A fixed 16px track', isCorrect: false },
						{ text: 'Frame rate', isCorrect: false },
					],
				},
	]);

	/* enrollments + completions */
	await enrollQ.create({
		data: { user: student.id, course: react.id, enrolledAt: daysAgo(10) },
	});
	await enrollQ.create({
		data: { user: student.id, course: ts.id, enrolledAt: daysAgo(6) },
	});
	await enrollQ.create({
		data: { user: student2.id, course: react.id, enrolledAt: daysAgo(5) },
	});

	const lessons = await lessonQ.findMany({ where: { course: react.id } });
	const lessonById = new Map(
		lessons.map((l: { title: string; id: number }) => [l.title, l.id]),
	);
	await completeQ.create({
		data: { user: student.id, lesson: lessonById.get('JSX and Components'), completedAt: daysAgo(9) },
	});
	await completeQ.create({
		data: { user: student.id, lesson: lessonById.get('Props and State'), completedAt: daysAgo(8) },
	});
	await completeQ.create({
		data: { user: student2.id, lesson: lessonById.get('JSX and Components'), completedAt: daysAgo(4) },
	});

	/* one quiz result for the demo student */
	if (reactQuiz && tsQuiz) {
		await resultQ.create({
			data: {
				user: student.id,
				quiz: reactQuiz.id,
				score: 2,
				total: 3,
				answers: [0, 0, 2],
				correctAnswers: [0, 0, 0],
				submittedAt: daysAgo(7),
			},
		});
	}

	/* posts */
	await postQ.create({
		data: {
			title: 'Welcome to LibreLMS',
			body: "LibreLMS is an open learning platform built for the modern web.\n\nOur mission is simple: make quality course creation and learning tracking effortless for everyone. Instructors get focused authoring tools, students get a clean learning experience with real progress tracking.\n\nThis is the first post on our blog. Expect feature announcements, learning guides and behind-the-scenes notes here.",
			author: manager.id,
			publishedAt: daysAgo(12),
		},
	});
	await postQ.create({
		data: {
			title: 'Five habits of effective learners',
			body: 'Learning a new skill is a system, not a burst of motivation.\n\n1. Learn in small, frequent sessions: spaced repetition beats cramming.\n2. Active recall: close the lesson and reproduce it from memory.\n3. Build something with every concept you learn.\n4. Track your progress visibly: a rising percentage is great fuel.\n5. Teach what you learned; gaps reveal themselves fast.\n\nUse the progress bars in My Courses to spot courses you have stalled on, and finish them one lesson at a time.',
			author: manager.id,
			publishedAt: daysAgo(5),
		},
	});
	await postQ.create({
		data: {
			title: 'Draft: Platform roadmap 2027',
			body: 'Ideas we are considering for next year:\n- Certificates on course completion\n- Discussion forums per course\n- Live sessions\n\n(This is a draft post used to demo the draft/publish workflow. It should not be visible to the public.)',
			author: manager.id,
			publishedAt: null,
		},
	});

	strapi.log.info('[seed] demo content ready');
}
