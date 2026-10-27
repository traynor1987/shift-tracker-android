"use client";
import {Children,cloneElement,isValidElement,type ReactElement,type ReactNode} from 'react';
type Element=ReactElement<{className?:string;children?:ReactNode;title?:string;compact?:boolean}>;
const elements=(children:ReactNode)=>Children.toArray(children);
const hasClass=(node:ReactNode,name:string)=>isValidElement(node)&&String((node.props as {className?:string}).className??'').split(' ').includes(name);
/** Presentation adapter: reuse the original live controls exactly once, with the same handlers.
 * Legacy returns their original tree; Pro composes a distinct operational layout. No state owner. */
export default function ShiftScreenPresentation({legacy,className,children,hustle,taskActive,onOpenTasks}:{legacy:boolean;className:string;children:ReactNode;hustle:{value:string;detail:string};taskActive:boolean;onOpenTasks:()=>void}) {
 if(legacy)return <div className={className}>{children}</div>;
 const nodes=elements(children);const hero=nodes.find(n=>hasClass(n,'working-card')) as Element|undefined;
 const heroNodes=elements(hero?.props.children);const activity=heroNodes.find(n=>hasClass(n,'working-head')) as Element|undefined;
 const stats=heroNodes.find(n=>hasClass(n,'live-stats'));
 const health=heroNodes.find(n=>isValidElement(n)&&'tracking' in (n.props as object));
 const observer=heroNodes.find(n=>isValidElement(n)&&'activityId' in (n.props as object)&&'state' in (n.props as object));
 const originalDelivery=nodes.find(n=>hasClass(n,'delivery-panel')) as Element|undefined;
 const deliveryChildren=elements(originalDelivery?.props.children);
 const runCounts=deliveryChildren.find(n=>hasClass(n,'run-strip'));
 const deliverySecondary:ReactNode[]=[];
 const delivery=originalDelivery ? cloneElement(originalDelivery,{},deliveryChildren.filter(n=>n!==runCounts).map(node=>{
  if(!hasClass(node,'active-delivery-card'))return node;
  const card=node as Element;const contents=elements(card.props.children);
  const secondary=contents.filter(n=>hasClass(n,'active-destination-card')||hasClass(n,'live-route-button'));
  deliverySecondary.push(...secondary);
  return cloneElement(card,{},contents.filter(n=>!secondary.includes(n)).map(part=>{
   if(!hasClass(part,'active-delivery-copy'))return part;
   const copy=part as Element;const details=elements(copy.props.children);
   const evidence=details.filter(n=>isValidElement(n)&&(n.props as {title?:string;compact?:boolean}).title==='Delivery evidence & options');
   deliverySecondary.push(...evidence);
   const special=hasClass(card,'stock-run')||hasClass(card,'test-only-delivery-card');
   return cloneElement(copy,{},details.filter(n=>!evidence.includes(n)&&(special||!isValidElement(n)||!['small','strong'].includes(String(n.type)))));
  }));
 })) : null;
 const action=nodes.find(n=>hasClass(n,'delivery-action-row'));
 const timing=nodes.find(n=>isValidElement(n)&&(n.props as {title?:string;compact?:boolean}).title==='Early Dispatch & timing comparisons');
 const shiftActions=nodes.find(n=>hasClass(n,'shift-action-drawer'));
 const idle=Boolean((activity?.props as {'data-phase31-idle'?:boolean})?.['data-phase31-idle']);
 const excluded=new Set([hero,originalDelivery,action,timing,shiftActions]);
 const secondary=nodes.filter(n=>hasClass(n,'active-cleaning-summary')||hasClass(n,'shift-reminder-stack'));
 const remaining=nodes.filter(n=>!excluded.has(n as Element)&&!secondary.includes(n));
 const heroSecondary=heroNodes.filter(n=>n!==activity&&n!==stats&&n!==health&&n!==observer);
 return <div className={`${className} pro-shift-page`}>
  {observer}
  <section className="pro-activity-panel" aria-label="Live activity and Real Hustle">
   <div className="pro-current-activity"><small className="pro-caption">CURRENT ACTIVITY</small>{idle?<div className="pro-idle"><strong>At store</strong><span>Ready for a run</span></div>:taskActive?<button className="pro-task-control" onClick={onOpenTasks} aria-label="Open current task controls">{activity}</button>:activity}</div>
   <div className="pro-real-hustle"><small className="pro-caption">REAL HUSTLE</small><strong className={/^\d/.test(hustle.value)?undefined:"pro-unavailable"}>{hustle.value}</strong><span>{hustle.detail}</span></div>
   <div className="pro-finances">{stats}</div>
  </section>
  <section className="pro-primary-controls" aria-label="Delivery controls">{delivery}{action}</section>
  <section className="pro-hustle-panel" aria-label="Hustle timing">{timing}</section>
  <div className="pro-status">{isValidElement(health)?cloneElement(health as Element,{compact:true}):health}</div>
  <div className="pro-shift-actions">{shiftActions}</div>
  {remaining}
  <details className="pro-details"><summary>Shift details <span>Earnings, tasks & more</span><i aria-hidden="true" className="pro-details-chevron">⌄</i></summary><div className="pro-details-body">{heroSecondary}{runCounts}{deliverySecondary}{secondary}</div></details>
 </div>;
}
