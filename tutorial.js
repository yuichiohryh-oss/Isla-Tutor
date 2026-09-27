(function(root,factory){
  const engine=typeof module==='object'&&module.exports?require('./engine.js'):root.IslaEngine;
  const api=factory(engine);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.IslaTutorial=api.createController();
})(typeof globalThis!=='undefined'?globalThis:this,function(engine){
'use strict';
const {Game}=engine;

const SCRIPTED_ROLES={1:{1:'builder',2:'mayor'},2:{1:'craftsman',2:'trader'}};
const STEPS={
  board:{title:'自分のボード',text:'ここに金、VP、待機入植者、都市、島、商品が表示されます。まず現在のボードを見てください。',target:'.player.you',next:'roles'},
  roles:{title:'役職の仕組み',text:'毎ラウンド、各プレイヤーが1つずつ役職を選びます。選ばれた役職では全員が行動し、選択者だけが特権を受けます。',target:'#roles',next:'settler-role'},
  'settler-role':{title:'開拓者を選ぶ',text:'光っている「開拓者」をクリックしてください。農園は商品を作るための土地です。',target:'[data-role="settler"]'},
  corn:{title:'トウモロコシ農園',text:'光っているトウモロコシ農園を取得してください。トウモロコシは農園だけで生産できます。',target:'[data-tutorial-target="corn-choice"]'},
  'building-market':{title:'建物売り場',text:'建物には価格とVPがあります。生産施設のほか、特別な効果を持つ建物もあります。建築家の選択者だけが1金引きです。',target:'#buildingMarket',next:'builder'},
  builder:{title:'小インディゴ工場を建てる',text:'建築家を選んだのはNPCですが、あなたも建築できます。インディゴ農園だけでは生産できません。光っている工場を建ててください。',target:'[data-tutorial-target="indigo-factory"]'},
  'staff-indigo':{title:'インディゴ農園に配置',text:'親方を選んだのもNPCです。役職のアクションは全員が行い、選択者だけが特権を受けます。インディゴ農園の「＋」を押してください。',target:'[data-staff][data-kind="plant"][data-index="0"][data-delta="1"]'},
  'staff-corn':{title:'トウモロコシ農園に配置',text:'光っている「＋」でトウモロコシ農園に入植者を置いてください。',target:'[data-staff][data-kind="plant"][data-index="1"][data-delta="1"]'},
  'staff-building':{title:'工場に配置',text:'インディゴの生産には、農園と対応する工場の両方に入植者が必要です。工場の「＋」を押してください。',target:'[data-staff][data-kind="building"][data-index="0"][data-delta="1"]'},
  'staff-confirm':{title:'配置を確定',text:'両農園と工場に入植者が置かれました。「配置を確定」を押してください。',target:'#staffDone'},
  produce:{title:'商品を生産',text:'NPCが監督を選びました。あなたも生産できます。トウモロコシは農園だけ、インディゴは農園と工場が稼働していると生産できます。',target:'[data-produce="1"]'},
  goods:{title:'商品が増えました',text:'自分のボードにインディゴとトウモロコシが各1個増えました。次はインディゴを売り、トウモロコシを出荷用に残します。',target:'.player.you .goods-row',next:'market'},
  market:{title:'商館を見る',text:'NPCが商人を選びました。商品を売ると金になります。商館にすでにある種類は原則売れません。選択者だけが売却時の特権を受けます。',target:'#market',next:'trade'},
  trade:{title:'インディゴを売る',text:'光っているインディゴの売却を選んでください。トウモロコシは船長のために残します。',target:'[data-tutorial-target="indigo-sale"]'},
  money:{title:'金が増えました',text:'インディゴを売って1金を得ました。今は便乗なので、商人の選択者特権は付きません。',target:'.player.you [data-stat="money"]',next:'captain-role'},
  'captain-role':{title:'船長を選ぶ',text:'今度は自分が船長を選びます。光っている「船長」をクリックしてください。',target:'[data-role="captain"]'},
  'ships-info':{title:'船を見る',text:'商品を出荷するとVPになります。積める商品があれば出荷は必須で、1隻には同じ種類の商品だけを積みます。',target:'#ships',next:'ship'},
  ship:{title:'トウモロコシを出荷',text:'光っている船へトウモロコシを出荷してください。',target:'[data-tutorial-target="corn-shipment"]'},
  bonus:{title:'船長の特権',text:'自分で船長を選んだので、最初の出荷に特権の1VPを追加できます。「使う」を押してください。',target:'[data-captain-bonus="1"]'},
  complete:{title:'基本操作は以上です',text:'土地取得→建築→入植→生産→売却→出荷を体験しました。ここからは自由に遊んでみましょう。',target:'.player.you [data-stat="vp"]'}
};
const STEP_KEYS=Object.keys(STEPS);

function createTutorialGame(){
  const tutorialGame=new Game({count:3,difficulty:'easy',balanced:true,expansion:'none',rng:()=>0});
  tutorialGame.s.players[0].sanjuan+=2;
  tutorialGame.s.colonistReserve-=2;
  tutorialGame.aiRole=i=>SCRIPTED_ROLES[tutorialGame.s.round]?.[i]||Game.prototype.aiRole.call(tutorialGame,i);
  return tutorialGame;
}
function snapshot(s){const p=s.players[0];return{round:s.round,phase:s.phase,pending:s.pending?.type,chooser:s.currentChooser,money:p.money,vp:p.vp,goods:{...p.goods},plants:p.plants.map(x=>({...x})),buildings:p.buildings.map(x=>({id:x.id,workers:x.workers}))}}
function allowsAction(stage,s,type,payload){
  const p=s.pending;if(!p||p.type!==type)return false;
  if(stage==='settler-role')return type==='role'&&payload.role==='settler'&&s.round===1&&s.chooser===0;
  if(stage==='corn')return type==='settler'&&payload.choice?.kind==='plant'&&payload.choice.good==='corn'&&payload.choice.index===p.options.find(x=>x.good==='corn')?.index;
  if(stage==='builder')return type==='builder'&&payload.id==='sm_indigo'&&p.options.some(x=>x.id==='sm_indigo');
  if(stage==='staff-confirm')return type==='staff'&&s.players[0].plants[0]?.worker===1&&s.players[0].plants[1]?.worker===1&&s.players[0].buildings[0]?.workers===1;
  if(stage==='produce')return type==='craftsmanProduce'&&payload.produce===true;
  if(stage==='trade')return type==='trader'&&payload.good==='indigo'&&p.options.includes('indigo');
  if(stage==='captain-role')return type==='role'&&payload.role==='captain'&&s.round===2&&s.chooser===0;
  if(stage==='ship')return type==='captain'&&payload.choice?.kind==='ship'&&payload.choice.good==='corn'&&payload.choice.ship===0&&p.options.some(x=>x.kind==='ship'&&x.good==='corn'&&x.ship===0&&x.qty===payload.choice.qty);
  if(stage==='bonus')return type==='captainPrivilege'&&payload.use===true;
  return false;
}
function advanceAfterAction(stage,type,payload,before,s,milestones){
  const p=s.players[0],pending=s.pending?.type;
  if(stage==='settler-role'&&type==='role'&&s.phase==='settler'&&pending==='settler')return'corn';
  if(stage==='corn'&&type==='settler'&&p.plants.length===before.plants.length+1&&p.plants.at(-1).good==='corn'&&pending==='builder')return'building-market';
  if(stage==='builder'&&type==='builder'&&p.buildings.some(x=>x.id==='sm_indigo')&&p.money===before.money-1&&s.phase==='mayor'&&pending==='staff')return'staff-indigo';
  if(stage==='staff-confirm'&&type==='staff'&&p.plants[0].worker===1&&p.plants[1].worker===1&&p.buildings[0].workers===1&&s.round===2&&pending==='craftsmanProduce')return'produce';
  if(stage==='produce'&&type==='craftsmanProduce'&&p.goods.corn===before.goods.corn+1&&p.goods.indigo===before.goods.indigo+1&&pending==='trader')return'goods';
  if(stage==='trade'&&type==='trader'&&p.goods.indigo===before.goods.indigo-1&&p.goods.corn>=1&&p.money===before.money+1&&s.round===2&&pending==='role')return'money';
  if(stage==='captain-role'&&type==='role'&&s.currentRole==='captain'&&s.currentChooser===0&&pending==='captain')return'ships-info';
  if(stage==='ship'&&type==='captain'&&payload.choice?.good==='corn'&&p.goods.corn===before.goods.corn-1&&p.vp===before.vp+1&&pending==='captainPrivilege'){
    milestones.cornShipped=true;return'bonus';
  }
  if(stage==='bonus'&&type==='captainPrivilege'&&payload.use===true&&milestones.cornShipped&&p.vp===before.vp+1){
    milestones.captainPrivilegeTaken=true;return'complete';
  }
  return stage;
}
function createController(){
  const state={active:false,stage:'board',savedAtStart:null,milestones:{cornShipped:false,captainPrivilegeTaken:false},ui:null,raf:0,epoch:0,focusedStage:null};
  const controller={get active(){return state.active},get stage(){return state.stage},get milestones(){return{...state.milestones}},start,cleanup,abort,finish,sync,beforeAction,afterAction,allowsAction:canAct,allowsStaffChange};
  function start(){
    if(!state.active&&game&&!document.querySelector('#game').classList.contains('hidden')&&!confirm('現在のゲームを保存したまま、チュートリアルを始めますか？'))return;
    cleanup();state.savedAtStart=localStorage.getItem(SAVE_KEY);state.stage='board';state.error=null;state.milestones={cornShipped:false,captainPrivilegeTaken:false};state.active=true;
    mount();startGameInstance(createTutorialGame());
  }
  function mount(){
    const ui=document.createElement('div');ui.id='tutorialOverlay';ui.innerHTML='<div class="tutorial-shade"></div><div class="tutorial-shade"></div><div class="tutorial-shade"></div><div class="tutorial-shade"></div><div class="tutorial-frame" aria-hidden="true"></div><section class="tutorial-card" role="dialog" aria-labelledby="tutorialTitle" aria-describedby="tutorialText" aria-live="polite"></section>';
    document.body.appendChild(ui);state.ui=ui;
    ui.querySelector('.tutorial-card').addEventListener('click',cardClick);
    document.addEventListener('pointerdown',blockOutside,true);document.addEventListener('click',blockOutside,true);document.addEventListener('keydown',blockKeys,true);
    window.addEventListener('scroll',queuePosition,true);window.addEventListener('resize',queuePosition);
  }
  function cleanup(){
    state.epoch++;cancelAnimationFrame(state.raf);state.raf=0;
    document.removeEventListener('pointerdown',blockOutside,true);document.removeEventListener('click',blockOutside,true);document.removeEventListener('keydown',blockKeys,true);
    window.removeEventListener('scroll',queuePosition,true);window.removeEventListener('resize',queuePosition);
    document.querySelectorAll('.tutorial-highlight').forEach(x=>x.classList.remove('tutorial-highlight'));
    state.ui?.remove();state.ui=null;state.active=false;state.focusedStage=null;
  }
  function abort(){
    const raw=state.savedAtStart;cleanup();cancelSession();
    if(raw){try{game=Game.restore(JSON.parse(raw));showGame();if(!game.s.pending&&game.s.phase!=='end')schedule(advance);return}catch(e){console.error(e)}}
    resetToSetup();
  }
  function finish(){
    if(!state.active||state.stage!=='complete'||!state.milestones.cornShipped||!state.milestones.captainPrivilegeTaken)return;
    if(state.savedAtStart){abort();return}
    const finishedState=game.s;cleanup();cancelSession();game=Game.restore(finishedState);render();save();
  }
  function canAct(type,payload){return allowsAction(state.stage,game.s,type,payload)}
  function beforeAction(){return snapshot(game.s)}
  function afterAction(type,payload,before){
    if(!state.active)return;
    const next=advanceAfterAction(state.stage,type,payload,before,game.s,state.milestones);
    if(next!==state.stage){state.stage=next;return}
    state.error='操作後の状態を確認できませんでした。チュートリアルを終了して再開始してください。';
  }
  function allowsStaffChange(kind,index,delta){
    if(game.s.pending?.type!=='staff'||delta!==1)return false;
    return state.stage==='staff-indigo'&&kind==='plant'&&index===0||state.stage==='staff-corn'&&kind==='plant'&&index===1||state.stage==='staff-building'&&kind==='building'&&index===0;
  }
  function sync(){
    if(!state.active||!state.ui)return;
    const me=game.s.players[0];
    if(state.stage==='staff-indigo'&&me.plants[0]?.worker===1)state.stage='staff-corn';
    if(state.stage==='staff-corn'&&me.plants[1]?.worker===1)state.stage='staff-building';
    if(state.stage==='staff-building'&&me.buildings[0]?.workers===1)state.stage='staff-confirm';
    document.querySelectorAll('.tutorial-highlight').forEach(x=>x.classList.remove('tutorial-highlight'));
    const step=STEPS[state.stage],target=document.querySelector(step.target),card=state.ui.querySelector('.tutorial-card');
    if(target)target.classList.add('tutorial-highlight');
    const count=STEP_KEYS.indexOf(state.stage)+1;
    const action=state.stage==='complete'?(state.savedAtStart?'<button class="primary" data-tutorial-action="finish">前回のゲームへ戻る</button>':'<button class="primary" data-tutorial-action="finish">チュートリアルを終了して続ける</button>'):step.next&&target?'<button class="primary" data-tutorial-action="next">次へ</button>':'';
    card.innerHTML=`<div class="tutorial-count">ステップ ${count}/${STEP_KEYS.length}</div><h2 id="tutorialTitle">${step.title}</h2><p id="tutorialText">${state.error||(!target?'NPCが行動中です。画面の準備を待っています。':step.text)}</p><div class="tutorial-actions">${action}<button class="secondary" data-tutorial-action="abort">チュートリアルを終了</button></div>`;
    queuePosition();
    if(state.focusedStage!==state.stage){state.focusedStage=state.stage;const epoch=state.epoch,stage=state.stage;requestAnimationFrame(()=>{if(!state.active||epoch!==state.epoch||stage!==state.stage)return;const fresh=document.querySelector(STEPS[stage].target);const focusTarget=fresh?.matches('button:not(:disabled)')?fresh:card.querySelector('[data-tutorial-action="next"], [data-tutorial-action="finish"], [data-tutorial-action="abort"]');focusTarget?.focus({preventScroll:true})})}
  }
  function cardClick(event){const action=event.target.closest('[data-tutorial-action]')?.dataset.tutorialAction;if(action==='abort')abort();else if(action==='finish')finish();else if(action==='next'){const next=STEPS[state.stage]?.next;if(next){state.stage=next;sync()}}}
  function blockOutside(event){
    if(!state.active||state.ui?.contains(event.target))return;
    if(event.target.closest('#newBtn,#rulesBtn,#rulesDialog'))return;
    const target=document.querySelector(STEPS[state.stage].target);
    if(!STEPS[state.stage].next&&state.stage!=='complete'&&target?.contains(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();
  }
  function blockKeys(event){
    if(!state.active||!['Enter',' '].includes(event.key)||state.ui?.contains(event.target))return;
    if(event.target.closest('#newBtn,#rulesBtn,#rulesDialog'))return;
    const target=document.querySelector(STEPS[state.stage].target);
    if(!STEPS[state.stage].next&&state.stage!=='complete'&&target?.contains(event.target))return;
    event.preventDefault();event.stopImmediatePropagation();
  }
  function queuePosition(){if(!state.active||state.raf)return;const epoch=state.epoch;state.raf=requestAnimationFrame(()=>{state.raf=0;if(epoch===state.epoch&&state.active)position()})}
  function position(){
    const ui=state.ui;if(!ui)return;const target=document.querySelector(STEPS[state.stage].target),shades=ui.querySelectorAll('.tutorial-shade'),frame=ui.querySelector('.tutorial-frame'),card=ui.querySelector('.tutorial-card');
    const vw=window.innerWidth,vh=window.innerHeight;
    if(!target){shades[0].style.cssText=`left:0;top:0;width:${vw}px;height:${vh}px`;for(let i=1;i<4;i++)shades[i].style.cssText='width:0;height:0';frame.style.display='none';card.style.cssText='left:12px;right:12px;bottom:12px;max-height:45vh';return}
    let rect=target.getBoundingClientRect();
    if(rect.bottom<80||rect.top>vh-24||(rect.height<vh-100&&(rect.top<72||rect.bottom>vh-16))){target.scrollIntoView({block:'center',behavior:'auto'});rect=target.getBoundingClientRect()}
    const x=Math.max(0,rect.left-6),y=Math.max(0,rect.top-6),r=Math.min(vw,rect.right+6),b=Math.min(vh,rect.bottom+6);
    const boxes=[[0,0,vw,y],[0,b,vw,vh-b],[0,y,x,b-y],[r,y,vw-r,b-y]];
    shades.forEach((shade,i)=>{const [left,top,width,height]=boxes[i];shade.style.cssText=`left:${left}px;top:${top}px;width:${Math.max(0,width)}px;height:${Math.max(0,height)}px`});
    frame.style.display='block';frame.style.cssText=`left:${x}px;top:${y}px;width:${Math.max(0,r-x)}px;height:${Math.max(0,b-y)}px`;
    const upper=y,lower=vh-b,below=lower>=upper;
    card.style.cssText=`left:12px;right:12px;${below?`top:${Math.min(vh-110,b+12)}px`:`bottom:${Math.min(vh-110,vh-y+12)}px`};max-height:${Math.max(100,(below?lower:upper)-24)}px`;
  }
  document.querySelector('#tutorialStartBtn').addEventListener('click',start);
  document.querySelector('#tutorialHeaderBtn').addEventListener('click',start);
  return controller;
}
return{createTutorialGame,STEPS,snapshot,allowsAction,advanceAfterAction,createController};
});
