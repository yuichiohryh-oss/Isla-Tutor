'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const engine=require('../engine.js');

const values=new Map(),timeouts=[];let cleanupCount=0;
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{classList:{add(){},remove(){},toggle(){},contains(){return false}},open:false,close(){},showModal(){},querySelectorAll(){return[]}});return elements.get(id)}
const context=vm.createContext({
  IslaEngine:engine,
  window:{IslaTutorial:{active:false,cleanup(){cleanupCount++}}},
  document:{querySelector:element,querySelectorAll(){return[]}},
  localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
  setTimeout:fn=>{timeouts.push(fn);return timeouts.length},clearTimeout(){},console,alert(){},confirm(){return true},
});
vm.runInContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);
vm.runInContext('game={s:{schema:2,tag:"normal"}};save()',context);
const normalSave=values.get('islaTutorSaveV2');assert(normalSave.includes('normal'));
context.window.IslaTutorial.active=true;
vm.runInContext('game.s.tag="tutorial";save()',context);
assert.equal(values.get('islaTutorSaveV2'),normalSave,'tutorial actions never write the normal save');
context.window.IslaTutorial.active=false;
let fired=0;context.hit=()=>fired++;
vm.runInContext('schedule(hit,1)',context);const stale=timeouts.at(-1);
vm.runInContext('cancelSession()',context);stale();assert.equal(fired,0,'cancelled session callback cannot fire');
vm.runInContext('schedule(hit,1)',context);const wrongGame=timeouts.at(-1);
vm.runInContext('game={s:{schema:2,tag:"replacement"}}',context);wrongGame();assert.equal(fired,0,'old game callback cannot act on a replacement');
vm.runInContext('resetToSetup()',context);
assert.equal(cleanupCount,1);assert.equal(values.get('islaTutorSaveV2'),normalSave,'reset preserves the normal save');
console.log('app tests: all passed');
