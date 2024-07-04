import eslintPluginTypescript from '@typescript-eslint/eslint-plugin';
import eslintParserTypescript from '@typescript-eslint/parser';
import eslintAirbnb from 'eslint-config-airbnb-base';
import eslintAirbnbTs from 'eslint-config-airbnb-typescript/base.js';
import eslintPrettier from 'eslint-config-prettier';
import eslintPluginImport from 'eslint-plugin-import';

export default [
	{
		files: ['**/*.{js,ts}'],
		ignores: ['dist/**'],
		plugins: {
			import: eslintPluginImport,
			'@typescript-eslint': eslintPluginTypescript,
		},
		languageOptions: {
			parser: eslintParserTypescript,
			parserOptions: {
				project: './tsconfig.json',
				ecmaVersion: 2017,
				sourceType: 'module',
				ecmaFeatures: {
					modules: true,
				},
			},
		},
		rules: {
			...eslintAirbnb.rules,
			...eslintAirbnbTs.rules,
			...eslintPluginTypescript.configs.recommended.rules,
			...eslintPrettier.rules,

			'max-len': 'off', // just apply common-sense
			'no-param-reassign': 'off',
			'import/no-extraneous-dependencies': ['error', { devDependencies: true }], // all dev deps
			'no-bitwise': 'off', // for physics masks

			// prefer named
			'import/prefer-default-export': 'off',
			'import/no-default-export': 'error',

			'import/no-cycle': 'off', // fix + re-enable

			// extensions needed for non-ts files
			'import/extensions': [
				'error',
				'never',
				{
					js: 'always',
					json: 'always',
				},
			],
			// stylistic preferences
			'@typescript-eslint/ban-ts-comment': 'warn',
			'no-console': 'warn',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'class-methods-use-this': 'warn',

			// tabs instead of spaces
			'no-tabs': 'off',
			indent: ['error', 'tab', { SwitchCase: 1 }],
			'no-multi-assign': 'off',
			'no-plusplus': 'off',
			'no-continue': 'off',
			'lines-between-class-members': 'off',
		},
	},
	{
		files: ['eslint.config.js', 'vite.config.ts'],
		rules: {
			'import/no-default-export': 'off',
		},
	},
];
