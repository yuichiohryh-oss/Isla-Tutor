'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const engine=require('../engine.js');
const review=require('../review.js');

const values=new Map(),timeouts=[];let cleanupCount=0,failReview=false;
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{classList:{add(){},remove(){},toggle(){},contains(){return false}},open:false,close(){},showModal(){},querySelectorAll(selector){
  if(id!=='#decisionBody'||selector!=='[data-option]')return[];
  this.optionButtons=[...this.innerHTML.matchAll(/<button\b[^>]*data-option="(\d+)"[^>]*>/g)].map(([,index])=>({dataset:{option:index}}));
  return this.optionButtons;
}});return elements.get(id)}
const faceupElement=element('#faceupPlants');
function displayedFaceup(){const html=faceupElement.innerHTML||'';const tiles=[...html.matchAll(/<span class="faceup-plant" data-good="([^"]+)">([^<]+)<\/span>/g)];assert.equal((html.match(/class="faceup-plant"/g)||[]).length,tiles.length,'all tiles are inert spans');assert(!/data-tutorial-target|onclick|<button|<a\b/.test(html),'public tiles are read-only');return tiles.map(([,good,name])=>({good,name}))}
function assertFaceupMatches(state){const actual=displayedFaceup();assert.deepEqual(actual.map(x=>x.good),Array.from(state.faceup),'visible order and duplicates match faceup');assert.deepEqual(actual.map(x=>x.name),Array.from(state.faceup,g=>engine.GOODS[g].name),'tile labels use GOODS')}
const page=fs.readFileSync(require.resolve('../index.html'),'utf8');
assert(page.includes('id="faceupPlants"'),'production DOM has the required panel');
assert(page.indexOf('id="roles"')<page.indexOf('id="faceupPlants"')&&page.indexOf('id="faceupPlants"')<page.indexOf('id="market"')&&page.indexOf('id="market"')<page.indexOf('id="buildingMarket"'),'desktop left-column order is roles, farms, center, market');
const context=vm.createContext({
  IslaEngine:engine,
  IslaReview:review,
  window:{IslaTutorial:{active:false,cleanup(){cleanupCount++},sync(){},afterAction(){}}},
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

failReview=false;
vm.runInContext('start({count:3,difficulty:"easy",rng:()=>.2})',context);
let state=vm.runInContext('game.s',context);
assert.equal(state.pending.type,'role','new game is at role selection');
assert.equal(state.faceup.length,4);
assertFaceupMatches(state);
vm.runInContext('game.s.faceup=["indigo","indigo","sugar","coffee"];render()',context);
assertFaceupMatches(vm.runInContext('game.s',context));
assert.deepEqual(displayedFaceup().map(x=>x.good),['indigo','indigo','sugar','coffee'],'duplicate farms remain separate and ordered');
vm.runInContext('game.s.faceup=[];render()',context);
assert.equal(faceupElement.innerHTML,'<p class="faceup-plants-empty">公開農園はありません</p>');

vm.runInContext('start({count:3,difficulty:"easy",rng:()=>.2});act("role",{role:"settler"})',context);
state=vm.runInContext('game.s',context);
assert.equal(state.pending.type,'settler','settler phase pauses for human choice');
assertFaceupMatches(state);
const decision=element('#decisionBody');
assert.match(decision.innerHTML,/<button[^>]*data-tutorial-target="corn-choice"/,'tutorial target stays on a decision button');
assert(!faceupElement.innerHTML.includes('corn-choice'));
const chosen=state.pending.options.find(x=>x.kind==='plant'&&x.good==='corn');
assert(chosen,'deterministic game offers corn');
vm.runInContext('game.takeSettler(0,game.s.pending.options.find(x=>x.kind==="plant"&&x.good==="corn"),false);render()',context);
state=vm.runInContext('game.s',context);
assert.equal(state.faceup.length,3,'human acquisition removes one tile');
assertFaceupMatches(state);

vm.runInContext('start({count:3,difficulty:"easy",rng:()=>.2});act("role",{role:"settler"})',context);
const humanChoice=vm.runInContext('game.s.pending.options.find(x=>x.kind==="plant"&&x.good==="corn")',context);
const button=decision.optionButtons.find(b=>Number(b.dataset.option)===vm.runInContext('game.s.pending.options',context).indexOf(humanChoice));
assert.equal(typeof button.onclick,'function','decision button retains the acquisition handler');
button.onclick();
state=vm.runInContext('game.s',context);
assert(state.players[0].plants.some(x=>x.good==='corn'),'decision button obtains the chosen farm');
assert.equal(state.faceup.length,4,'settler phase replenishes after NPC turns');
assertFaceupMatches(state);
const savedFaceup=Array.from(state.faceup);
vm.runInContext('resetToSetup();resumeSavedGame()',context);
state=vm.runInContext('game.s',context);
assert.deepEqual(Array.from(state.faceup),savedFaceup,'resume keeps saved public farms');
assertFaceupMatches(state);

vm.runInContext('game=new Game({count:3,difficulty:"easy",rng:()=>.2});game.s.chooser=1;game.selectRole("settler");game.continue();render()',context);
state=vm.runInContext('game.s',context);
assert.equal(state.pending.type,'settler','NPC acts before the human pause');
assert.equal(state.faceup.length,2,'both NPCs acted before the human pause');
assertFaceupMatches(state);
vm.runInContext('act("settler",{choice:game.s.pending.options.find(x=>x.kind==="plant")})',context);
state=vm.runInContext('game.s',context);
assert.equal(state.faceup.length,4,'NPC completion reaches phase-end refill');
assertFaceupMatches(state);

const css=fs.readFileSync(require.resolve('../styles.css'),'utf8');
assert.match(css,/\.faceup-plants\s*\{[^}]*flex-wrap:wrap/,'tiles wrap at narrow widths');
assert.match(css,/@media\(max-width:760px\)\s*\{\.faceup-plants-panel\s*\{order:-1\}\}/,'mobile puts public farms before roles in the left column');
console.log('app tests: all passed');
