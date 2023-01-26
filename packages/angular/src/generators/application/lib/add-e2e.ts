import { ensurePackage, Tree } from '@nrwl/devkit';
import { joinPathFragments } from '@nrwl/devkit';
import { Linter, lintProjectGenerator } from '@nrwl/linter';
import { nxVersion } from 'nx/src/utils/versions';

import { E2eTestRunner } from '../../../utils/test-runners';
import { addProtractor } from './add-protractor';
import { removeScaffoldedE2e } from './remove-scaffolded-e2e';
import { updateE2eProject } from './update-e2e-project';
import type { NormalizedSchema } from './normalized-schema';
export async function addE2e(tree: Tree, options: NormalizedSchema) {
  if (options.e2eTestRunner === E2eTestRunner.Protractor) {
    await addProtractor(tree, options);
  } else {
    removeScaffoldedE2e(tree, options, options.ngCliSchematicE2ERoot);
  }

  if (options.e2eTestRunner === 'cypress') {
    await ensurePackage(tree, '@nrwl/cypress', nxVersion);
    const { cypressProjectGenerator } = await import(
      '@nrwl/cypress/src/generators/cypress-project/cypress-project'
    );
    await cypressProjectGenerator(tree, {
      name: options.e2eProjectName,
      directory: options.directory,
      project: options.name,
      linter: options.linter,
      skipFormat: options.skipFormat,
      standaloneConfig: options.standaloneConfig,
      skipPackageJson: options.skipPackageJson,
      rootProject: options.rootProject,
    });
  }

  if (options.e2eTestRunner === E2eTestRunner.Protractor) {
    updateE2eProject(tree, options);
    if (options.linter === Linter.EsLint) {
      await lintProjectGenerator(tree, {
        project: options.e2eProjectName,
        linter: options.linter,
        eslintFilePatterns: [
          joinPathFragments(options.e2eProjectRoot, '**/*.ts'),
        ],
        unitTestRunner: options.unitTestRunner,
        skipFormat: true,
        setParserOptionsProject: options.setParserOptionsProject,
        skipPackageJson: options.skipPackageJson,
      });
    }
  }
}
