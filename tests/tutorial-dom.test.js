'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const engine=require('../engine.js');

const documentListeners=[],windowListeners=[],frames=[],targets=new Map();
let removed=0,cancelledSessions=0,scheduled=0,resets=0,saveValue=null,reviewRestored=0,partialStarted=0;
const document={activeElement:null};
function classList(){
  const values=new Set();
  return{add(...names){names.forEach(x=>values.add(x))},remove(...names){names.forEach(x=>values.delete(x))},contains(name){return values.has(name)},toggle(name,on){if(on)values.add(name);else values.delete(name)}};
}
function element({button=false,parent=null}={}){
  const attrs=new Map();
  return{parent,classList:classList(),style:{cssText:'',display:''},
    setAttribute(name,value){attrs.set(name,value)},removeAttribute(name){attrs.delete(name)},getAttribute(name){return attrs.get(name)||null},
    contains(other){for(let x=other;x;x=x.parent)if(x===this)return true;return false},
    matches(selector){return button&&selector==='button:not(:disabled)'},
    closest(selector){return selector==='[data-tutorial-action]'&&this.dataset?.tutorialAction?this:null},
    focus(){document.activeElement=this;dispatch('focusin',this)},
    getBoundingClientRect(){return{left:40,top:150,right:200,bottom:195,width:160,height:45}},scrollIntoView(){}
  };
}
function register(list,type,handler){list.push({type,handler})}
function unregister(list,type,handler){const i=list.findIndex(x=>x.type===type&&x.handler===handler);if(i>=0)list.splice(i,1)}
function dispatch(type,target,key='',shiftKey=false){
  const event={target,key,shiftKey,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){this.stopped=true}};
  for(const item of [...documentListeners])if(item.type===type){item.handler(event);if(event.stopped)break}
  if(type==='click'&&!event.stopped&&card.contains(target))card.clickHandler?.(event);
  return event;
}
function flushFrames(){while(frames.length)frames.shift()()}
function targetFor(selector,button=false){const node=element({button});targets.set(selector,node);return node}

const card=element();card.buttons=new Map();
Object.defineProperty(card,'innerHTML',{get(){return this.html||''},set(html){this.html=html;this.buttons=new Map();for(const match of html.matchAll(/<button[^>]*data-tutorial-action="([^"]+)"[^>]*>/g)){const button=element({button:true,parent:this});button.dataset={tutorialAction:match[1]};this.buttons.set(match[1],button)}}});
card.querySelector=selector=>{for(const name of ['continue','confirm-exit','next','finish','exit'])if(selector.includes(`data-tutorial-action="${name}"`)&&card.buttons.has(name))return card.buttons.get(name);return null};
card.querySelectorAll=selector=>selector==='button:not(:disabled)'?[...card.buttons.values()]:[];
card.addEventListener=(type,handler)=>{if(type==='click')card.clickHandler=handler};
const frame=element(),shades=Array.from({length:4},()=>element()),overlay=element();
card.parent=overlay;frame.parent=overlay;shades.forEach(x=>x.parent=overlay);
overlay.querySelector=selector=>selector==='.tutorial-card'?card:selector==='.tutorial-frame'?frame:card.querySelector(selector);
overlay.querySelectorAll=selector=>selector==='.tutorial-shade'?shades:[];
overlay.remove=()=>removed++;
const startButton=element({button:true});startButton.addEventListener=()=>{};
document.body={appendChild(){}};document.createElement=()=>{overlay.classList.remove('tutorial-confirm-open');card.setAttribute('role','dialog');card.removeAttribute('aria-modal');card.setAttribute('aria-live','polite');return overlay};
document.querySelector=selector=>selector==='#tutorialStartBtn'||selector==='#tutorialHeaderBtn'?startButton:selector==='#game'?{classList:{contains(){return true}}}:targets.get(selector)||null;
document.querySelectorAll=selector=>selector==='.tutorial-highlight'?[...targets.values()].filter(x=>x.classList.contains('tutorial-highlight')):[];
document.addEventListener=(type,handler)=>register(documentListeners,type,handler);
document.removeEventListener=(type,handler)=>unregister(documentListeners,type,handler);
const window={innerWidth:1280,innerHeight:800,addEventListener(type,handler){register(windowListeners,type,handler)},removeEventListener(type,handler){unregister(windowListeners,type,handler)}};
const context=vm.createContext({
  IslaEngine:engine,document,window,localStorage:{getItem(){return saveValue}},SAVE_KEY:'islaTutorSaveV2',game:null,
  startGameInstance(instance){context.game=instance;instance.continue();context.IslaTutorial.sync()},
  restoreReviewForGame(){reviewRestored++},beginPartialReviewForGame(){partialStarted++},
  requestAnimationFrame(fn){frames.push(fn);return frames.length},cancelAnimationFrame(){},
  cancelSession(){cancelledSessions++},schedule(){scheduled++},advance(){},resetToSetup(){resets++},showGame(){},render(){},save(){},confirm(){return true},console
});
vm.runInContext(fs.readFileSync(require.resolve('../tutorial.js'),'utf8'),context);
const tutorial=context.IslaTutorial;
function clickAction(name){const button=card.buttons.get(name);assert(button,`missing ${name}`);return dispatch('click',button)}
function enterAction(type,payload){assert(tutorial.allowsAction(type,payload),`allowed ${tutorial.stage}/${type}`);const before=tutorial.beforeAction();context.game.dispatch(type,payload);tutorial.afterAction(type,payload,before);tutorial.sync();flushFrames()}
function next(){clickAction('next');flushFrames()}
function openConfirm(){clickAction('exit');flushFrames();assert.equal(card.getAttribute('role'),'alertdialog');assert.equal(card.getAttribute('aria-modal'),'true');assert.equal(document.activeElement,card.buttons.get('continue'))}
function continueLesson(){clickAction('continue');flushFrames();assert.equal(card.getAttribute('role'),'dialog');assert.equal(card.getAttribute('aria-modal'),null);assert.equal(card.getAttribute('aria-live'),'polite')}

tutorial.start();flushFrames();
assert(card.innerHTML.includes('NPCが行動中です'));
assert(card.innerHTML.includes('ステップ 1/20 ・ 説明'));
assert(card.innerHTML.includes('下のボタンで進んでください'));
assert(card.innerHTML.includes('次へ：役職の仕組み'));
assert(card.innerHTML.includes('</div><div class="tutorial-exit">'),'exit is outside the primary action row');
assert.equal(document.activeElement,card.buttons.get('next'));
const board=targetFor('.player.you');tutorial.sync();flushFrames();
assert(board.classList.contains('tutorial-info-highlight'));
assert(!board.classList.contains('tutorial-action-highlight'));
assert(frame.classList.contains('tutorial-frame-info'));
assert.equal(document.activeElement,card.buttons.get('next'));
assert.equal(dispatch('click',board).defaultPrevented,true,'info target does not advance');
assert.equal(tutorial.stage,'board');
openConfirm();assert(!board.classList.contains('tutorial-highlight'));continueLesson();
assert(board.classList.contains('tutorial-info-highlight'));
assert.equal(frame.style.display,'block');
assert.equal(document.activeElement,card.buttons.get('next'));
const roles=targetFor('#roles');next();assert.equal(tutorial.stage,'roles');assert(roles.classList.contains('tutorial-info-highlight'));
const settler=targetFor('[data-role="settler"]',true);next();
assert.equal(tutorial.stage,'settler-role');assert(card.innerHTML.includes('操作してください'));
assert(card.innerHTML.includes('画面の黄色く光っている場所を操作してください'));
assert(!card.buttons.has('next'));assert(settler.classList.contains('tutorial-action-highlight'));
assert(frame.classList.contains('tutorial-frame-action'));assert.equal(document.activeElement,settler);
assert.equal(dispatch('click',roles).defaultPrevented,true,'non-target game click is blocked');

const replacement=targetFor('[data-role="settler"]',true);tutorial.sync();flushFrames();
assert(!settler.classList.contains('tutorial-highlight'));
assert(replacement.classList.contains('tutorial-action-highlight'));
assert.equal(document.activeElement,replacement);
const beforeState=JSON.stringify(context.game.s),beforeStage=tutorial.stage,beforeMilestones=JSON.stringify(tutorial.milestones);
const sessionCount=cancelledSessions,scheduleCount=scheduled;
openConfirm();
assert.equal(replacement.classList.contains('tutorial-highlight'),false);
assert.equal(frame.style.display,'none');assert(overlay.classList.contains('tutorial-confirm-open'));
assert.equal(tutorial.active,true,'the first click cannot abort');
assert.equal(tutorial.allowsAction('role',{role:'settler'}),false);
assert.equal(tutorial.allowsStaffChange('plant',0,1),false);
for(const type of ['pointerdown','touchstart','click'])assert.equal(dispatch(type,replacement).defaultPrevented,true,`${type} target blocked`);
for(const type of ['pointerdown','click'])assert.equal(dispatch(type,startButton).defaultPrevented,true,`${type} header blocked`);
assert.equal(dispatch('keydown',startButton,'Enter').defaultPrevented,true);
startButton.focus();assert.equal(document.activeElement,card.buttons.get('continue'),'focus cannot leave confirmation');
const confirmButtons=[...card.buttons.values()];
assert.equal(dispatch('keydown',confirmButtons.at(-1),'Tab').defaultPrevented,true);
assert.equal(document.activeElement,confirmButtons[0]);
assert.equal(dispatch('keydown',confirmButtons[0],'Tab',true).defaultPrevented,true);
assert.equal(document.activeElement,confirmButtons.at(-1));
continueLesson();
assert.equal(tutorial.stage,beforeStage);assert.equal(JSON.stringify(tutorial.milestones),beforeMilestones);
assert.equal(JSON.stringify(context.game.s),beforeState);
assert.equal(cancelledSessions,sessionCount);assert.equal(scheduled,scheduleCount);
assert(replacement.classList.contains('tutorial-action-highlight'));
assert.equal(document.activeElement,replacement);
openConfirm();assert.equal(dispatch('keydown',card.buttons.get('continue'),'Escape').defaultPrevented,true);flushFrames();
assert.equal(card.getAttribute('role'),'dialog');assert.equal(tutorial.active,true);assert.equal(document.activeElement,replacement);

const corn=targetFor('[data-tutorial-target="corn-choice"]',true);
enterAction('role',{role:'settler'});assert.equal(tutorial.stage,'corn');assert.equal(document.activeElement,corn);
const cornChoice=context.game.s.pending.options.find(x=>x.good==='corn');
targetFor('#buildingMarket');enterAction('settler',{choice:cornChoice});next();
const builder=targetFor('[data-tutorial-target="indigo-factory"]',true);tutorial.sync();flushFrames();assert.equal(document.activeElement,builder);
const staffIndigo=targetFor('[data-staff][data-kind="plant"][data-index="0"][data-delta="1"]',true);
enterAction('builder',{id:'sm_indigo'});assert.equal(tutorial.stage,'staff-indigo');assert.equal(document.activeElement,staffIndigo);
assert.equal(tutorial.allowsStaffChange('plant',0,1),true);
openConfirm();assert.equal(tutorial.allowsStaffChange('plant',0,1),false);continueLesson();
assert.equal(tutorial.allowsStaffChange('plant',0,1),true);
const me=context.game.s.players[0];
const staffCorn=targetFor('[data-staff][data-kind="plant"][data-index="1"][data-delta="1"]',true);
me.plants[0].worker=1;me.sanjuan--;tutorial.sync();flushFrames();assert.equal(document.activeElement,staffCorn);
const staffBuilding=targetFor('[data-staff][data-kind="building"][data-index="0"][data-delta="1"]',true);
me.plants[1].worker=1;me.sanjuan--;tutorial.sync();flushFrames();assert.equal(document.activeElement,staffBuilding);
const staffDone=targetFor('#staffDone',true);
me.buildings[0].workers=1;me.sanjuan--;tutorial.sync();flushFrames();assert.equal(document.activeElement,staffDone);
targetFor('[data-produce="1"]',true);enterAction('staff',{plants:[1,1],buildings:[1]});
targetFor('.player.you .goods-row');enterAction('craftsmanProduce',{produce:true});
targetFor('#market');next();next();
targetFor('[data-tutorial-target="indigo-sale"]',true);tutorial.sync();flushFrames();
targetFor('.player.you [data-stat="money"]');enterAction('trader',{good:'indigo'});next();
targetFor('[data-role="captain"]',true);tutorial.sync();flushFrames();enterAction('role',{role:'captain'});
targetFor('#ships');next();
targetFor('[data-tutorial-target="corn-shipment"]',true);tutorial.sync();flushFrames();
const shipment=context.game.s.pending.options.find(x=>x.kind==='ship'&&x.good==='corn'&&x.ship===0);
targetFor('[data-captain-bonus="1"]',true);enterAction('captain',{choice:shipment});
targetFor('.player.you [data-stat="vp"]');enterAction('captainPrivilege',{use:true});
assert.equal(tutorial.stage,'complete');assert(card.innerHTML.includes('完了'));
assert(card.buttons.has('finish'));assert(!card.buttons.has('exit'));
assert.equal(document.activeElement,card.buttons.get('finish'));
clickAction('finish');flushFrames();assert.equal(tutorial.active,false);assert.equal(removed,1);
assert.equal(partialStarted,1,'tutorial promotion starts a partial review after the lesson');
assert.equal(documentListeners.length,0);assert.equal(windowListeners.length,0);assert.equal(resets,0);

saveValue=JSON.stringify(new engine.Game({count:3,rng:()=>.2}).s);
targetFor('.player.you');tutorial.start();flushFrames();
assert.equal(documentListeners.length,5);assert.equal(windowListeners.length,2);
openConfirm();clickAction('confirm-exit');flushFrames();
assert.equal(tutorial.active,false);assert.equal(removed,2);
assert.equal(documentListeners.length,0);assert.equal(windowListeners.length,0);
assert.equal(JSON.stringify(context.game.s),saveValue,'abort restores the previous save');
assert.equal(reviewRestored,1,'abort reconnects the saved review');
tutorial.start();flushFrames();assert.equal(card.getAttribute('role'),'dialog');assert(!overlay.classList.contains('tutorial-confirm-open'));
openConfirm();tutorial.cleanup();flushFrames();assert.equal(documentListeners.length,0);assert.equal(windowListeners.length,0);
assert(!board.classList.contains('tutorial-highlight'));
saveValue=null;tutorial.start();flushFrames();openConfirm();clickAction('confirm-exit');flushFrames();
assert.equal(resets,1,'abort without an existing save returns to setup');
assert.equal(documentListeners.length,0);assert.equal(windowListeners.length,0);
console.log('tutorial DOM tests: all passed');
