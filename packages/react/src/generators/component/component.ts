import {
  addDependenciesToPackageJson,
  applyChangesToString,
  convertNxGenerator,
  formatFiles,
  generateFiles,
  GeneratorCallback,
  getProjects,
  joinPathFragments,
  logger,
  names,
  toJS,
  Tree,
} from '@nrwl/devkit';
import { runTasksInSerial } from '@nrwl/workspace/src/utilities/run-tasks-in-serial';
import { addStyledModuleDependencies } from '../../rules/add-styled-dependencies';
import { assertValidStyle } from '../../utils/assertion';
import { addImport } from '../../utils/add-import';
import { getInSourceVitestTestsTemplate } from '../../utils/get-in-source-vitest-tests-template';
import {
  reactRouterDomVersion,
  typesReactRouterDomVersion,
} from '../../utils/versions';
import { getComponentTests } from './get-component-tests';
import { NormalizedSchema } from './noramlized-schema';
import { Schema } from './schema';

export async function componentGenerator(host: Tree, schema: Schema) {
  const options = await normalizeOptions(host, schema);
  createComponentFiles(host, options);

  const tasks: GeneratorCallback[] = [];

  const styledTask = addStyledModuleDependencies(host, options.styledModule);
  tasks.push(styledTask);

  addExportsToBarrel(host, options);

  if (options.routing) {
    const routingTask = addDependenciesToPackageJson(
      host,
      { 'react-router-dom': reactRouterDomVersion },
      { '@types/react-router-dom': typesReactRouterDomVersion }
    );
    tasks.push(routingTask);
  }

  await formatFiles(host);

  return runTasksInSerial(...tasks);
}

function createComponentFiles(host: Tree, options: NormalizedSchema) {
  const componentDir = joinPathFragments(
    options.projectSourceRoot,
    options.directory
  );

  const componentTests = getComponentTests(options);
  generateFiles(host, joinPathFragments(__dirname, './files'), componentDir, {
    ...options,
    componentTests,
    inSourceVitestTests: getInSourceVitestTestsTemplate(componentTests),
    tmpl: '',
  });

  for (const c of host.listChanges()) {
    let deleteFile = false;

    if (
      (options.skipTests || options.inSourceTests) &&
      /.*spec.tsx/.test(c.path)
    ) {
      deleteFile = true;
    }

    if (
      (options.styledModule || !options.hasStyles) &&
      c.path.endsWith(`.${options.style}`)
    ) {
      deleteFile = true;
    }

    if (options.globalCss && c.path.endsWith(`.module.${options.style}`)) {
      deleteFile = true;
    }

    if (
      !options.globalCss &&
      c.path.endsWith(`${options.fileName}.${options.style}`)
    ) {
      deleteFile = true;
    }

    if (deleteFile) {
      host.delete(c.path);
    }
  }

  if (options.js) {
    toJS(host);
  }
}

let tsModule: typeof import('typescript');
function addExportsToBarrel(host: Tree, options: NormalizedSchema) {
  if (!tsModule) {
    tsModule = require('typescript');
  }
  const workspace = getProjects(host);
  const isApp = workspace.get(options.project).projectType === 'application';

  if (options.export && !isApp) {
    const indexFilePath = joinPathFragments(
      options.projectSourceRoot,
      options.js ? 'index.js' : 'index.ts'
    );
    const indexSource = host.read(indexFilePath, 'utf-8');
    if (indexSource !== null) {
      const indexSourceFile = tsModule.createSourceFile(
        indexFilePath,
        indexSource,
        tsModule.ScriptTarget.Latest,
        true
      );
      const changes = applyChangesToString(
        indexSource,
        addImport(
          indexSourceFile,
          `export * from './${options.directory}/${options.fileName}';`
        )
      );
      host.write(indexFilePath, changes);
    }
  }
}

async function normalizeOptions(
  host: Tree,
  options: Schema
): Promise<NormalizedSchema> {
  assertValidOptions(options);

  const { className, fileName } = names(options.name);
  const componentFileName =
    options.fileName ?? (options.pascalCaseFiles ? className : fileName);
  const project = getProjects(host).get(options.project);

  if (!project) {
    logger.error(
      `Cannot find the ${options.project} project. Please double check the project name.`
    );
    throw new Error();
  }

  const { sourceRoot: projectSourceRoot, projectType } = project;

  const directory = await getDirectory(host, options);

  const styledModule = /^(css|scss|less|styl|none)$/.test(options.style)
    ? null
    : options.style;

  if (options.export && projectType === 'application') {
    logger.warn(
      `The "--export" option should not be used with applications and will do nothing.`
    );
  }

  options.classComponent = options.classComponent ?? false;
  options.routing = options.routing ?? false;
  options.globalCss = options.globalCss ?? false;
  options.inSourceTests = options.inSourceTests ?? false;

  return {
    ...options,
    directory,
    styledModule,
    hasStyles: options.style !== 'none',
    className,
    fileName: componentFileName,
    projectSourceRoot,
  };
}

async function getDirectory(host: Tree, options: Schema) {
  const genNames = names(options.name);
  const fileName =
    options.pascalCaseDirectory === true
      ? genNames.className
      : genNames.fileName;
  const workspace = getProjects(host);
  let baseDir: string;
  if (options.directory) {
    baseDir = options.directory;
  } else {
    baseDir =
      workspace.get(options.project).projectType === 'application'
        ? 'app'
        : 'lib';
  }
  return options.flat ? baseDir : joinPathFragments(baseDir, fileName);
}

function assertValidOptions(options: Schema) {
  assertValidStyle(options.style);

  const slashes = ['/', '\\'];
  slashes.forEach((s) => {
    if (options.name.indexOf(s) !== -1) {
      const [name, ...rest] = options.name.split(s).reverse();
      let suggestion = rest.map((x) => x.toLowerCase()).join(s);
      if (options.directory) {
        suggestion = `${options.directory}${s}${suggestion}`;
      }
      throw new Error(
        `Found "${s}" in the component name. Did you mean to use the --directory option (e.g. \`nx g c ${name} --directory ${suggestion}\`)?`
      );
    }
  });
}

export default componentGenerator;

export const componentSchematic = convertNxGenerator(componentGenerator);
