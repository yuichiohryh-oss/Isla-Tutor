'use strict';
const renderDecisionBase=renderDecision;
renderDecision=function(){
  const p=game?.s?.pending;
  const el=document.querySelector('#decisionBody');
  if(p?.type==='mayorBonus'){
    el.innerHTML='<h2>親方の特権</h2><p>予備から入植者を1人追加で受け取れます。</p><div class="choices"><button class="choice" data-extra="1"><b>受け取る</b><small>入植者を1人追加</small></button><button class="choice" data-extra="0"><b>受け取らない</b><small>追加しない</small></button></div>';
    el.querySelectorAll('[data-extra]').forEach(b=>b.onclick=()=>act('mayorBonus',{take:b.dataset.extra==='1'}));return;
  }
  if(p?.type==='hospice'||p?.type==='university'){
    const isHospice=p.type==='hospice',title=isHospice?'救護所':'大学';
    el.innerHTML=`<h2>${title}を使いますか？</h2><p>${isHospice?'取得した農園・採石場':'新築した建物'}に入植者を1人置けます。</p><div class="choices"><button class="choice" data-extra="1"><b>使う</b><small>入植者を配置</small></button><button class="choice" data-extra="0"><b>使わない</b><small>今回は温存</small></button></div>`;
    el.querySelectorAll('[data-extra]').forEach(b=>b.onclick=()=>act(p.type,{use:b.dataset.extra==='1'}));return;
  }
  if(p?.type==='craftsmanProduce'){
    el.innerHTML='<h2>商品を生産しますか？</h2><p>監督フェーズの生産は任意です。生産すると稼働中の農園と工場に応じて商品を得ます。</p><div class="choices"><button class="choice" data-produce="1"><b>生産する</b><small>生産可能な商品を受け取る</small></button><button class="choice" data-produce="0"><b>見送る</b><small>今回は商品を受け取らない</small></button></div>';
    el.querySelectorAll('[data-produce]').forEach(b=>b.onclick=()=>act('craftsmanProduce',{produce:b.dataset.produce==='1'}));return;
  }
  if(p?.type==='craftsmanBonus'){
    el.innerHTML=`<h2>追加生産する商品</h2><p>今回生産した種類から任意で1個を得られます。</p><div class="choices">${p.options.map(g=>choiceButton(GOODS[g].name,'1個追加',`data-bonus-good="${g}"`)).join('')}${choiceButton('受け取らない','特権を使わない','data-skip-bonus')}</div>`;
    el.querySelectorAll('[data-bonus-good]').forEach(b=>b.onclick=()=>act('craftsmanBonus',{good:b.dataset.bonusGood}));el.querySelector('[data-skip-bonus]').onclick=()=>act('craftsmanBonus',{good:null});return;
  }
  if(p?.type==='harbor'){
    el.innerHTML='<h2>港を使いますか？</h2><p>今の出荷に対して追加で1VPを得られます。</p><div class="choices"><button class="choice" data-harbor="1"><b>使う</b><small>1VPを追加</small></button><button class="choice" data-harbor="0"><b>使わない</b><small>追加点を受け取らない</small></button></div>';
    el.querySelectorAll('[data-harbor]').forEach(b=>b.onclick=()=>act('harbor',{use:b.dataset.harbor==='1'}));return;
  }
  if(p?.type==='captainPrivilege'){
    el.innerHTML='<h2>船長の特権を使いますか？</h2><p>最初の出荷に対して追加で1VPを得られます。</p><div class="choices"><button class="choice" data-captain-bonus="1"><b>使う</b><small>1VPを追加</small></button><button class="choice" data-captain-bonus="0"><b>使わない</b><small>追加点を受け取らない</small></button></div>';
    el.querySelectorAll('[data-captain-bonus]').forEach(b=>b.onclick=()=>act('captainPrivilege',{use:b.dataset.captainBonus==='1'}));return;
  }
  renderDecisionBase();
  if(p?.type==='settler'){
    const box=el.querySelector('.choices');
    const skip=document.createElement('button');skip.className='choice';skip.innerHTML='<b>見送る</b><small>農園・採石場を取らない</small>';skip.onclick=()=>act('settler',{choice:null});box?.appendChild(skip);
  }
};
const staffChangeBase=staffChange;
staffChange=function(kind,index,delta){staffChangeBase(kind,index,delta);document.querySelector(`[data-staff][data-kind="${kind}"][data-index="${index}"][data-delta="${delta}"]`)?.focus()};
document.querySelector('#resumeBtn').onclick=()=>{
  try{
    const raw=localStorage.getItem(SAVE_KEY);if(!raw)throw Error('保存データがありません');
    game=Game.restore(JSON.parse(raw));showGame();game.s.phase==='end'?render():advance();
  }catch(e){localStorage.removeItem(SAVE_KEY);document.querySelector('#resumeBtn').classList.add('hidden');alert('保存データを読み込めませんでした。新しいゲームを開始してください。')}
};
