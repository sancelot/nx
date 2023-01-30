import type * as ts from 'typescript';
import { addInitialRoutes } from '../../../utils/add-initial-routes';
import { NormalizedSchema } from '../schema';
import {
  reactRouterDomVersion,
  typesReactRouterDomVersion,
} from '../../../utils/versions';
import {
  joinPathFragments,
  Tree,
  applyChangesToString,
  addDependenciesToPackageJson,
} from '@nrwl/devkit';

let tsModule: typeof import('typescript');

export function addRouting(host: Tree, options: NormalizedSchema) {
  if (!options.routing) {
    return () => {};
  }

  if (!tsModule) {
    tsModule = require('typescript');
  }
  const appPath = joinPathFragments(
    options.appProjectRoot,
    maybeJs(options, `src/app/${options.fileName}.tsx`)
  );
  const appFileContent = host.read(appPath, 'utf-8');
  const appSource = tsModule.createSourceFile(
    appPath,
    appFileContent,
    tsModule.ScriptTarget.Latest,
    true
  );

  const changes = applyChangesToString(
    appFileContent,
    addInitialRoutes(appPath, appSource)
  );
  host.write(appPath, changes);

  return addDependenciesToPackageJson(
    host,
    { 'react-router-dom': reactRouterDomVersion },
    { '@types/react-router-dom': typesReactRouterDomVersion }
  );
}

function maybeJs(options: NormalizedSchema, path: string): string {
  return options.js && (path.endsWith('.ts') || path.endsWith('.tsx'))
    ? path.replace(/\.tsx?$/, '.js')
    : path;
}
