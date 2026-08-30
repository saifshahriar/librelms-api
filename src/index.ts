import type { Core } from '@strapi/types';

/**
 * Idempotent bootstrap: ensures the 4 platform roles exist. Default REST
 * stays locked (roles get no permissions). Registration defaults to
 * Student via the users-permissions create lifecycle.
 */
export default {
	register(/* { strapi }: { strapi: Core.Strapi } */) {},

	bootstrap({ strapi }: { strapi: Core.Strapi }) {
		const ROLES: { type: string; name: string; description: string }[] = [
			{
				type: 'admin',
				name: 'Admin',
				description: 'Full control of the platform',
			},
			{
				type: 'content_manager',
				name: 'Content Manager',
				description: 'Manages courses, lessons, quizzes and blog posts',
			},
			{
				type: 'instructor',
				name: 'Instructor',
				description: 'Manages lessons and quizzes of their own courses',
			},
			{
				type: 'student',
				name: 'Student',
				description: 'Enrolls in courses, takes quizzes, tracks progress',
			},
		];

		// Users-permissions "advanced" settings: default role on register.
		// We run this deferred so the plugin's own bootstrap (which also
		// writes this key) has finished first.
		setTimeout(async () => {
			try {
				const student = await strapi.db
					.query('plugin::users-permissions.role')
					.findOne({ where: { type: 'student' } });
				if (student) {
					await strapi
						.store({ type: 'plugin', name: 'users-permissions' })
						.set({
							key: 'advanced',
							value: {
								default_role: String(student.id),
								allow_register: true,
							},
						});
					strapi.log.info(
						`[bootstrap] default registration role: student (id ${student.id})`,
					);
				}
				if (process.env.SEED_DEMO === 'true') {
					const { seedDemo } = await import('./extensions/platform/seed');
					await seedDemo(strapi);
				}
			} catch (e) {
				strapi.log.warn(`[bootstrap] seed/default role failed: ${e}`);
			}
		}, 3000);
	},
};
