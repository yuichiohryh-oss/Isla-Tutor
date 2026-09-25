'use strict';
const assert=require('assert');
const {Game,BUILDINGS,GKEYS,active,allColonists}=require('../engine.js');
const def=id=>JSON.parse(JSON.stringify(BUILDINGS.find(b=>b.id===id)));
function addBuilding(p,id,workers=1){const b=def(id);b.workers=workers;p.buildings.push(b);return b}
function goodsTotal(g){return GKEYS.map(k=>g.s.goodsSupply[k]+g.s.players.reduce((n,p)=>n+p.goods[k],0)+g.s.trade.filter(x=>x===k).length+g.s.ships.filter(x=>x.good===k).reduce((n,x)=>n+x.qty,0))}
function colonistTotal(g){return g.s.colonistReserve+g.s.colonistShip+g.s.players.reduce((n,p)=>n+allColonists(p),0)}
function answer(g){const p=g.s.pending;if(!p)return;if(p.type==='role')g.dispatch('role',{role:g.aiRole(0)});else if(p.type==='mayorBonus')g.dispatch('mayorBonus',{take:true});else if(p.type==='hacienda')g.dispatch('hacienda',{use:false});else if(p.type==='hospice'||p.type==='university')g.dispatch(p.type,{use:true});else if(p.type==='settler')g.dispatch('settler',{choice:p.options[0]||null});else if(p.type==='staff'){g.autoStaff(0);const me=g.s.players[0];g.dispatch('staff',{plants:me.plants.map(x=>x.worker),buildings:me.buildings.map(x=>x.workers)})}else if(p.type==='builder')g.dispatch('builder',{id:p.options[0]?.id||null});else if(p.type==='craftsmanProduce')g.dispatch('craftsmanProduce',{produce:true});else if(p.type==='craftsmanBonus')g.dispatch('craftsmanBonus',{good:p.options[0]});else if(p.type==='trader')g.dispatch('trader',{good:p.options[0]||null});else if(p.type==='captain')g.dispatch('captain',{choice:p.options[0]||null});else if(p.type==='captainPrivilege')g.dispatch('captainPrivilege',{use:true});else if(p.type==='harbor')g.dispatch('harbor',{use:true});else if(p.type==='storage')g.dispatch('storage',g.aiStorage(0,p.types,p.warehouseSlots));else throw Error('unknown pending '+p.type)}
function run(g,max=10000){let n=0;while(g.s.phase!=='end'&&n++<max){g.continue();answer(g)}assert.equal(g.s.phase,'end','game must finish');return n}
function runWithRestore(g,rng,max=10000){let n=0;while(g.s.phase!=='end'&&n++<max){g.continue();g=Game.restore(g.s,{rng});answer(g)}assert.equal(g.s.phase,'end','restored game must finish');return g}
function seeded(seed){let x=seed>>>0;return()=>((x=(x*1664525+1013904223)>>>0)/4294967296)}

for(const count of [2,3,4]){const g=new Game({count,rng:()=>.4});const starts=g.s.players.map(p=>p.plants[0].good);assert.deepEqual(g.s.roles,count===2?['settler','mayor','builder','craftsman','trader','captain','prospector']:count===3?['settler','mayor','builder','craftsman','trader','captain']:['settler','mayor','builder','craftsman','trader','captain','prospector']);assert.deepEqual(starts,count===2?['indigo','corn']:count===3?['indigo','indigo','corn']:['indigo','indigo','corn','corn']);assert(g.s.players.every(p=>p.plants[0].worker===0));assert.equal(g.s.colonistReserve,count===2?40:count===3?55:75);assert.equal(colonistTotal(g),(count===2?40:count===3?55:75)+count)}
{
 const g=new Game({count:3});assert.equal(g.s.expansion,'none');assert.throws(()=>new Game({count:3,expansion:'new_buildings'}),/準備中/);const legacy=JSON.parse(JSON.stringify(g.s));delete legacy.expansion;assert.equal(Game.restore(legacy).s.expansion,'none')
}
{
 const g=new Game({count:2,rng:()=>.3});assert.equal(g.s.buildingSupply.small_market,1);assert.equal(g.s.buildingSupply.sm_indigo,2);assert.deepEqual(goodsTotal(g),[8,9,9,7,7]);assert.equal(g.s.quarries,5);assert.equal(g.s.pickLimit,6)
}
{
 const g=new Game({count:3});g.s.currentChooser=0;g.startMayor();assert.equal(g.s.pending.type,'mayorBonus');g.dispatch('mayorBonus',{take:true});assert.equal(colonistTotal(g),58);assert.deepEqual(g.s.players.map(p=>allColonists(p)),[2,1,1])
}
{
 const g=new Game({count:3}),p=g.s.players[0];p.goods.coffee=1;g.s.goodsSupply.coffee--;addBuilding(p,'small_market');addBuilding(p,'large_market');const before=p.money;g.s.currentChooser=1;g.sell(0,'coffee',false);assert.equal(p.money-before,7);assert.equal(g.s.goodsSupply.coffee,8,'sold good stays in trading house');assert.equal(g.s.trade[0],'coffee')
}
{
 const g=new Game({count:3}),p=g.s.players[0];p.goods.corn=4;p.goods.coffee=3;g.s.goodsSupply.corn-=4;g.s.goodsSupply.coffee-=3;addBuilding(p,'large_wh');g.store(0,{protectedTypes:['corn'],loose:'coffee'});assert.equal(p.goods.corn,4);assert.equal(p.goods.coffee,1)
}
{
 const g=new Game({count:3}),p=g.s.players[0];p.goods.corn=4;g.s.goodsSupply.corn-=4;g.s.currentChooser=0;g.s.ctx={captainBonus:{}};g.s.vpSupply=1;g.ship(0,{kind:'ship',good:'corn',ship:2,qty:4});assert.equal(p.vp,5);assert.equal(g.s.vpSupply,0)
}
{
 const g=new Game({count:3}),p=g.s.players[0];addBuilding(p,'guild');addBuilding(p,'sm_indigo');addBuilding(p,'indigo');assert.equal(g.largeBonus(p),3);p.buildings=[];addBuilding(p,'residence');p.plants=Array.from({length:12},()=>({worker:0}));assert.equal(g.largeBonus(p),7);p.buildings=[];addBuilding(p,'fortress');p.sanjuan=6;assert.equal(g.largeBonus(p),2)
}
{
 const g=new Game({count:3,rng:()=>.2});g.s.currentRole='settler';g.s.currentChooser=0;g.s.phase='settler';g.s.ctx={order:[0,1,2],pos:0,stage:'choose'};g.s.faceup=['coffee','sugar','corn','indigo'];g.s.pending={type:'settler',options:[{kind:'plant',index:2,good:'corn'},{kind:'quarry'}]};g.dispatch('settler',{choice:{kind:'plant',index:2,good:'corn'}});assert.equal(g.s.players[0].plants.at(-1).good,'corn');
}
{
 const g=new Game({count:3}),p=g.s.players[0];p.sanjuan=2;g.s.pending={type:'staff'};g.s.phase='mayor';g.s.currentRole='mayor';assert.throws(()=>g.dispatch('staff',{plants:[0],buildings:[]}),/可能な限り/);assert.equal(g.s.pending.type,'staff')
}
{
 const g=new Game({count:3}),p=g.s.players[0];p.sanjuan=2;g.s.pending={type:'staff'};g.s.phase='mayor';g.s.currentRole='mayor';const before=JSON.parse(JSON.stringify(g.s));assert.throws(()=>g.dispatch('staff',{plants:[2],buildings:[]}),/上限/);assert.deepEqual(g.s,before,'failed actions roll back the whole state')
}
{
 const g=new Game({count:3}),p=g.s.players[0];p.money=100;addBuilding(p,'small_market',0);assert.throws(()=>g.buyBuilding(0,'small_market',false),/同じ建物/);p.buildings=[];for(const id of ['sm_indigo','sm_sugar','indigo','sugar','tobacco','coffee','small_market','hacienda','construction','small_wh','hospice','office'])addBuilding(p,id,0);assert.equal(p.buildings.length,12);assert.throws(()=>g.buyBuilding(0,'large_market',false),/空きマス/)
}
{
 const g=new Game({count:3});g.s.currentChooser=0;g.s.currentRole='craftsman';g.s.phase='craftsman';g.s.ctx={order:[0,1,2],pos:3,made:{0:{corn:1,indigo:0,sugar:0,tobacco:0,coffee:0}},stage:'bonus'};g.s.pending={type:'craftsmanBonus',options:['corn']};const before=JSON.parse(JSON.stringify(g.s));assert.throws(()=>g.dispatch('craftsmanBonus',{good:'coffee'}),/今回生産/);assert.deepEqual(g.s,before)
}
{
 const g=new Game({count:3});for(const mutate of [s=>s.phase='nonsense',s=>s.players[0].money=-1,s=>s.players[0].plants[0].worker=99]){const bad=JSON.parse(JSON.stringify(g.s));mutate(bad);assert.throws(()=>Game.restore(bad),/壊れ|形式/)}assert.doesNotThrow(()=>Game.restore(g.s))
}
{
 const g=new Game({count:3,rng:()=>0}),p=g.s.players[0];const hidden=g.s.plantDeck.splice(0);g.s.plantDiscard.push(...hidden);const before=p.plants.length;g.takeHacienda(0);assert.equal(p.plants.length,before+1);assert(g.s.plantDeck.length>0)
}
{
 const g=new Game({count:3}),p=g.s.players[1];p.sanjuan=1;addBuilding(p,'small_market',0);const harbor=addBuilding(p,'harbor',0);g.autoStaff(1);assert.equal(harbor.workers,1,'NPC staffs the higher-value violet building first')
}
{
 const g=new Game({count:3}),p=g.s.players[0];p.goods.corn=1;g.s.goodsSupply.corn--;addBuilding(p,'harbor',1);g.s.currentChooser=1;g.s.currentRole='captain';g.s.phase='captain';g.s.ctx={order:[0,1,2],pos:0,passes:0,captainBonus:{}};const choice=g.publicShipments(0)[0];g.s.pending={type:'captain',options:[choice],mustShip:true};g.dispatch('captain',{choice});assert.equal(g.s.pending.type,'harbor');assert.equal(p.vp,1);g.dispatch('harbor',{use:false});assert.equal(p.vp,1,'harbor bonus can be declined')
}
{
 const g=new Game({count:3}),p=g.s.players[0];p.goods.corn=2;g.s.ships[0]={id:0,cap:4,good:'corn',qty:4};assert(!g.publicShipments(0).some(x=>x.good==='corn'),'full corn ship blocks another corn ship')
}
{
 const g=new Game({count:3}),p=g.s.players[0],b=def('sm_indigo');p.money=5;assert.equal(g.price(0,b,true),0);assert.equal(g.price(0,b,false),1)
}
{
 const g=new Game({count:3});g.s.currentChooser=1;assert.throws(()=>g.takeSettler(0,{kind:'quarry'}),/採石場/);const p=g.s.players[0];p.goods.corn=2;g.s.goodsSupply.corn-=2;addBuilding(p,'wharf');g.s.ctx={captainBonus:{}};g.s.currentChooser=0;assert.throws(()=>g.ship(0,{kind:'wharf',good:'corn',qty:9}),/数量/);assert.equal(p.goods.corn,2)
}
{
 const g=new Game({count:3}),p=g.s.players[0];p.money=20;g.buyBuilding(0,'sm_indigo',false);const bad=JSON.parse(JSON.stringify(g.s));bad.players[0].buildings[0].name='<img src=x onerror="globalThis.__xss=1">';assert.throws(()=>Game.restore(bad),/建物データ/);for(const field of ['vp','slots','effect']){const altered=JSON.parse(JSON.stringify(g.s));altered.players[0].buildings[0][field]=field==='effect'?'wharf':999;assert.throws(()=>Game.restore(altered),/建物データ/)}
}
{
 const g=new Game({count:3});for(const mutate of [s=>{s.phase='mayor';s.pending=null},s=>{s.phase='captain';s.currentRole='captain';s.currentChooser=0;s.chosen=['captain'];s.ctx={order:[0,1,2],pos:0,passes:0,postShip:{harborEligible:true}};s.pending={type:'harbor'}}]){const bad=JSON.parse(JSON.stringify(g.s));mutate(bad);assert.throws(()=>Game.restore(bad),/壊れ|一致/)}}
{
 const g=new Game({count:3}),p=g.s.players[0];p.goods.corn=2;g.s.goodsSupply.corn-=2;addBuilding(p,'wharf');g.s.ctx={captainBonus:{},captainPrivilegeResolved:{}};g.s.currentChooser=0;const before=JSON.parse(JSON.stringify(g.s));assert.throws(()=>g.ship(0,{kind:'not-a-real-action',good:'corn',qty:2}),/出荷種別/);assert.deepEqual(g.s,before);assert.throws(()=>g.store(0,{protectedTypes:['invalid'],loose:'invalid'}),/保管内容|倉庫/);assert.deepEqual(g.s,before)
}
{
 const g=new Game({count:3});g.s.currentChooser=0;g.startMayor();const before=JSON.parse(JSON.stringify(g.s));assert.throws(()=>g.dispatch('mayorBonus',{take:'false'}),/正しく/);assert.deepEqual(g.s,before)
}
{
 const g=new Game({count:3}),p=g.s.players[0];p.goods.corn=1;g.s.goodsSupply.corn--;g.s.currentChooser=0;g.s.currentRole='captain';g.s.chosen=['captain'];g.s.phase='captain';g.s.ctx={order:[0,1,2],pos:0,passes:0,captainBonus:{},captainPrivilegeResolved:{}};const choice=g.publicShipments(0)[0];g.s.pending={type:'captain',options:[choice],mustShip:true};g.dispatch('captain',{choice});assert.equal(g.s.pending.type,'captainPrivilege');assert.equal(p.vp,1);g.dispatch('captainPrivilege',{use:false});assert.equal(p.vp,1,'captain privilege can be declined')
}
{
 const g=new Game({count:3});g.s.chosen=g.s.roles.slice(0,g.s.pickLimit);g.s.endAfterRound=true;g.finishGame();const bad=JSON.parse(JSON.stringify(g.s));bad.result=[{name:'<img onerror=1>',shipping:'<b>x</b>'}];const restored=Game.restore(bad);assert.equal(restored.s.result.length,3);assert(restored.s.result.every(x=>Number.isInteger(x.shipping)&&Number.isInteger(x.total)))
}
for(const count of [2,3,4])for(const difficulty of ['easy','normal','hard']){const g=new Game({count,difficulty,rng:()=>.314159});const expectedGoods=goodsTotal(g);const expectedColonists=colonistTotal(g);run(g);assert.deepEqual(goodsTotal(g),expectedGoods,`goods conserved ${count}/${difficulty}`);assert.equal(colonistTotal(g),expectedColonists,`colonists conserved ${count}/${difficulty}`)}
for(const count of [2,3,4])for(const difficulty of ['easy','normal','hard'])for(let seed=1;seed<=5;seed++){const rng=seeded(seed),g=new Game({count,difficulty,rng}),goods=goodsTotal(g),colonists=colonistTotal(g),done=runWithRestore(g,rng);assert.deepEqual(goodsTotal(done),goods);assert.equal(colonistTotal(done),colonists)}
console.log('engine tests: all passed');
