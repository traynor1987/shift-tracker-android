import { createElement as h } from 'react';

type Category = { key: string; icon: string; eyebrow: string; title: string; description: string };
const groups = [
  { title: 'Everyday', keys: ['schedule', 'quick-tasks', 'display'] },
  { title: 'Tracking & GPS', keys: ['location', 'privacy'] },
  { title: 'Pay & Fuel', keys: ['pay'] },
  { title: 'Backup & Recovery', keys: ['data'] },
  { title: 'Advanced', keys: ['android', 'api', 'workload'] },
];

export function SettingsGroupMenu({ categories, query, onNavigate }: {
  categories: readonly Category[]; query: string; onNavigate: (key: string) => void;
}) {
  const search = query.trim().toLocaleLowerCase('en-GB');
  let count = 0;
  const sections = groups.map(group => {
    const rows = group.keys.flatMap(key => {
      const item = categories.find(category => category.key === key);
      if (!item || (search && !`${group.title} ${item.title} ${item.eyebrow} ${item.description}`.toLocaleLowerCase('en-GB').includes(search))) return [];
      count++;
      return [h('button', {key, type:'button',className:'settings-category-card','data-settings-section':key,onClick:()=>onNavigate(key)},
        h('b',{className:'settings-category-icon','aria-hidden':true},item.icon),
        h('span',null,h('strong',null,item.title),h('em',null,item.description)),
        h('i',{'aria-hidden':true},'›'))];
    });
    if (!rows.length) return null;
    if (group.title === 'Advanced') return h('details',{key:group.title,className:'settings-group settings-advanced',open:search ? true : undefined},h('summary',null,'Advanced'),h('div',{className:'settings-group-rows'},...rows));
    return h('section',{key:group.title,className:'settings-group','aria-label':group.title},h('h2',null,group.title),h('div',{className:'settings-group-rows'},...rows));
  });
  return h('div',{className:'settings-group-menu','aria-label':'Settings categories'},...sections,count ? null : h('p',{role:'status'},'No matching settings. Try GPS, pay, display or backup.'));
}

export function LegacyViewSwitch({enabled,onChange}:{enabled:boolean;onChange:(value:boolean)=>void}) {
  return h('div',{className:'setting-row legacy-view-setting'},
    h('div',null,h('strong',null,'Legacy View'),h('small',null,'Use the original layout across Shift Tracker. Your records and preferences stay the same.')),
    h('button',{type:'button',role:'switch','aria-label':'Legacy View','aria-checked':enabled,className:`geofence-toggle${enabled ? ' active' : ''}`,onClick:()=>onChange(!enabled)},enabled?'ON':'OFF'));
}
