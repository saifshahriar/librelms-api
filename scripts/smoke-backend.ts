/**
 * Smoke test against the live Strapi backend.
 * Re-runs the frontend mock's 19 assertions through real HTTP.
 * Run: bun scripts/smoke-backend.ts
 */
const BASE = process.env.API_URL ?? "http://localhost:1337";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
	if (cond) {
		pass++;
		console.log(`  ✓ ${name}`);
	} else {
		fail++;
		console.error(`  ✗ ${name} ${extra}`);
	}
}

async function req(
	path: string,
	init?: RequestInit,
): Promise<{ status: number; body: any }> {
	const res = await fetch(`${BASE}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});
	let body: any = null;
	try {
		body = await res.json();
	} catch {
		/* no body */
	}
	return { status: res.status, body };
}

const auth = (jwt: string) => ({ Authorization: `Bearer ${jwt}` });

async function login(identifier: string, password: string) {
	const r = await req("/api/auth/local", {
		method: "POST",
		body: JSON.stringify({ identifier, password }),
	});
	return r.body;
}

async function main() {
	// 1. logins for every role
	const admin = await login("admin@librelms.dev", "admin123");
	const manager = await login("manager@librelms.dev", "manager123");
	const instructor = await login("instructor@librelms.dev", "instructor123");
	const student = await login("student@librelms.dev", "student123");
	check("admin login", Boolean(admin?.jwt));
	check("manager login", Boolean(manager?.jwt));
	check("instructor login", Boolean(instructor?.jwt));
	check("student login", Boolean(student?.jwt));

	// 2. public courses list, contract shape
	const courses = await req("/api/courses");
	check(
		"public courses list (3, flat shape)",
		courses.body?.data?.length === 3 &&
			typeof courses.body.data[0].instructorIds[0] === "number",
	);

	// 3. my courses for student
	const myCourses = await req("/api/my/courses", {
		headers: auth(student.jwt),
	});
	check(
		"student my/courses with progress",
		myCourses.body?.data?.length >= 2 &&
			typeof myCourses.body.data[0].progress.percent === "number",
	);

	// 4. unauthenticated -> 401/403
	const noTok = await req("/api/my/courses");
	check("my/courses without token rejected", noTok.status === 403 || noTok.status === 401, `got ${noTok.status}`);

	// 5. student cannot create course
	const hack = await req("/api/courses", {
		method: "POST",
		headers: auth(student.jwt),
		body: JSON.stringify({ title: "Hack", description: "" }),
	});
	check("student course create rejected", hack.status === 403, `got ${hack.status}`);

	// 6. lessons visible to enrolled student
	const lessons = await req("/api/lessons?courseId=1", {
		headers: auth(student.jwt),
	});
	check(
		"enrolled student sees 4 lessons",
		lessons.body?.data?.length === 4,
	);

	// 7. quiz view sanitized
	const quizView = await req("/api/quizzes/1/view", {
		headers: auth(student.jwt),
	});
	const leaked = quizView.body?.data?.questions?.some(
		(q: any) => q.options.some((o: any) => o.isCorrect !== undefined),
	);
	check("quiz view has no correct answers", !leaked);

	// 8. quiz submit grades server-side
	const submit = await req("/api/quizzes/1/submit", {
		method: "POST",
		headers: auth(student.jwt),
		body: JSON.stringify({ answers: [0, 0, 0] }),
	});
	check(
		"quiz submit perfect score",
		submit.body?.data?.score === 3 && submit.body?.data?.total === 3,
		JSON.stringify(submit.body).slice(0, 120),
	);
	check(
		"submit returns correctAnswers",
		submit.body?.data?.correctAnswers?.length === 3,
	);

	// 9. results history
	const results = await req("/api/my/quiz-results", {
		headers: auth(student.jwt),
	});
	check(
		"results history stored",
		results.body?.data?.some((r: any) => r.score === 3),
	);

	// 10. lesson completion + progress
	const done = await req("/api/lesson-completions", {
		method: "POST",
		headers: auth(student.jwt),
		body: JSON.stringify({ lessonId: 3 }),
	});
	check("mark complete", done.status === 200, `got ${done.status}`);
	const progress = await req("/api/courses/1/progress", {
		headers: auth(student.jwt),
	});
	check(
		"progress now 3/4 = 75%",
		progress.body?.data?.percent === 75,
		JSON.stringify(progress.body).slice(0, 120),
	);

	// 11. admin stats + role mgmt
	const stats = await req("/api/stats", { headers: auth(admin.jwt) });
	check("admin stats", stats.body?.data?.totalUsers === 5, JSON.stringify(stats.body).slice(0, 100));
	const statsDenied = await req("/api/stats", {
		headers: auth(student.jwt),
	});
	check("stats denied to student", statsDenied.status === 403, `got ${statsDenied.status}`);

	const users = await req("/api/users", { headers: auth(admin.jwt) });
	const student2 = users.body?.data?.find((u: any) => u.username === "student2");
	check("user list includes student2 as student", student2?.role === "student");

	// 12. instructor ownership
	const own = await req("/api/lessons?courseId=1", {
		headers: auth(instructor.jwt),
	});
	check("instructor sees own course lessons", own.body?.data?.length === 4);
	const denied = await req("/api/lessons?courseId=3", {
		headers: auth(instructor.jwt),
	});
	check(
		"instructor denied on non-owned course with message",
		denied.status === 403 &&
			JSON.stringify(denied.body).includes(
				"You don't have permission to view this course",
			),
		`got ${denied.status}: ${JSON.stringify(denied.body).slice(0, 100)}`,
	);

	// 13. drafts hidden publicly
	const posts = await req("/api/posts");
	check(
		"public posts: 2 published, draft hidden",
		posts.body?.data?.length === 2 &&
			posts.body.data.every((p: any) => p.publishedAt !== null),
	);

	// 14. duplicate enrollment rejected
	const dup = await req("/api/enrollments", {
		method: "POST",
		headers: auth(student.jwt),
		body: JSON.stringify({ courseId: 1 }),
	});
	check("duplicate enrollment rejected", dup.status === 400, `got ${dup.status}`);

	// 15. manager can create a course; student cannot manage posts
	const newCourse = await req("/api/courses", {
		method: "POST",
		headers: auth(manager.jwt),
		body: JSON.stringify({ title: "Temp Course", description: "smoke" }),
	});
	check("manager creates course", newCourse.body?.data?.id > 0);
	const del = await req(`/api/courses/${newCourse.body.data.id}`, {
		method: "DELETE",
		headers: auth(manager.jwt),
	});
	check("manager deletes course", del.status === 200);

	console.log(`\n${pass} passed, ${fail} failed`);
	if (fail > 0) process.exitCode = 1;
}

void main();
