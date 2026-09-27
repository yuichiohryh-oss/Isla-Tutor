(function(root,factory){
  const engine=typeof module==='object'&&module.exports?require('./engine.js'):root.IslaEngine;
  const api=factory(engine);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.IslaReview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(engine){
'use strict';
const {GOODS,GKEYS,ROLES,BUILDINGS,active,citySpaces}=engine;
const KEY='islaTutorReviewV1';
const MAX_DECISIONS=240,MAX_CHANCES=120;
const LIMITS=Object.freeze({
  meaningfulGap:Object.freeze({role:1.5,settler:1,builder:1.5,trader:1,captain:1}),
  goodGapFraction:.35,improvementRegret:.45,majorRegret:.75,majorGapMultiplier:2,
  selfExcellent:.85,selfGood:.7,selfFair:.5,
  opponentMin:6,opponentReliableShare:.6,opponentManyMistakes:.35,opponentSomeMistakes:.15,
  luckMinReveals:6,luckMildZ:1,luckStrongZ:2
});
const QUALITY_WEIGHT=Object.freeze({good:1,acceptable:.7,improvement:.3,major_mistake:0});
const CONFIDENCE_WEIGHT=Object.freeze({high:1,medium:.65,low:0});
const TYPE_NAME=Object.freeze({role:'役職選択',settler:'開拓',builder:'建築',trader:'売却',captain:'出荷'});
const clone=x=>JSON.parse(JSON.stringify(x));
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const sumGoods=p=>GKEYS.reduce((n,g)=>n+(p.goods[g]||0),0);
const label=(type,x)=>{
  if(x===null)return '見送る';
  if(type==='role')return ROLES[x]||String(x);
  if(type==='settler')return x.kind==='quarry'?'採石場':(GOODS[x.good]?.name||String(x.good))+'農園';
  if(type==='builder')return x.name||BUILDINGS.find(b=>b.id===x.id)?.name||String(x.id);
  if(type==='trader')return (GOODS[x]?.name||String(x))+'を売却';
  if(type==='captain')return (GOODS[x.good]?.name||String(x.good))+'を'+x.qty+'個出荷'+(x.kind==='wharf'?'（造船所）':'');
  return String(x);
};
const candidateKey=x=>JSON.stringify(x);
function productionPotential(p){
  let total=p.plants.filter(t=>t.good==='corn'&&t.worker).length;
  for(const g of GKEYS.slice(1)){
    const farms=p.plants.filter(t=>t.good===g&&t.worker).length;
    const factories=p.buildings.filter(b=>b.kind==='production'&&b.good===g).reduce((n,b)=>n+b.workers,0);
    total+=Math.min(farms,factories);
  }
  return total;
}
function shippingPotential(s,p){
  let best=0;
  for(const g of GKEYS){
    if(!p.goods[g])continue;
    const matching=s.ships.find(sh=>sh.good===g);
    const ships=matching?[matching]:s.ships.filter(sh=>sh.good===null);
    for(const sh of ships)best=Math.max(best,Math.min(p.goods[g],sh.cap-sh.qty));
    if(active(p,'wharf')&&!p.wharfUsed)best=Math.max(best,p.goods[g]);
  }
  return best;
}
function tileUtility(g,p){
  const farms=p.plants.filter(t=>t.good===g).length;
  const capacity=g==='corn'?99:p.buildings.filter(b=>b.kind==='production'&&b.good===g).reduce((n,b)=>n+b.slots,0);
  const line=capacity>farms?2.2:capacity>0?.9:0;
  return 1+GOODS[g].value*.2+line+(g==='corn'?.7:0);
}
function scoreSettler(x,s,i){
  const p=s.players[i];
  if(x===null)return p.plants.length>=11?1.4:.3;
  if(x.kind==='quarry'){
    const future=BUILDINGS.some(b=>b.cost>=5&&s.buildingSupply[b.id]>0&&!p.buildings.some(z=>z.id===b.id));
    return 1.1+(future?2:0)+(p.money>=4?.8:0)-(p.plants.filter(t=>t.quarry).length*.65);
  }
  return tileUtility(x.good,p)+(p.plants.length>=11?-.4:0);
}
function buildingPrice(b,p,s,i){
  const cost=s.balanced&&b.id==='factory'?8:s.balanced&&b.id==='university'?7:b.cost;
  const quarries=p.plants.filter(t=>t.quarry&&t.worker).length;
  return Math.max(0,cost-(s.phase==='rolePick'||s.currentChooser===i?1:0)-Math.min(quarries,b.column));
}
function scoreBuilder(x,s,i){
  const p=s.players[i];
  if(x===null)return .8+(p.money<=3?.7:0)+(citySpaces(p)>=10?.6:0);
  const price=Number.isFinite(x.price)?x.price:buildingPrice(x,p,s,i);
  const spare=p.money-price;
  let utility=x.vp*1.25-price*.32-(spare===0&&s.vpSupply>12?1.2:0);
  if(x.kind==='production'){
    const farms=p.plants.filter(t=>t.good===x.good).length;
    const slots=p.buildings.filter(b=>b.kind==='production'&&b.good===x.good).reduce((n,b)=>n+b.slots,0);
    utility+=Math.min(x.slots,Math.max(0,farms-slots))*2.3;
    if(farms===0)utility-=1.4;
  }
  if(['market1','market2','office'].includes(x.effect))utility+=sumGoods(p)>0?1.3:.5;
  if(['harbor','wharf','store1','store2'].includes(x.effect))utility+=sumGoods(p)>0?1.8:.6;
  if(x.effect==='factory')utility+=productionPotential(p)>1?2:.4;
  if(x.effect==='construction')utility+=p.plants.length<9?1.4:.2;
  if(x.effect==='hacienda')utility+=p.plants.length<8?1.2:.1;
  if(x.large)utility+=s.endAfterRound||s.vpSupply<15?1.8:.6;
  if(citySpaces(p)+(x.citySize||1)>=12&&s.vpSupply>12)utility-=1.4;
  return utility;
}
function scoreTrader(x,s,i){
  const p=s.players[i];
  if(x===null)return .5+(s.trade.length>=3?.5:0);
  const income=GOODS[x].value+(s.phase==='rolePick'||s.currentChooser===i?1:0)+(active(p,'market1')?1:0)+(active(p,'market2')?2:0);
  const scarce=p.goods[x]===1;
  const shipOpen=s.roles.includes('captain')&&!s.chosen.includes('captain');
  const shipValue=scarce&&shipOpen?1.5:scarce?.7:0;
  return income*1.05-shipValue+(p.money<4?.8:0);
}
function scoreCaptain(x,s,i){
  const p=s.players[i];
  if(x===null)return .35;
  const privilege=s.currentChooser===i&&!s.captainPrivilegeResolved?.[i]?1:0;
  const harbor=active(p,'harbor')?1:0;
  const otherGoods=sumGoods(p)-x.qty;
  const storageRisk=otherGoods>1&&!active(p,'store1')&&!active(p,'store2')?.5:0;
  return x.qty+privilege+harbor+storageRisk+(x.kind==='wharf'&&p.goods[x.good]>1?.3:0);
}
function roleBase(role,s,i){
  const p=s.players[i];
  if(role==='settler'){
    const tiles=s.faceup.map((good,index)=>scoreSettler({kind:'plant',good,index},s,i));
    if(s.quarries>0)tiles.push(scoreSettler({kind:'quarry'},s,i));
    return p.plants.length<12?Math.max(0,...tiles):0;
  }
  if(role==='mayor'){
    const empty=p.plants.filter(t=>!t.worker).length+p.buildings.reduce((n,b)=>n+b.slots-b.workers,0);
    return Math.min(4,empty)*1.1+(s.colonistReserve>0?1:0);
  }
  if(role==='builder'){
    const options=BUILDINGS.filter(b=>s.buildingSupply[b.id]>0&&!p.buildings.some(x=>x.id===b.id)&&citySpaces(p)+(b.citySize||1)<=12&&buildingPrice(b,p,s,i)<=p.money);
    return options.length?Math.max(...options.map(b=>scoreBuilder({...b,price:buildingPrice(b,p,s,i)},s,i)))*.75:0;
  }
  if(role==='craftsman')return productionPotential(p)*1.35+(active(p,'factory')?1:0);
  if(role==='trader'){
    const options=GKEYS.filter(g=>p.goods[g]>0&&s.trade.length<4&&(!s.trade.includes(g)||active(p,'office')));
    return options.length?Math.max(...options.map(g=>scoreTrader(g,s,i))):0;
  }
  if(role==='captain'){
    const qty=shippingPotential(s,p);
    return Math.min(qty,6)+(qty>0?1:0)+(active(p,'harbor')?1.5:0)+(active(p,'wharf')?1:0);
  }
  return 1;
}
function scoreRole(role,s,i){
  const own=roleBase(role,s,i);
  const other=Math.max(0,...s.players.map((_,j)=>j===i?0:roleBase(role,s,j)));
  let value=own-other*.25+(s.roleCoins[role]||0)*1.5;
  if(role==='captain'&&s.vpSupply<20)value+=2;
  if(role==='builder'&&s.endAfterRound)value+=1;
  return value;
}
const SCORERS={role:scoreRole,settler:scoreSettler,builder:scoreBuilder,trader:scoreTrader,captain:scoreCaptain};
function evidenceFor(e,best){
  const s=e.before,p=s.players[e.actor];
  if(best===null)return 'この局面では資金や商品を温存する選択も有力でした。';
  if(e.type==='role'){
    const coins=s.roleCoins[best]||0;
    if(best==='captain'){const qty=shippingPotential(s,p);return qty?'現時点で最大'+qty+'個を出荷でき、即時VPと選択者特権を見込めました。':'役職金や終盤状況を含めて比べた候補でした。'}
    if(best==='builder')return '現在の資金で建てられる建物と選択者割引を活かせる候補でした。'+(coins?'役職金は'+coins+'金でした。':'');
    return '自分の利益と相手の便乗を比べた候補でした。'+(coins?'役職金は'+coins+'金でした。':'');
  }
  if(e.type==='settler'){
    if(best.kind==='quarry')return '今後の建築費を下げる採石場を確保できる局面でした。';
    const facility=p.buildings.some(b=>b.kind==='production'&&b.good===best.good);
    return best.good==='corn'?'トウモロコシは工場なしで生産できる農園でした。':facility?'対応する生産施設を既に持ち、農園を生産ラインにつなげられました。':'商品価値と、今後施設を建てる余地を考えた候補です。';
  }
  if(e.type==='builder'){
    const farms=p.plants.filter(t=>t.good===best.good).length;
    return best.name+'は'+best.price+'金で'+best.vp+'建物VP。'+(best.kind==='production'&&farms?'対応する農園を'+farms+'枚持っていました。':'残り資金と都市スペースも考慮した候補です。');
  }
  if(e.type==='trader'){
    const income=GOODS[best].value+(s.currentChooser===e.actor?1:0)+(active(p,'market1')?1:0)+(active(p,'market2')?2:0);
    return GOODS[best].name+'の売却で'+income+'金を得られ、残る商品も比較した候補です。';
  }
  return '一度に'+best.qty+'個を出荷でき、即時VPと保管時の損失を比べた候補です。';
}
function confidenceFor(e){
  if(e.type==='captain')return 'high';
  if(e.type==='role')return e.before.endAfterRound||e.before.vpSupply<=10?'high':'medium';
  if(e.type==='builder')return e.chosen?.large&&!e.before.endAfterRound&&e.before.vpSupply>20?'low':e.before.endAfterRound?'high':'medium';
  if(e.type==='trader')return e.chosen&&e.before.players[e.actor].goods[e.chosen]===1&&!e.before.chosen.includes('captain')?'low':'medium';
  if(e.type==='settler'&&e.chosen?.kind==='plant'&&e.chosen.good!=='corn'&&!e.before.players[e.actor].buildings.some(b=>b.kind==='production'&&b.good===e.chosen.good))return 'low';
  return 'medium';
}
function evaluateDecision(e){
  if(!e||!SCORERS[e.type]||!e.before||!Array.isArray(e.candidates)||!e.before.players?.[e.actor])return null;
  const candidates=e.candidates,chosenKey=candidateKey(e.chosen);
  const chosenIndex=candidates.findIndex(x=>candidateKey(x)===chosenKey);
  if(chosenIndex<0)return null;
  const scorer=SCORERS[e.type];
  const scored=candidates.map((candidate,index)=>({index,candidate,score:scorer(candidate,e.before,e.actor)}));
  if(scored.some(x=>!Number.isFinite(x.score)))return null;
  const ranked=[...scored].sort((a,b)=>b.score-a.score);
  const best=ranked[0],worst=ranked[ranked.length-1],chosen=scored[chosenIndex];
  const gap=Math.max(0,best.score-chosen.score),spread=best.score-worst.score;
  const min=LIMITS.meaningfulGap[e.type];
  const meaningful=candidates.length>=2&&spread>=min;
  const regret=meaningful?clamp(gap/spread,0,1):0;
  const confidence=confidenceFor(e);
  let quality='acceptable';
  if(meaningful){
    if(gap<=min*LIMITS.goodGapFraction)quality='good';
    else if(gap>=min&&regret>=LIMITS.improvementRegret)quality='improvement';
    if(quality==='improvement'&&confidence==='high'&&regret>=LIMITS.majorRegret&&gap>=min*LIMITS.majorGapMultiplier)quality='major_mistake';
  }
  const alternative=best.index===chosenIndex?(ranked[1]&&best.score-ranked[1].score<=min*1.5?ranked[1]:null):best;
  return {
    round:e.round,actor:e.actor,actorName:String(e.name||''),human:!!e.human,type:e.type,
    chosenLabel:label(e.type,e.chosen),alternativeLabel:alternative?label(e.type,alternative.candidate):'有力な代替候補なし',
    quality,normalizedRegret:regret,confidence,meaningful,
    shortEvidence:evidenceFor(e,best.candidate),gap:Math.round(gap*100)/100
  };
}
function createSession({partial=false,reason=''}={}){
  return{version:1,partial:!!partial,reason:String(reason),decisions:[],chanceEvents:[]};
}
function observeDecision(session,event){
  const record=evaluateDecision(event);
  if(record){session.decisions.push(record);if(session.decisions.length>MAX_DECISIONS)session.decisions.shift()}
  return record;
}
function observeChance(session,event){
  if(event?.kind!=='plantReveal'||!GOODS[event.revealed]||!event.human||!event.remainingBefore)return null;
  const counts=event.remainingBefore,total=GKEYS.reduce((n,g)=>n+(Number.isInteger(counts[g])?counts[g]:0),0);
  if(total<1||!counts[event.revealed]||GKEYS.some(g=>!Number.isInteger(counts[g])||counts[g]<0))return null;
  const values=GKEYS.map(g=>tileUtility(g,event.human));
  const expected=GKEYS.reduce((n,g,i)=>n+counts[g]*values[i],0)/total;
  const variance=GKEYS.reduce((n,g,i)=>n+counts[g]*(values[i]-expected)**2,0)/total;
  const record={round:event.round,revealed:event.revealed,remainingBefore:clone(counts),deviation:values[GKEYS.indexOf(event.revealed)]-expected,variance};
  session.chanceEvents.push(record);if(session.chanceEvents.length>MAX_CHANCES)session.chanceEvents.shift();
  return record;
}
function tracker(session){
  return{session,decision:event=>observeDecision(session,event),chance:event=>observeChance(session,event)};
}
function fingerprint(raw){
  let hash=2166136261;
  for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619)}
  return (hash>>>0).toString(16)+':'+raw.length;
}
function persistForSave(raw,session,storage){
  storage.setItem(KEY,JSON.stringify({version:1,fingerprint:fingerprint(raw),session}));
}
function loadForSave(raw,storage){
  try{
    const stored=storage.getItem(KEY);
    if(!stored)return createSession({partial:true,reason:'この講評は途中再開後の記録を中心にしています。'});
    if(stored.length>250000)throw Error('oversized review');
    const parsed=JSON.parse(stored);
    if(parsed.version!==1||parsed.fingerprint!==fingerprint(raw))throw Error('checkpoint mismatch');
    const s=parsed.session;
    if(s?.version!==1||!Array.isArray(s.decisions)||!Array.isArray(s.chanceEvents))throw Error('invalid review');
    if(s.decisions.length>MAX_DECISIONS||s.chanceEvents.length>MAX_CHANCES)throw Error('oversized review');
    for(const d of s.decisions)if(!d||!['role','settler','builder','trader','captain'].includes(d.type)||!['good','acceptable','improvement','major_mistake'].includes(d.quality)||!['high','medium','low'].includes(d.confidence)||!Number.isFinite(d.normalizedRegret)||d.normalizedRegret<0||d.normalizedRegret>1||!Number.isInteger(d.round)||d.round<1||!Number.isInteger(d.actor)||d.actor<0||d.actor>3||typeof d.human!=='boolean'||typeof d.meaningful!=='boolean'||typeof d.actorName!=='string'||d.actorName.length>80||typeof d.chosenLabel!=='string'||d.chosenLabel.length>120||typeof d.alternativeLabel!=='string'||d.alternativeLabel.length>120||typeof d.shortEvidence!=='string'||d.shortEvidence.length>240)throw Error('invalid decision');
    for(const c of s.chanceEvents)if(!c||!GOODS[c.revealed]||!Number.isFinite(c.deviation)||Math.abs(c.deviation)>10||!Number.isFinite(c.variance)||c.variance<0||c.variance>100||!Number.isInteger(c.round)||c.round<1)throw Error('invalid chance');
    if(typeof s.partial!=='boolean'||typeof s.reason!=='string'||s.reason.length>240)throw Error('invalid session');
    return clone(s);
  }catch(_){return createSession({partial:true,reason:'講評履歴を確認できないため、途中再開後の記録を中心にしています。'})}
}
function scoreAggregate(decisions){
  const usable=decisions.filter(d=>d.meaningful&&CONFIDENCE_WEIGHT[d.confidence]>0);
  const weight=usable.reduce((n,d)=>n+CONFIDENCE_WEIGHT[d.confidence],0);
  return{count:usable.length,score:weight?usable.reduce((n,d)=>n+QUALITY_WEIGHT[d.quality]*CONFIDENCE_WEIGHT[d.confidence],0)/weight:null};
}
function selfLabel(aggregate){
  if(aggregate.count<3)return '判断材料が少ない';
  if(aggregate.score>=LIMITS.selfExcellent)return 'とても良い';
  if(aggregate.score>=LIMITS.selfGood)return '良い';
  if(aggregate.score>=LIMITS.selfFair)return 'まずまず';
  return '改善余地あり';
}
function opponentLevel(decisions){
  const meaningful=decisions.filter(d=>d.meaningful);
  const reliable=meaningful.filter(d=>CONFIDENCE_WEIGHT[d.confidence]>0);
  if(reliable.length<LIMITS.opponentMin||reliable.length/Math.max(1,meaningful.length)<LIMITS.opponentReliableShare)return '判断材料が少ない';
  const bad=reliable.filter(d=>d.quality==='improvement'||d.quality==='major_mistake').length/reliable.length;
  if(bad>=LIMITS.opponentManyMistakes)return 'ミス多め';
  if(bad>=LIMITS.opponentSomeMistakes)return 'ばらつきあり';
  return scoreAggregate(reliable).score>=LIMITS.selfGood?'良好':'標準的';
}
function luckLabel(chances){
  const usable=chances.filter(c=>c.variance>0);
  const variance=usable.reduce((n,c)=>n+c.variance,0);
  if(usable.length<LIMITS.luckMinReveals||variance<1)return '判定材料が少ない';
  const z=usable.reduce((n,c)=>n+c.deviation,0)/Math.sqrt(variance);
  if(z>=LIMITS.luckStrongZ)return '強い追い風';
  if(z>=LIMITS.luckMildZ)return 'やや追い風';
  if(z<=-LIMITS.luckStrongZ)return '強い逆風';
  if(z<=-LIMITS.luckMildZ)return 'やや逆風';
  return 'おおむね中立';
}
function comparison(rows){
  const human=rows.find(r=>r.index===0),leader=rows[0];
  const tied=human.total===leader.total&&human.tie===leader.tie;
  const outcome=tied?(rows.some(r=>r.index!==0&&r.total===human.total&&r.tie===human.tie)?'tie':'win'):'loss';
  const opponent=outcome==='loss'?leader:outcome==='tie'?rows.find(r=>r.index!==0&&r.total===human.total&&r.tie===human.tie):rows.find(r=>r.index!==0);
  return{human,opponent,outcome};
}
function topDecisions(decisions,qualities){
  return decisions.filter(d=>d.meaningful&&qualities.includes(d.quality)&&d.confidence!=='low')
    .sort((a,b)=>(b.quality==='major_mistake'?1:0)-(a.quality==='major_mistake'?1:0)||b.normalizedRegret-a.normalizedRegret||a.round-b.round)
    .slice(0,3);
}
function buildReport(session,state){
  const rows=state.result||[],fallback=createSession({partial:true,reason:'詳細な判断記録がないため簡易講評です。'});
  const safe=session&&Array.isArray(session.decisions)&&Array.isArray(session.chanceEvents)?session:fallback;
  if(!rows.length)return null;
  const {human,opponent,outcome}=comparison(rows);
  const own=safe.decisions.filter(d=>d.human),npc=safe.decisions.filter(d=>!d.human);
  const ownAggregate=scoreAggregate(own),npcAggregate=scoreAggregate(npc);
  const self=selfLabel(ownAggregate),opponentPlay=opponentLevel(npc),luck=luckLabel(safe.chanceEvents);
  const npcMistakes=topDecisions(npc,['improvement','major_mistake']);
  const primaryDecisions=npc.filter(d=>d.actor===opponent?.index),primaryAggregate=scoreAggregate(primaryDecisions);
  const primaryMistakes=primaryDecisions.filter(d=>d.meaningful&&d.confidence!=='low'&&['improvement','major_mistake'].includes(d.quality));
  const impact=primaryAggregate.count<3?'判断材料が少ない':primaryMistakes.length>=3&&primaryMistakes.some(d=>d.quality==='major_mistake')?'大きい':primaryMistakes.length?'やや影響':'小さい';
  const good=own.filter(d=>d.meaningful&&d.quality==='good'&&d.confidence!=='low').sort((a,b)=>CONFIDENCE_WEIGHT[b.confidence]-CONFIDENCE_WEIGHT[a.confidence]||a.round-b.round).slice(0,3);
  const improve=topDecisions(own,['improvement','major_mistake']);
  const title=outcome==='win'?'勝てたポイント':outcome==='loss'?'負けたポイント':'勝ち切れなかったポイント';
  const factors=[];
  if(opponent){
    const sign=outcome==='loss'?-1:1;
    for(const [key,name] of [['shipping','出荷VP'],['building','建物得点'],['bonus','大型建物ボーナス']]){
      const difference=(human[key]-opponent[key])*sign;
      if(difference>0)factors.push({difference,text:(outcome==='loss'?opponent.name:'あなた')+'が'+name+'で'+Math.abs(human[key]-opponent[key])+'点上回りました。'});
    }
    factors.sort((a,b)=>b.difference-a.difference);
  }
  const points=factors.slice(0,2).map(f=>f.text);
  if(opponent)points.unshift('主要比較相手の'+opponent.name+'と比べ、合計は'+human.total+'対'+opponent.total+'点でした。'+(human.total===opponent.total&&outcome!=='tie'?'順位はタイブレークで決まりました。':''));
  if(points.length<3&&outcome==='loss'&&improve.length)points.push('Round '+improve[0].round+'の'+improve[0].chosenLabel+'には改善の余地があり、敗因の一つと考えられます。');
  if(points.length<3&&outcome==='win'&&good.length)points.push('Round '+good[0].round+'の'+good[0].chosenLabel+'は有力な判断でした。');
  if(outcome==='tie'&&points.length<2)points.push('合計点とタイブレークでも並びました。個々の判断は以下で振り返れます。');
  const lead=outcome==='win'?(self==='とても良い'||self==='良い'?'内容の良い勝利です。':self==='判断材料が少ない'?'勝利しました。判断記録が少ないため、内容の評価は保留します。':'勝利しましたが、判断には改善余地があります。'):outcome==='loss'?(self==='とても良い'||self==='良い'?'結果は敗北ですが、内容は悪くありません。':self==='判断材料が少ない'?'敗北しました。判断記録が少ないため、内容の評価は保留します。':'敗北しました。判断と得点内訳を振り返りましょう。'):'同点首位でした。';
  const second=outcome==='win'&&['大きい','やや影響'].includes(impact)?'主要比較相手の個別ミスも勝利を後押しした可能性があります。':opponentPlay==='良好'&&outcome==='loss'?'相手も今回、良い判断を重ねました。':'得点差と選択時点の判断を分けて確認できます。';
  const next=improve.length?['次回はRound '+improve[0].round+'の'+TYPE_NAME[improve[0].type]+'で、'+improve[0].alternativeLabel+'も比較しましょう。']:['次回も役職の利益と、相手が便乗して得る利益を比べましょう。'];
  if(luck==='判定材料が少ない')next.push('農園の巡りは判断材料が十分な時だけ参考にしましょう。');
  const limited=ownAggregate.count+npcAggregate.count<3;
  const qualityCounts={good:0,acceptable:0,improvement:0,major_mistake:0};
  own.filter(d=>d.meaningful&&d.confidence!=='low').forEach(d=>qualityCounts[d.quality]++);
  return{outcome,title,summary:lead+' '+second,axes:{self,opponentImpact:impact,opponentPlay,luck},points:points.slice(0,3),good,improve,npcMistakes,next:next.slice(0,2),ownCount:ownAggregate.count,npcCount:npcAggregate.count,qualityCounts,partial:!!safe.partial,partialReason:safe.reason||'',limited,chanceCount:safe.chanceEvents.length};
}
return{KEY,LIMITS,createSession,tracker,evaluateDecision,observeDecision,observeChance,fingerprint,persistForSave,loadForSave,buildReport,comparison,scoreAggregate,opponentLevel,luckLabel};
});
