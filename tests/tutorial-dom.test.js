'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const engine=require('../engine.js');

let hasTarget=false,highlighted=false,removed=0;
const listeners=[];
function addListener(source,type,handler){if(!listeners.some(x=>x.source===source&&x.type===type&&x.handler===handler))listeners.push({source,type,handler})}
function removeListener(source,type,handler){const index=listeners.findIndex(x=>x.source===source&&x.type===type&&x.handler===handler);if(index>=0)listeners.splice(index,1)}
const callbacks=[];
const target={classList:{add(){highlighted=true},remove(){highlighted=false}},matches(){return false}};
const card={innerHTML:'',addEventListener(){},querySelector(){return null}};
const overlay={innerHTML:'',querySelector(selector){return selector==='.tutorial-card'?card:null},remove(){removed++}};
const startButton={addEventListener(){}};
const document={
  body:{appendChild(){}},createElement(){return overlay},
  querySelector(selector){if(selector==='#tutorialStartBtn'||selector==='#tutorialHeaderBtn')return startButton;if(selector==='#game')return{classList:{contains(){return true}}};if(selector==='.player.you'&&hasTarget)return target;return null},
  querySelectorAll(selector){return selector==='.tutorial-highlight'&&highlighted?[target]:[]},
  addEventListener(type,handler){addListener('document',type,handler)},removeEventListener(type,handler){removeListener('document',type,handler)}
};
const context=vm.createContext({
  IslaEngine:engine,document,window:{addEventListener(type,handler){addListener('window',type,handler)},removeEventListener(type,handler){removeListener('window',type,handler)}},
  localStorage:{getItem(){return null}},SAVE_KEY:'islaTutorSaveV2',game:null,
  startGameInstance(instance){context.game=instance;context.IslaTutorial.sync()},
  requestAnimationFrame(fn){callbacks.push(fn);return callbacks.length},cancelAnimationFrame(){},
  cancelSession(){},resetToSetup(){},confirm(){return true},console
});
vm.runInContext(fs.readFileSync(require.resolve('../tutorial.js'),'utf8'),context);
vm.runInContext('IslaTutorial.start()',context);
assert(card.innerHTML.includes('NPCが行動中です'),'missing target shows a wait message');
assert.equal(highlighted,false);
hasTarget=true;vm.runInContext('IslaTutorial.sync()',context);
assert(card.innerHTML.includes('自分のボード'));
assert(!card.innerHTML.includes('NPCが行動中です'));
assert.equal(highlighted,true,'target is resolved after DOM creation');
vm.runInContext('IslaTutorial.cleanup()',context);
assert.equal(highlighted,false);assert.equal(removed,1);
assert.equal(listeners.length,0,'all global listeners are removed');
vm.runInContext('IslaTutorial.start()',context);
assert.equal(listeners.length,5,'restart registers one set of listeners');
vm.runInContext('IslaTutorial.cleanup()',context);
assert.equal(listeners.length,0);
for(const callback of callbacks)callback();
assert.equal(removed,2,'stale animation frames cannot recreate the tutorial');
console.log('tutorial DOM tests: all passed');
