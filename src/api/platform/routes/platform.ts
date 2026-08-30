/**
 * Contract-mirror routes for the LibreLMS frontend.
 * Policy chain enforces the role matrix on every route.
 */
export default {
	routes: [
		/* ---------- courses ---------- */
		{
			method: 'GET',
			path: '/courses',
			handler: 'api::platform.platform.coursesList',
			config: { auth: false },
		},
		{
			method: 'GET',
			path: '/courses/:ref',
			handler: 'api::platform.platform.courseFind',
			config: { auth: false },
		},
		{
			method: 'POST',
			path: '/courses',
			handler: 'api::platform.platform.courseCreate',
			config: { auth: false, policies: ['global::is-authenticated-app'] },
		},
		{
			method: 'PUT',
			path: '/courses/:ref',
			handler: 'api::platform.platform.courseUpdate',
			config: { auth: false, policies: ['global::is-course-owner'] },
		},
		{
			method: 'DELETE',
			path: '/courses/:ref',
			handler: 'api::platform.platform.courseDelete',
			config: { auth: false, policies: ['global::is-course-owner'] },
		},
		{
			method: 'GET',
			path: '/courses/:ref/progress',
			handler: 'api::platform.platform-extra.courseProgress',
			config: { auth: false, policies: ['global::is-authenticated-app'] },
		},

		/* ---------- lessons ---------- */
		{
			method: 'GET',
			path: '/lessons',
			handler: 'api::platform.platform.lessonsList',
			config: { auth: false },
		},
		{
			method: 'GET',
			path: '/lessons/:ref',
			handler: 'api::platform.platform.lessonFind',
			config: { auth: false, policies: ['global::lesson-access'] },
		},
		{
			method: 'POST',
			path: '/lessons',
			handler: 'api::platform.platform.lessonCreate',
			config: { auth: false, policies: ['global::course-content-owner'] },
		},
		{
			method: 'PUT',
			path: '/lessons/:ref',
			handler: 'api::platform.platform.lessonUpdate',
			config: { auth: false, policies: ['global::is-course-owner'] },
		},
		{
			method: 'DELETE',
			path: '/lessons/:ref',
			handler: 'api::platform.platform.lessonDelete',
			config: { auth: false, policies: ['global::is-course-owner'] },
		},

		/* ---------- quizzes ---------- */
		{
			method: 'GET',
			path: '/quizzes',
			handler: 'api::platform.platform-extra.quizzesList',
			config: { auth: false },
		},
		{
			method: 'GET',
			path: '/quizzes/:ref/view',
			handler: 'api::platform.platform-extra.quizView',
			config: { auth: false, policies: ['global::quiz-access'] },
		},
		{
			method: 'GET',
			path: '/quizzes/:ref',
			handler: 'api::platform.platform-extra.quizFind',
			config: { auth: false, policies: ['global::quiz-access'] },
		},
		{
			method: 'POST',
			path: '/quizzes',
			handler: 'api::platform.platform-extra.quizCreate',
			config: { auth: false, policies: ['global::course-content-owner'] },
		},
		{
			method: 'PUT',
			path: '/quizzes/:ref',
			handler: 'api::platform.platform-extra.quizUpdate',
			config: { auth: false, policies: ['global::is-course-owner'] },
		},
		{
			method: 'DELETE',
			path: '/quizzes/:ref',
			handler: 'api::platform.platform-extra.quizDelete',
			config: { auth: false, policies: ['global::is-course-owner'] },
		},
		{
			method: 'POST',
			path: '/quizzes/:ref/submit',
			handler: 'api::platform.platform-extra.quizSubmit',
			config: { auth: false, policies: ['global::is-student'] },
		},

		/* ---------- student flows ---------- */
		{
			method: 'POST',
			path: '/enrollments',
			handler: 'api::platform.platform-extra.enroll',
			config: { auth: false, policies: ['global::is-student'] },
		},
		{
			method: 'POST',
			path: '/lesson-completions',
			handler: 'api::platform.platform-extra.completeLesson',
			config: { auth: false, policies: ['global::is-student'] },
		},
		{
			method: 'GET',
			path: '/my/courses',
			handler: 'api::platform.platform-extra.myCourses',
			config: { auth: false, policies: ['global::is-student'] },
		},
		{
			method: 'GET',
			path: '/my/quiz-results',
			handler: 'api::platform.platform-extra.myQuizResults',
			config: { auth: false, policies: ['global::is-student'] },
		},

		/* ---------- posts ---------- */
		{
			method: 'GET',
			path: '/posts',
			handler: 'api::platform.platform-admin.postsList',
			config: { auth: false },
		},
		{
			method: 'GET',
			path: '/posts/:ref',
			handler: 'api::platform.platform-admin.postFind',
			config: { auth: false },
		},
		{
			method: 'POST',
			path: '/posts',
			handler: 'api::platform.platform-admin.postCreate',
			config: { auth: false, policies: ['global::is-staff'] },
		},
		{
			method: 'PUT',
			path: '/posts/:ref',
			handler: 'api::platform.platform-admin.postUpdate',
			config: { auth: false, policies: ['global::is-staff'] },
		},
		{
			method: 'DELETE',
			path: '/posts/:ref',
			handler: 'api::platform.platform-admin.postDelete',
			config: { auth: false, policies: ['global::is-staff'] },
		},

		/* ---------- admin ---------- */
		{
			method: 'GET',
			path: '/stats',
			handler: 'api::platform.platform-admin.stats',
			config: { auth: false, policies: ['global::is-admin'] },
		},
		{
			method: 'GET',
			path: '/users',
			handler: 'api::platform.platform-admin.usersList',
			config: { auth: false, policies: ['global::is-admin'] },
		},
		{
			method: 'GET',
			path: '/users/me',
			handler: 'api::platform.platform-admin.usersMe',
			config: { auth: false, policies: ['global::is-authenticated-app'] },
		},
		{
			method: 'PUT',
			path: '/users/me',
			handler: 'api::platform.platform-admin.usersMeUpdate',
			config: { auth: false, policies: ['global::is-authenticated-app'] },
		},
		{
			method: 'PUT',
			path: '/users/:id/role',
			handler: 'api::platform.platform-admin.setUserRole',
			config: { auth: false, policies: ['global::is-admin'] },
		},
	],
};
