import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
	'strapi::logger',
	'strapi::errors',
	'strapi::security',
	{
		name: 'strapi::cors',
		config: {
			origin: [
				'http://localhost:3000',
				...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
			],
		},
	},
	'strapi::poweredBy',
	'strapi::query',
	'strapi::body',
	'strapi::session',
	'strapi::favicon',
	'strapi::public',
];

export default config;
