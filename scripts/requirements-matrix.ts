/**
 * Full requirements matrix test — run against a freshly seeded database.
 * Start the backend with SEED_RESTORE=true for reproducible state:
 *   SEED_RESTORE=true bun run develop
 */
const BASE = process.env.API_URL ?? "http://localhost:1337";
let pass = 0;
let fail = 0;
const check = (n: string, c: boolean, x = "") => {
	if (c) {
		pass++;
		console.log(`  ok ${n}`);
	} else {
		fail++;
		console.error(`  FAIL ${n} ${x}`);
	}
};
const j = (r: Response) => r.json().catch(() => null);
const login = async (i: string, p: string) =>
	(await j(
		await fetch(`${BASE}/api/auth/local`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ identifier: i, password: p }),
		}),
	)) as { jwt: string };
const A = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

/* ===== 1. AUTH + ROLE-BASED ACCESS (CORE) ===== */
const admin = await login("admin@librelms.dev", "admin123");
const manager = await login("manager@librelms.dev", "manager123");
const instructor = await login("instructor@librelms.dev", "instructor123");
const student = await login("student@librelms.dev", "student123");
const student2 = await login("student2@librelms.dev", "student123");
check("login works for all 4 roles", admin.jwt && manager.jwt && instructor.jwt && student.jwt && student2.jwt ? true : false);

for (const [name, tok] of [["admin", admin], ["manager", manager], ["instructor", instructor], ["student", student]] as const) {
	const me = await j(await fetch(`${BASE}/api/users/me`, { headers: { Authorization: `Bearer ${tok.jwt}` } }));
	check(`${name} /users/me returns role`, typeof me.data?.role === "string");
}

// register defaults to student
const rnd = Date.now();
const reg = await j(
	await fetch(`${BASE}/api/auth/local/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username: `matrix${rnd}`, email: `matrix${rnd}@t.dev`, password: "secret123", fullName: "Matrix User" }),
	}),
);
check("register returns jwt", Boolean(reg?.jwt));
const regMe = await j(await fetch(`${BASE}/api/users/me`, { headers: { Authorization: `Bearer ${reg.jwt}` } }));
check("new user is student", regMe.data?.role === "student", JSON.stringify(regMe).slice(0, 100));

// unauthenticated access blocked
const anon = await fetch(`${BASE}/api/my/courses`);
check("anonymous blocked from private routes", anon.status === 401 || anon.status === 403, `got ${anon.status}`);

/* ===== 2. COURSE MANAGEMENT (CORE) ===== */
// staff create
const newCourse = await j(await fetch(`${BASE}/api/courses`, { method: "POST", headers: A(manager.jwt), body: JSON.stringify({ title: "Matrix Course", description: "temp" }) }));
check("manager creates course", Boolean(newCourse.data?.id));
const cId = newCourse.data.id;

// student cannot create
const studCreate = await fetch(`${BASE}/api/courses`, { method: "POST", headers: A(student.jwt), body: JSON.stringify({ title: "nope" }) });
check("student cannot create course", studCreate.status === 403, `got ${studCreate.status}`);

// instructor create auto-assigns them as instructor
const instrCourse = await j(await fetch(`${BASE}/api/courses`, { method: "POST", headers: A(instructor.jwt), body: JSON.stringify({ title: "Instr Matrix", description: "t" }) }));
check("instructor create auto-assigns", instrCourse.data?.instructorIds?.includes(3), JSON.stringify(instrCourse.data?.instructorIds));
await fetch(`${BASE}/api/courses/${instrCourse.data.id}`, { method: "DELETE", headers: A(instructor.jwt) });

// edit + delete per matrix
const upd = await fetch(`${BASE}/api/courses/${cId}`, { method: "PUT", headers: A(manager.jwt), body: JSON.stringify({ title: "Matrix Course v2" }) });
check("manager edits any course", upd.status === 200);
const instrUpd = await fetch(`${BASE}/api/courses/${cId}`, { method: "PUT", headers: A(instructor.jwt), body: JSON.stringify({ title: "x" }) });
check("instructor cannot edit foreign course", instrUpd.status === 403, `got ${instrUpd.status}`);
const del = await fetch(`${BASE}/api/courses/${cId}`, { method: "DELETE", headers: A(manager.jwt) });
check("manager deletes course", del.status === 200);

/* ===== 3. LESSONS (CORE) ===== */
const lessonCourse = await j(await fetch(`${BASE}/api/courses`, { method: "POST", headers: A(manager.jwt), body: JSON.stringify({ title: "LessonHost", description: "t" }) }));
const lc = lessonCourse.data.id;
const l1 = await j(await fetch(`${BASE}/api/lessons`, { method: "POST", headers: A(manager.jwt), body: JSON.stringify({ courseId: lc, title: "L1", kind: "text", body: "# Content" }) }));
const l2 = await j(await fetch(`${BASE}/api/lessons`, { method: "POST", headers: A(manager.jwt), body: JSON.stringify({ courseId: lc, title: "L2", kind: "text", body: "Second" }) }));
check("lessons created with order 1,2", l1.data?.order === 1 && l2.data?.order === 2, `${l1.data?.order},${l2.data?.order}`);
const lEdit = await fetch(`${BASE}/api/lessons/${l1.data.id}`, { method: "PUT", headers: A(manager.jwt), body: JSON.stringify({ title: "L1 edited" }) });
check("lesson edited", lEdit.status === 200);
const lDel = await fetch(`${BASE}/api/lessons/${l2.data.id}`, { method: "DELETE", headers: A(manager.jwt) });
check("lesson deleted", lDel.status === 200);

/* ===== 4. ENROLLMENT (CORE) ===== */
const enroll = await fetch(`${BASE}/api/enrollments`, { method: "POST", headers: A(student2.jwt), body: JSON.stringify({ courseId: lc }) });
check("student enrolls", enroll.status === 200, `got ${enroll.status}`);
const dupEnroll = await fetch(`${BASE}/api/enrollments`, { method: "POST", headers: A(student2.jwt), body: JSON.stringify({ courseId: lc }) });
check("duplicate enrollment rejected", dupEnroll.status === 400, `got ${dupEnroll.status}`);
const staffEnroll = await fetch(`${BASE}/api/enrollments`, { method: "POST", headers: A(manager.jwt), body: JSON.stringify({ courseId: lc }) });
check("staff cannot enroll", staffEnroll.status === 403, `got ${staffEnroll.status}`);

// lesson visibility: enrolled vs not
const s2lessons = await j(await fetch(`${BASE}/api/lessons?courseId=${lc}`, { headers: A(student2.jwt) }));
check("enrolled student sees lessons", s2lessons.data?.length === 1);
const s1lessons = await fetch(`${BASE}/api/lessons?courseId=${lc}`, { headers: A(student.jwt) });
check("non-enrolled student blocked", s1lessons.status === 403, `got ${s1lessons.status}`);

/* ===== 5. LESSON VIEWING (CORE) ===== */
const view = await j(await fetch(`${BASE}/api/lessons/${l1.data.id}`, { headers: A(student2.jwt) }));
check("lesson view renders markdown body", view.data?.content?.body?.includes("# Content"), JSON.stringify(view.data?.content).slice(0, 80));

/* ===== 6. PROGRESS TRACKING (DIFFERENTIATOR) ===== */
await fetch(`${BASE}/api/lesson-completions`, { method: "POST", headers: A(student2.jwt), body: JSON.stringify({ lessonId: l1.data.id }) });
const prog = await j(await fetch(`${BASE}/api/courses/${lc}/progress`, { headers: A(student2.jwt) }));
check("progress 100% after all lessons", prog.data?.percent === 100, JSON.stringify(prog).slice(0, 100));

// idempotent re-mark
const reMark = await fetch(`${BASE}/api/lesson-completions`, { method: "POST", headers: A(student2.jwt), body: JSON.stringify({ lessonId: l1.data.id }) });
const reMarkBody = await j(reMark);
check("re-mark idempotent", reMark.status === 200 && reMarkBody.data?.lessonId === l1.data.id);

// staff per-student progress
const staffProg = await j(await fetch(`${BASE}/api/courses/${lc}/progress`, { headers: A(manager.jwt) }));
check("staff sees per-student progress", Array.isArray(staffProg.data) && staffProg.data.length === 1, JSON.stringify(staffProg).slice(0, 120));
// student denied progress on a course they're not enrolled in
const sProgOther = await fetch(`${BASE}/api/courses/1/progress`, { headers: A(student.jwt) });
const sProgBody = await j(sProgOther);
check(
	"progress route scoped (own course or 403)",
	sProgOther.status === 403 || typeof sProgBody?.data?.percent === "number",
	`got ${sProgOther.status}`,
);

// my/courses includes progress
const my = await j(await fetch(`${BASE}/api/my/courses`, { headers: A(student2.jwt) }));
const myTarget = my.data?.find((x: any) => x.course.id === lc);
check("my/courses shows course+progress", Boolean(myTarget?.course && typeof myTarget?.progress?.percent === "number"));

/* ===== 7. QUIZ + AUTO-GRADING (DIFFERENTIATOR) ===== */
const quiz = await j(
	await fetch(`${BASE}/api/quizzes`, {
		method: "POST",
		headers: A(manager.jwt),
		body: JSON.stringify({
			courseId: lc,
			title: "Matrix Quiz",
			questions: [
				{ text: "2+2?", options: [{ text: "4", isCorrect: true }, { text: "5", isCorrect: false }] },
				{ text: "2+3?", options: [{ text: "4", isCorrect: false }, { text: "5", isCorrect: true }] },
			],
		}),
	}),
);
check("quiz created", Boolean(quiz.data?.id));
const qView = await j(await fetch(`${BASE}/api/quizzes/${quiz.data.id}/view`, { headers: A(student2.jwt) }));
const leaked = JSON.stringify(qView).includes("isCorrect");
check("quiz view sanitized (no isCorrect)", !leaked);

// student takes quiz — instant score
const submit = await j(await fetch(`${BASE}/api/quizzes/${quiz.data.id}/submit`, { method: "POST", headers: A(student2.jwt), body: JSON.stringify({ answers: [0, 1] }) }));
check("perfect score 2/2", submit.data?.score === 2 && submit.data?.total === 2, JSON.stringify(submit).slice(0, 120));
check("returns correctAnswers", submit.data?.correctAnswers?.[0] === 0 && submit.data?.correctAnswers?.[1] === 1);

// non-enrolled student cannot take
const s1submit = await fetch(`${BASE}/api/quizzes/${quiz.data.id}/submit`, { method: "POST", headers: A(student.jwt), body: JSON.stringify({ answers: [0, 1] }) });
check("non-enrolled quiz submit 403", s1submit.status === 403, `got ${s1submit.status}`);
// staff cannot take quizzes
const mgrSubmit = await fetch(`${BASE}/api/quizzes/${quiz.data.id}/submit`, { method: "POST", headers: A(manager.jwt), body: JSON.stringify({ answers: [0, 1] }) });
check("staff quiz submit 403", mgrSubmit.status === 403, `got ${mgrSubmit.status}`);

// results stored + viewable later
const results = await j(await fetch(`${BASE}/api/my/quiz-results`, { headers: A(student2.jwt) }));
const myResult = results.data?.find((r: any) => r.quizId === quiz.data.id);
check("result stored and viewable", myResult?.score === 2, JSON.stringify(results).slice(0, 150));

// instructor can create quiz on own course but not foreign
const instrQuiz = await fetch(`${BASE}/api/quizzes`, { method: "POST", headers: A(instructor.jwt), body: JSON.stringify({ courseId: lc, title: "nope", questions: [{ text: "?", options: [{ text: "a", isCorrect: true }] }] }) });
check("instructor quiz on foreign course 403", instrQuiz.status === 403, `got ${instrQuiz.status}`);

/* ===== 8. ADMIN PANEL (DIFFERENTIATOR) ===== */
const stats = await j(await fetch(`${BASE}/api/stats`, { headers: A(admin.jwt) }));
check("stats: users per role", Object.keys(stats.data?.usersByRole ?? {}).length === 4);
check("stats: counts", stats.data.totalCourses >= 3 && stats.data.totalEnrollments >= 1 && stats.data.publishedPosts >= 2, JSON.stringify(stats.data).slice(0, 150));
const statsDeny = await fetch(`${BASE}/api/stats`, { headers: A(manager.jwt) });
check("stats admin-only", statsDeny.status === 403, `got ${statsDeny.status}`);

// user list + role management
const users = await j(await fetch(`${BASE}/api/users`, { headers: A(admin.jwt) }));
check("admin lists users", Array.isArray(users.data) && users.data.length >= 5);
const usersDeny = await fetch(`${BASE}/api/users`, { headers: A(instructor.jwt) });
check("users admin-only", usersDeny.status === 403, `got ${usersDeny.status}`);

const promote = await fetch(`${BASE}/api/users/${users.data.find((u: any) => u.username === "student2").id}/role`, { method: "PUT", headers: A(admin.jwt), body: JSON.stringify({ role: "instructor" }) });
check("admin promotes user", promote.status === 200);
const promoted = await login("student2@librelms.dev", "student123");
const promotedMe = await j(await fetch(`${BASE}/api/users/me`, { headers: { Authorization: `Bearer ${promoted.jwt}` } }));
check("promoted role effective", promotedMe.data?.role === "instructor", JSON.stringify(promotedMe).slice(0, 80));
// revert
await fetch(`${BASE}/api/users/${users.data.find((u: any) => u.username === "student2").id}/role`, { method: "PUT", headers: A(admin.jwt), body: JSON.stringify({ role: "student" }) });
const nonAdminRole = await fetch(`${BASE}/api/users/1/role`, { method: "PUT", headers: A(manager.jwt), body: JSON.stringify({ role: "admin" }) });
check("role change admin-only", nonAdminRole.status === 403, `got ${nonAdminRole.status}`);

/* ===== 9. BLOG (DIFFERENTIATOR) ===== */
const draft = await j(await fetch(`${BASE}/api/posts`, { method: "POST", headers: A(manager.jwt), body: JSON.stringify({ title: "Matrix Draft", body: "secret draft", published: false }) }));
check("CM creates draft", Boolean(draft.data?.id));
const pub = await j(await fetch(`${BASE}/api/posts`, { method: "POST", headers: A(manager.jwt), body: JSON.stringify({ title: "Matrix Pub", body: "hello", published: true }) }));
check("CM creates published post", Boolean(pub.data?.id));

// drafts invisible to public/students
const pubList = await j(await fetch(`${BASE}/api/posts`));
check("public list excludes drafts", pubList.data.every((p: any) => p.publishedAt !== null) && !pubList.data.some((p: any) => p.title === "Matrix Draft"));
const pubDetail = await fetch(`${BASE}/api/posts/${draft.data.documentId}`);
check("public draft detail 404", pubDetail.status === 404, `got ${pubDetail.status}`);
// staff preview sees drafts
const staffList = await j(await fetch(`${BASE}/api/posts?publicationState=preview`, { headers: A(manager.jwt) }));
check("staff preview includes drafts", staffList.data.some((p: any) => p.title === "Matrix Draft"));
const studentList = await j(await fetch(`${BASE}/api/posts?publicationState=preview`, { headers: A(student.jwt) }));
check("student cannot preview drafts", !studentList.data.some((p: any) => p.title === "Matrix Draft"));

// draft -> publish flow
const publish = await fetch(`${BASE}/api/posts/${draft.data.documentId}`, { method: "PUT", headers: A(manager.jwt), body: JSON.stringify({ published: true }) });
check("publish works", publish.status === 200);
const afterPub = await j(await fetch(`${BASE}/api/posts/${draft.data.documentId}`));
check("now publicly visible", afterPub.data?.publishedAt !== null);

// instructor cannot write posts
const instrPost = await fetch(`${BASE}/api/posts`, { method: "POST", headers: A(instructor.jwt), body: JSON.stringify({ title: "nope", body: "x" }) });
check("instructor cannot write posts", instrPost.status === 403, `got ${instrPost.status}`);

// cleanup matrix posts
await fetch(`${BASE}/api/posts/${pub.data.documentId}`, { method: "DELETE", headers: A(manager.jwt) });
await fetch(`${BASE}/api/posts/${draft.data.documentId}`, { method: "DELETE", headers: A(manager.jwt) });
// cleanup matrix course (cascade removes lesson/quiz/results)
await fetch(`${BASE}/api/courses/${lc}`, { method: "DELETE", headers: A(manager.jwt) });

/* ===== 10. UPLOADS ===== */
// staff upload works
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
for (let i = 0; i < 600; i++) png.push(i % 256);
const fd = new FormData();
fd.append("files", new Blob([new Uint8Array(png)], { type: "image/png" }), "matrix.png");
const upMgr = await j(await fetch(`${BASE}/api/platform/upload`, { method: "POST", headers: { Authorization: `Bearer ${manager.jwt}` }, body: fd }));
check("manager upload", Boolean(upMgr.data?.ids?.[0]), JSON.stringify(upMgr).slice(0, 100));

// INSTRUCTOR upload (was broken - staff-only)
const fd2 = new FormData();
fd2.append("files", new Blob([new Uint8Array(png)], { type: "image/png" }), "matrix2.png");
const upInstr = await j(await fetch(`${BASE}/api/platform/upload`, { method: "POST", headers: { Authorization: `Bearer ${instructor.jwt}` }, body: fd2 }));
check("instructor upload", Boolean(upInstr.data?.ids?.[0]), JSON.stringify(upInstr).slice(0, 100));

// student cannot upload
const fd3 = new FormData();
fd3.append("files", new Blob([new Uint8Array(png)], { type: "image/png" }), "matrix3.png");
const upStud = await fetch(`${BASE}/api/platform/upload`, { method: "POST", headers: { Authorization: `Bearer ${student.jwt}` }, body: fd3 });
check("student upload 403", upStud.status === 403, `got ${upStud.status}`);

// uploaded file served
const fileOk = await fetch(`${BASE}${upMgr.data.urls[0]}`);
check("uploaded file served", fileOk.status === 200, `${upMgr.data.urls[0]} -> ${fileOk.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
