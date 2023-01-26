import { applyChangesToString, Tree } from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import * as ts from 'typescript';
import { addInitialRoutes } from './add-initial-routes';

describe('addInitialRoutes', () => {
  let tree: Tree;
  let context: any;

  beforeEach(() => {
    context = {
      warn: jest.fn(),
    };
    tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
  });

  it('should add links and routes if they are not present', async () => {
    const sourceCode = `
import React from 'react';
const App = () => (
  <>
    <h1>Hello</h1>
  </>
);
export default App; 
      `;
    tree.write('/app.tsx', sourceCode);
    const source = ts.createSourceFile(
      '/app.tsx',
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    const result = applyChangesToString(
      sourceCode,
      addInitialRoutes('/app.tsx', source)
    );

    expect(result).toMatch(/role="navigation"/);
    expect(result).toMatch(/<Link\s+to="\/page-2"/);
    expect(result).toMatch(/<Route\s+path="\/page-2"/);
  });
});
