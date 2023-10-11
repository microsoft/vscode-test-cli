/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ProgressReporter } from '@vscode/test-electron';

export interface IBaseTestConfiguration {
	/**
	 * A file or list of files in which to find tests. Non-absolute paths will
	 * be treated as glob expressions relative to the location of
	 * the `.vscode-test.js` file.
	 */
	files: string | readonly string[];

	/**
	 * Version to download and install. This may be:
	 *   - A quality, like `stable` or `insiders`
	 *   - A version number, like `1.82.0`
	 *   - A commit hash of a version to install
	 *
	 * Defaults to `stable`, which is latest stable version.
	 */
	version?: 'insiders' | 'stable' | string;

	/**
	 * Defines extension directories to load during tests. Defaults to the directory
	 * of the `.vscode-test.js` file. Must include a `package.json` Extension Manifest.
	 */
	extensionDevelopmentPath?: string | readonly string[];

	/**
	 * Path to a folder or workspace file that should be opened.
	 */
	workspaceFolder?: string;

	/**
	 * Additional options to pass to the Mocha runner. Any options given on the
	 * command line will be merged into and override these defaults.
	 * @see https://mochajs.org/api/mocha
	 */
	mocha?: Mocha.MochaOptions & {
		/**
		 * Specify file(s) to be loaded prior to root suite.
		 */
		preload: string | string[];
	};

	/**
	 * Optional label for this configuration, which can be used to specify which
	 * configuration to run if multiple configurations are provided.
	 */
	label?: string;
}

export interface IDesktopTestConfiguration extends IBaseTestConfiguration {
	/**
	 * Platform to use for running the tests.
	 */
	platform?: 'desktop';

	/**
	 * The VS Code desktop platform to download. If not specified, it defaults
	 * to the current platform.
	 *
	 * Possible values are:
	 * 	- `win32-archive`
	 * 	- `win32-x64-archive`
	 * 	- `win32-arm64-archive		`
	 * 	- `darwin`
	 * 	- `darwin-arm64`
	 * 	- `linux-x64`
	 * 	- `linux-arm64`
	 * 	- `linux-armhf`
	 */
	desktopPlatform?: string;

	/**
	 * A list of launch arguments passed to VS Code executable, in addition to `--extensionDevelopmentPath`
	 * and `--extensionTestsPath` which are provided by `extensionDevelopmentPath` and `extensionTestsPath`
	 * options.
	 *
	 * If the first argument is a path to a file/folder/workspace, the launched VS Code instance
	 * will open it.
	 *
	 * See `code --help` for possible arguments.
	 */
	launchArgs?: string[];

	/**
	 * Environment variables to set when running the test.
	 */
	env?: Record<string, string | undefined>;

	/**
	 * Configures a specific VS Code installation to use instead of automatically
	 * downloading the {@link version}
	 */
	useInstallation?:
		| {
				/**
				 * Whether VS Code should be launched using default settings and extensions
				 * installed on this machine. If `false`, then separate directories will be
				 * used inside the `.vscode-test` folder within the project.
				 *
				 * Defaults to `false`.
				 */
				fromMachine: boolean;
		  }
		| {
				/**
				 * The VS Code executable path used for testing.
				 *
				 * If not passed, will use `options.version` to download a copy of VS Code for testing.
				 * If `version` is not specified either, will download and use latest stable release.
				 */
				fromPath?: string;
		  };

	download?: {
		/**
		 * Progress reporter to use while VS Code is downloaded. Defaults to a
		 * console reporter. A {@link SilentReporter} is also available, and you
		 * may implement your own.
		 */

		reporter: ProgressReporter;
		/**
		 * Number of milliseconds after which to time out if no data is received from
		 * the remote when downloading VS Code. Note that this is an 'idle' timeout
		 * and does not enforce the total time VS Code may take to download.
		 */
		timeout?: number;
	};
}

/**
 * Configuration that runs in browsers.
 * @todo: this is incomplete, and does not yet function
 */
export interface IWebTestConfiguration extends IBaseTestConfiguration {
	platform: 'firefox' | 'webkit' | 'chromium';
}

export type TestConfiguration = IDesktopTestConfiguration | IWebTestConfiguration;
