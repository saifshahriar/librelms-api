import type { Core } from '@strapi/types';

/**
 * Idempotent bootstrap:
 * - ensures the 4 platform roles exist
 * - sets users-permissions "advanced" defaults (register -> Student)
 * - seeds demo content when SEED_DEMO=true
 * (register override lives in extensions/users-permissions/strapi-server.ts)
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

		// Deferred so the plugin's own bootstrap has finished first.
		setTimeout(async () => {
			try {
				for (const role of ROLES) {
					const exists = await strapi.db
						.query('plugin::users-permissions.role')
						.findOne({ where: { type: role.type } });
					if (!exists) {
						await strapi.db
							.query('plugin::users-permissions.role')
							.create({ data: role });
						strapi.log.info(`[bootstrap] created role ${role.type}`);
					}
				}

				const student = await strapi.db
					.query('plugin::users-permissions.role')
					.findOne({ where: { type: 'student' } });
				if (student) {
					await strapi
						.store({ type: 'plugin', name: 'users-permissions' })
						.set({
							key: 'advanced',
							value: {
								default_role: 'student',
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
				strapi.log.warn(`[bootstrap] init failed: ${e}`);
			}
		}, 3000);
	},
};
