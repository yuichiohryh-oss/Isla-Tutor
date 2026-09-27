'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const engine=require('../engine.js');
const review=require('../review.js');

const values=new Map(),timeouts=[];let cleanupCount=0,failReview=false;
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{classList:{add(){},remove(){},toggle(){},contains(){return false}},open:false,close(){},showModal(){},querySelectorAll(){return[]}});return elements.get(id)}
const context=vm.createContext({
  IslaEngine:engine,
  IslaReview:review,
  window:{IslaTutorial:{active:false,cleanup(){cleanupCount++}}},
  document:{querySelector:element,querySelectorAll(){return[]}},
  localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>{if(failReview&&key===review.KEY)throw Error('review storage full');values.set(key,value)},removeItem:key=>values.delete(key)},
  setTimeout:fn=>{timeouts.push(fn);return timeouts.length},clearTimeout(){},console:{log:console.log,error:console.error,warn(){}},alert(){},confirm(){return true},
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
vm.runInContext('game=new Game({count:3,rng:()=>.2});beginPartialReviewForGame(game);save()',context);
const saved=values.get('islaTutorSaveV2');
assert(values.has(review.KEY),'review checkpoint uses a separate key');
assert.equal(review.loadForSave(saved,context.localStorage).partial,true);
failReview=true;
vm.runInContext('game.s.round=2;save()',context);
assert(values.get('islaTutorSaveV2').includes('"round":2'),'review write failure keeps new game save');
assert.equal(review.loadForSave(values.get('islaTutorSaveV2'),context.localStorage).partial,true,'stale checkpoint falls back to partial');
context.sampleReport={partial:false,limited:false,summary:'<img src=x onerror=1>',title:'<script>',axes:{self:'<b>',opponentImpact:'小さい',opponentPlay:'標準的',luck:'中立'},points:[],good:[{round:1,actorName:'<img>',type:'role',chosenLabel:'<script>',alternativeLabel:'船長',quality:'good',shortEvidence:'<svg>'}],improve:[],npcMistakes:[],next:[],npcCount:0};
const html=vm.runInContext('renderReview(sampleReport)',context);
assert(html.includes('&lt;script&gt;')&&!html.includes('<script>'),'review HTML escapes stored strings');
context.sampleReport.partial=true;context.sampleReport.limited=true;context.sampleReport.partialReason='チュートリアル終了後の自由プレイ部分を中心に講評しています。';
const partialHtml=vm.runInContext('renderReview(sampleReport)',context);
assert(partialHtml.includes('チュートリアル終了後')&&partialHtml.includes('簡易講評'),'partial origin and limited data are both disclosed');
vm.runInContext('game.s.phase="end";game.s.result=game.resultRows();renderEnd()',context);
const ending=element('#endBody').innerHTML;
assert(ending.includes('今回のプレイ講評')&&ending.includes('相手のゲーム全体のプレイ水準'));
assert(ending.includes('新しいゲーム')&&ending.includes('score-table'));
console.log('app tests: all passed');
