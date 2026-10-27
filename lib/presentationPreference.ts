import type { AppData } from './domain.ts';
/** A view-only preference must not recreate GPS dependency objects. This runs
 * only when Legacy View changes, never on normal GPS/timer/save operations. */
export function preservePresentationReferences(current:AppData,draft:AppData):AppData {
  if(current.settings.legacyView===draft.settings.legacyView)return draft;
  const comparable={...draft,settings:{...draft.settings,legacyView:current.settings.legacyView}};
  if(JSON.stringify(comparable)!==JSON.stringify(current))return draft;
  return {...current,settings:{...current.settings,legacyView:draft.settings.legacyView}};
}
