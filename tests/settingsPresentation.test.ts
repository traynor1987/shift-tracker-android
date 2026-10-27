import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as presentation from '../components/SettingsPresentation.ts';

test('grouped settings renders every category with advanced closed and supports search', () => {
  assert.equal(typeof presentation.SettingsGroupMenu, 'function');
  const categories = ['pay','workload','quick-tasks','android','location','privacy','api','schedule','display','data'].map(key => ({key,icon:'+',eyebrow:key,title:key,description:key === 'location' ? 'GPS route evidence' : key}));
  const html = renderToStaticMarkup(createElement(presentation.SettingsGroupMenu, {categories,query:'',onNavigate:()=>{}}));
  for (const label of ['Everyday','Tracking & GPS','Pay & Fuel','Backup & Recovery','Advanced']) assert.ok(html.includes(label.replaceAll("&", "&amp;")));
  for (const category of categories) assert.ok(html.includes(`data-settings-section="${category.key}"`));
  assert.match(html, /<details[^>]*class="settings-group settings-advanced"[^>]*>/);
  assert.doesNotMatch(html, /<details[^>]*open/);
  const filtered = renderToStaticMarkup(createElement(presentation.SettingsGroupMenu, {categories,query:'GPS',onNavigate:()=>{}}));
  assert.ok(filtered.includes('data-settings-section="location"'));
  assert.ok(!filtered.includes('data-settings-section="pay"'));
});
test('Legacy View is an accessible switch displaying canonical preference', () => {
  assert.equal(typeof presentation.LegacyViewSwitch,'function');
  for (const enabled of [false,true]) {
    const html = renderToStaticMarkup(createElement(presentation.LegacyViewSwitch,{enabled,onChange:()=>{}}));
    assert.ok(html.includes('role="switch"'));
    assert.ok(html.includes(`aria-checked="${enabled}"`));
    assert.ok(html.includes('Legacy View'));
  }
});

test('category actions navigate every existing section and switch requests the opposite value', () => {
  const keys = ['pay','workload','quick-tasks','android','location','privacy','api','schedule','display','data'];
  const selected: string[] = [];
  const tree = presentation.SettingsGroupMenu({categories:keys.map(key=>({key,icon:'+',eyebrow:key,title:key,description:key})),query:'',onNavigate:key=>selected.push(key)});
  const visit = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object' || !('props' in node)) return;
    const props = (node as {props: Record<string, unknown>}).props;
    if (props['data-settings-section']) (props.onClick as () => void)();
    visit(props.children);
  };
  visit(tree);
  assert.deepEqual([...selected].sort(),[...keys].sort());
  const changes: boolean[] = [];
  for (const enabled of [false,true]) {
    const switchTree = presentation.LegacyViewSwitch({enabled,onChange:value=>changes.push(value)});
    const children = (switchTree.props as unknown as {children: Array<{props: {onClick?: () => void}}>}).children;
    children[1].props.onClick!();
  }
  assert.deepEqual(changes,[true,false]);
});
