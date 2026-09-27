'use strict';
const assert=require('assert');
const {Game,BUILDINGS}=require('../engine.js');
const review=require('../review.js');

function seeded(seed){let x=seed>>>0,calls=0;return{next(){calls++;x=(x*1664525+1013904223)>>>0;return x/4294967296},get calls(){return calls}}}
function answer(g){
  const p=g.s.pending;if(!p)return;
  if(p.type==='role')g.dispatch('role',{role:g.aiRole(0)});
  else if(p.type==='mayorBonus')g.dispatch(p.type,{take:true});
  else if(['hacienda','hospice','university','harbor','captainPrivilege'].includes(p.type))g.dispatch(p.type,{use:p.type!=='hacienda'});
  else if(p.type==='settler')g.dispatch(p.type,{choice:p.options[0]||null});
  else if(p.type==='staff'){g.autoStaff(0);const me=g.s.players[0];g.dispatch(p.type,{plants:me.plants.map(x=>x.worker),buildings:me.buildings.map(x=>x.workers)})}
  else if(p.type==='builder')g.dispatch(p.type,{id:p.options[0]?.id||null});
  else if(p.type==='craftsmanProduce')g.dispatch(p.type,{produce:true});
  else if(p.type==='craftsmanBonus')g.dispatch(p.type,{good:p.options[0]});
  else if(p.type==='trader')g.dispatch(p.type,{good:p.options[0]||null});
  else if(p.type==='captain')g.dispatch(p.type,{choice:p.options[0]||null});
  else if(p.type==='storage')g.dispatch(p.type,g.aiStorage(0,p.types,p.warehouseSlots));
  else throw Error('unexpected pending '+p.type);
}
function play(seed,observe){
  const random=seeded(seed),events=[],chances=[],opts={count:3,difficulty:'easy',rng:()=>random.next()};
  if(observe){opts.decisionObserver=x=>{events.push(JSON.parse(JSON.stringify(x)));x.before.players[0].money=999999;x.candidates.length=0;return 'ignored'};opts.chanceObserver=x=>{chances.push(JSON.parse(JSON.stringify(x)));x.remainingBefore.corn=999999;throw Error('ignored chance error')}}
  const g=new Game(opts);let guard=0;
  while(g.s.phase!=='end'&&guard++<1000){g.continue();answer(g)}
  assert.equal(g.s.phase,'end');
  return{state:g.s,calls:random.calls,events,chances};
}
const plain=play(27,false),observed=play(27,true);
assert.deepStrictEqual(observed.state,plain.state,'observers must not change game state or NPC choices');
assert.equal(observed.calls,plain.calls,'observers must not consume RNG');
assert(observed.events.some(e=>e.human&&e.type==='role'));
assert(observed.events.some(e=>!e.human&&e.type==='role'));
assert(observed.events.some(e=>e.type==='settler'));
assert(observed.chances.length>0);
assert(observed.chances.every(e=>!('plantDeck' in e)&&!('plantDeck' in (e.before||{}))));
assert(!JSON.stringify(observed.state).includes('_decisionObserver'));
assert.equal(observed.state.schema,2);
{
  const s=review.createSession(),observer=review.tracker(s),random=seeded(27);
  const g=new Game({count:3,difficulty:'easy',rng:()=>random.next(),decisionObserver:observer.decision,chanceObserver:observer.chance});
  let guard=0;while(g.s.phase!=='end'&&guard++<1000){g.continue();answer(g)}
  assert.equal(g.s.phase,'end');
  assert(s.decisions.length>10,'live evaluation retains compact decisions');
  assert(s.chanceEvents.length>0);
  const report=review.buildReport(s,g.s);
  assert(report.summary&&report.points.length>0&&report.axes.self);
  assert(report.good.length<=3&&report.improve.length<=3&&report.npcMistakes.length<=3);
  assert(!JSON.stringify(s).includes('plantDeck'),'review history does not persist full game snapshots');
}

{
  const decisions=[],g=new Game({count:3,rng:()=>.2,decisionObserver:e=>decisions.push(e)});
  g.continue();const before=JSON.parse(JSON.stringify(g.s));
  const original=g.continue;
  g.continue=function(){original.call(this);throw Error('after processing')};
  assert.throws(()=>g.dispatch('role',{role:'settler'}),/after processing/);
  assert.deepStrictEqual(g.s,before,'dispatch rollback restores state');
  assert.equal(decisions.length,0,'rollback discards captured human and NPC decisions');
}
{
  const decisions=[],g=new Game({count:3,rng:()=>.2,decisionObserver:e=>decisions.push(e)});
  g.s.chooser=1;const original=g.selectRole;
  g.selectRole=function(role){original.call(this,role);throw Error('NPC failed')};
  assert.throws(()=>g.continue(),/NPC failed/);
  assert.equal(decisions.length,0,'failed standalone continue emits no NPC decision');
}
{
  const decisions=[],g=new Game({count:3,rng:()=>.2,decisionObserver:e=>decisions.push(e)});
  g.continue();
  const beforeMoney=g.s.players[0].money;
  g.dispatch('role',{role:'settler'});
  assert.equal(decisions[0].before.players[0].money,beforeMoney);
  assert(!decisions[0].before.plantDeck,'decision context excludes hidden future deck');
  const choice=g.s.pending.options[0];
  g.dispatch('settler',{choice});
  assert(decisions.some(e=>e.type==='settler'&&e.human));
  const npc=g.s.players[1];npc.money=20;
  g.buyBuilding(1,'sm_indigo',false);
  npc.goods.corn=2;g.s.goodsSupply.corn-=2;
  g.sell(1,'corn',false);
  g.s.currentChooser=1;g.s.ctx={captainBonus:{},captainPrivilegeResolved:{}};
  const shipment=g.publicShipments(1)[0];g.ship(1,shipment);
  assert(['builder','trader','captain'].every(type=>decisions.some(e=>e.type===type&&e.actor===1)), 'all remaining MVP actions are observed');
  for(const type of ['role','settler','builder','trader','captain'])assert(review.evaluateDecision(decisions.find(e=>e.type===type)),'evaluator accepts '+type+' observer event');
}
{
  const g=new Game({count:3,rng:()=>.4}),base=g.reviewState(),e={round:1,actor:0,name:'あなた',human:true,type:'role',before:base,candidates:['settler'],chosen:'settler'};
  assert.equal(review.evaluateDecision(e).meaningful,false,'one legal candidate is not skill evidence');
  e.candidates=['settler','settler'];
  assert.equal(review.evaluateDecision(e).meaningful,false,'equal scores are not a mistake');
  const good=review.evaluateDecision({...e,candidates:['captain','prospector'],chosen:'captain'});
  assert(['good','acceptable'].includes(good.quality));
  const weak=review.evaluateDecision({...e,candidates:['captain','prospector'],chosen:'prospector'});
  assert(['improvement','major_mistake','acceptable'].includes(weak.quality));
  assert(weak.normalizedRegret>=good.normalizedRegret);
  const shipping={...e,type:'captain',before:{...base,currentChooser:0,captainPrivilegeResolved:{}},candidates:[{kind:'ship',good:'corn',ship:0,qty:5},{kind:'ship',good:'coffee',ship:1,qty:1}],chosen:{kind:'ship',good:'coffee',ship:1,qty:1}};
  assert.equal(review.evaluateDecision(shipping).quality,'major_mistake','large high-confidence shipping gap can be major');
  assert.equal(review.evaluateDecision({...shipping,candidates:[shipping.chosen]}).meaningful,false);
  const normalized=review.scoreAggregate([{quality:'good',confidence:'high',meaningful:true,gap:100},{quality:'major_mistake',confidence:'high',meaningful:true,gap:.1}]);
  assert.equal(normalized.score,.5,'raw gaps from different decision types are not averaged');
  const clearRole=JSON.parse(JSON.stringify(base));clearRole.players[0].goods.corn=5;
  const poorRole=review.evaluateDecision({...e,before:clearRole,candidates:['captain','prospector'],chosen:'prospector'});
  assert.equal(poorRole.quality,'improvement','an intentionally weak role choice stays an improvement regardless of the final result');
}
{
  const s=review.createSession();
  const e={kind:'plantReveal',round:1,revealed:'coffee',remainingBefore:{corn:1,indigo:1,sugar:1,tobacco:1,coffee:1},human:{plants:[{good:'coffee',worker:0}],buildings:[{kind:'production',good:'coffee',slots:2}],goods:{}}};
  assert(review.observeChance(s,e));
  assert.deepEqual(s.chanceEvents[0].remainingBefore,e.remainingBefore);
  assert.equal(review.luckLabel(s.chanceEvents),'判定材料が少ない');
  assert.equal(review.luckLabel([]),'判定材料が少ない');
}
{
  const rows=[
    {index:0,name:'あなた',shipping:10,building:10,bonus:5,total:25,tie:3},
    {index:2,name:'NPC ベル',shipping:15,building:8,bonus:1,total:24,tie:2},
    {index:1,name:'NPC アナ',shipping:8,building:8,bonus:2,total:18,tie:1}
  ];
  assert.equal(review.comparison(rows).opponent.index,2,'sole human winner compares with runner-up');
  const losing=[{...rows[2],total:30},{...rows[1],total:17},{...rows[0],total:15}];
  assert.equal(review.comparison(losing).opponent.index,1,'loss compares with winner');
  const tied=[{...rows[0]},{...rows[1],total:25,tie:3},{...rows[2]}];
  assert.equal(review.comparison(tied).outcome,'tie');
  assert.equal(review.comparison(tied).opponent.index,2);
  const npcBad={round:2,actor:2,actorName:'NPC ベル',human:false,type:'captain',chosenLabel:'コーヒーを1個出荷',alternativeLabel:'トウモロコシを5個出荷',quality:'major_mistake',normalizedRegret:1,confidence:'high',meaningful:true,shortEvidence:'出荷数量に大きな差'};
  const npcSession=review.createSession();npcSession.decisions=[npcBad,...Array.from({length:5},(_,i)=>({...npcBad,round:i+3,quality:'good',normalizedRegret:0}))];
  const npcReport=review.buildReport(npcSession,{result:rows});
  assert.equal(npcReport.npcMistakes.length,1,'one concrete NPC mistake is shown');
  assert.notEqual(npcReport.axes.opponentPlay,'ミス多め','one mistake does not make overall play weak');
  assert.equal(npcReport.axes.luck,'判定材料が少ない','NPC errors are not counted as luck');
  const s=review.createSession();
  s.decisions=Array.from({length:3},(_,i)=>({round:i+1,actor:0,actorName:'あなた',human:true,type:'role',chosenLabel:'開拓者',alternativeLabel:'船長',quality:'improvement',normalizedRegret:.8,confidence:'medium',meaningful:true,shortEvidence:'選択前の情報'}));
  const win=review.buildReport(s,{result:rows});
  assert.equal(win.title,'勝てたポイント');
  assert(!win.summary.includes('内容の良い勝利'));
  assert(win.points[0].includes('NPC ベル'));
  assert.equal(review.opponentLevel([{...s.decisions[0],human:false}]),'判断材料が少ない');
  assert.equal(review.opponentLevel(Array.from({length:6},()=>({...s.decisions[0],human:false}))), 'ミス多め');
  s.decisions=s.decisions.map(d=>({...d,quality:'good',normalizedRegret:0}));
  const lose=review.buildReport(s,{result:losing});
  assert(lose.summary.includes('内容は悪くありません'));
  assert.equal(lose.title,'負けたポイント');
  assert.equal(review.buildReport(s,{result:tied}).title,'勝ち切れなかったポイント');
  assert.equal(review.buildReport(null,{result:rows}).limited,true,'end-state old save receives a simple report');
}
{
  const store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  const raw=JSON.stringify(new Game({count:3,rng:()=>.3}).s),s=review.createSession();
  s.decisions=[{round:1,actor:0,actorName:'あなた',human:true,type:'role',chosenLabel:'船長',alternativeLabel:'開拓者',quality:'good',normalizedRegret:0,confidence:'medium',meaningful:true,shortEvidence:'test'}];
  review.persistForSave(raw,s,storage);
  assert.deepEqual(review.loadForSave(raw,storage),s);
  assert.equal(review.loadForSave(raw+' ',storage).partial,true);
  store.set(review.KEY,'{broken');
  assert.equal(review.loadForSave(raw,storage).partial,true,'corrupt review does not affect the game save');
  store.delete(review.KEY);
  assert.equal(review.loadForSave(raw,storage).partial,true,'old v2 save resumes with partial review');
  for(let i=0;i<300;i++)review.observeDecision(s,{type:'role',round:i+2,actor:0,name:'あなた',human:true,candidates:['prospector'],chosen:'prospector',before:new Game({count:3,rng:()=>.3}).reviewState()});
  assert(s.decisions.length<=240);
}
console.log('review tests: all passed');
