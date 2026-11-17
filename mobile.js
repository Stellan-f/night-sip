/* Mobile navigation and native controls; no hover or synthetic gesture dependency. */
(() => {
  function syncMobileInterface() {
    const compact=isCompactViewport();
    document.querySelectorAll('[data-mobile-total]').forEach(node=>node.textContent=`${DRINKS.length} 款风味`);
    document.querySelectorAll('[data-mobile-saved-count]').forEach(node=>{node.textContent=state.saved.size;node.dataset.empty=String(state.saved.size===0);});
    document.querySelectorAll('.mobile-nav-button').forEach(button=>{
      const active=button.dataset.view===state.view;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    const armed=[...document.querySelectorAll('[data-pick-feature]')].find(card=>card.classList.contains('is-armed'));
    const hero=document.querySelector('#hero-feature');
    hero.classList.toggle('has-armed-card',compact&&hero.dataset.drawState==='choosing'&&Boolean(armed));
    const reveal=document.querySelector('[data-confirm-feature]');
    if(reveal){
      reveal.hidden=!compact||!armed||document.querySelector('#hero-feature').dataset.drawState!=='choosing';
      reveal.disabled=featuredDraw.busy;
      if(armed){reveal.querySelector('span').textContent=`揭晓第 ${Number(armed.dataset.pickFeature)+1} 张`;reveal.setAttribute('aria-label',`揭晓第${Number(armed.dataset.pickFeature)+1}张推荐牌`);}
    }
    const hint=document.querySelector('.draw-hint-message [data-hint-copy]');
    const portrait=window.matchMedia('(max-width:760px) and (orientation:portrait)').matches;
    const hand=document.querySelector('.draw-hand-scroll');
    if(hand)hand.setAttribute('aria-label',portrait?'七张完整展示的推荐手牌':'可左右滑动的推荐手牌');
    if(hint)hint.textContent=portrait?'轻点挑一张，再点揭晓':compact?'左右滑动挑牌，轻点抬起':window.matchMedia('(hover:none)').matches?'轻点挑牌，再点揭晓':'悬停挑选，点击揭晓';
    const dock=document.querySelector('.mobile-match-dock');
    const showDock=compact&&state.view==='quiz'&&state.selectionMode==='pantry'&&state.stock.size>0;
    dock.hidden=!showDock;document.body.classList.toggle('has-mobile-match',showDock);
    if(showDock){
      const ready=matchPantry(DRINKS,state.stock,state.onlyZero).filter(result=>!result.missing.length).length;
      dock.querySelector('span').textContent=`已选 ${state.stock.size} 种原料`;
      dock.querySelector('button').textContent=ready?`查看 ${ready} 杯推荐`:'看看还差什么';
      dock.querySelector('button').disabled=selectionMotion.busy;
    }
    document.querySelectorAll('details[data-stock-group]').forEach(group=>{
      const count=[...group.querySelectorAll('[data-stock]')].filter(button=>button.getAttribute('aria-pressed')==='true').length;
      group.querySelector('[data-group-count]').textContent=count?`已选 ${count}`:'';
    });
  }
  window.syncMobileInterface=syncMobileInterface;
  document.addEventListener('click',event=>{if(event.target.closest('[data-mobile-pantry-find]'))showPantryResults();});
  const layout=window.matchMedia('(max-width:760px), (max-width:960px) and (max-height:500px)');
  layout.addEventListener('change',()=>{
    selectionMotion.finish?.(false);featuredDraw.finish?.();
    if(state.view==='quiz'&&state.selectionMode==='pantry')renderPantry();
    syncMobileInterface();
  });
  let layoutWidth=window.innerWidth,layoutHeight=window.innerHeight;
  window.addEventListener('resize',()=>{
    if(window.innerWidth===layoutWidth&&window.innerHeight===layoutHeight)return;
    layoutWidth=window.innerWidth;layoutHeight=window.innerHeight;
    selectionMotion.finish?.(false);featuredDraw.finish?.();
    syncMobileInterface();
    queueFeaturedReturnPreparation();
  },{passive:true});
  const updateKeyboard=()=>{
    const field=document.activeElement?.matches('input,textarea');
    const keyboard=isCompactViewport()&&field&&window.visualViewport&&window.innerHeight-window.visualViewport.height>150;
    document.body.classList.toggle('mobile-keyboard-open',Boolean(keyboard));
  };
  window.visualViewport?.addEventListener('resize',updateKeyboard);
  document.addEventListener('focusin',updateKeyboard);document.addEventListener('focusout',()=>requestAnimationFrame(updateKeyboard));
  syncMobileInterface();
})();
