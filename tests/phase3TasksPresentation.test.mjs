import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = await mkdtemp(join(tmpdir(), 'phase3-tasks-'));
const output = join(temporary, 'tasks.mjs');
await build({ entryPoints: ['components/Phase3TasksOverview.tsx'], outfile: output, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic' });
const { default: Overview } = await import(pathToFileURL(output));
const base = { hidden: false, current: null, paused: [], cleaning: 3, preparation: 2, managementBlocked: 0, onJump() {} };
const render = props => renderToStaticMarkup(React.createElement(Overview, { ...base, ...props }));

test('production task overview renders quick work above work groups without inventing completion', () => {
  const html = render({ current: { name: 'Quick Tasks in progress', time: '00:42', target: 'quick' } });
  assert.match(html, /Quick Tasks in progress/);
  assert.match(html, /00:42/);
  assert.ok(html.indexOf('Quick Tasks in progress') < html.indexOf('Cleaning &amp; preparation'));
  assert.match(html, /shared timer/);
  assert.doesNotMatch(html, /42 minutes|100%|completed/);
});
test('production task overview renders paused worked time and navigation to original resume controls', () => {
  const html = render({ paused: [{ id: 'dishes', name: 'Cleaning dishes', time: '3m' }] });
  assert.match(html, /Paused · ready to resume/);
  assert.match(html, /3m worked · open resume controls/);
  const actions = [];
  const element = Overview({ ...base, paused: [{ id: 'dishes', name: 'Cleaning dishes', time: '3m' }], onJump: (...args) => actions.push(args) });
  element.props.children[1].props.children[1][0].props.onClick();
  assert.deepEqual(actions, [['scheduled', 'dishes']]);
});
test('production task overview keeps blocked bulk outcomes distinct and preserves legacy hiding', () => {
  const html = render({ managementBlocked: 4, current: { name: 'Management blocked', time: '2m', target: 'blocked' } });
  assert.match(html, /Management blocked · 4 affected/);
  assert.match(html, /bulk task outcomes · separate from completion/);
  assert.match(render({ hidden: true }), /<section[^>]*hidden=""/);
});
test.after(async () => rm(temporary, { recursive: true, force: true }));
