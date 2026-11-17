/* Decorative atmosphere stays inert; user controls retain the original event model. */
(() => {
  const hero=document.querySelector('#hero-feature');
  const atmosphere=document.createElement('div');
  atmosphere.className='ice-atmosphere';atmosphere.setAttribute('aria-hidden','true');
  atmosphere.innerHTML='<i class="ice-cube"></i>'.repeat(3)+[9,5,12,6,4,7].map((size,i)=>`<i class="fizz-dot" style="--bubble-size:${size}px;--bubble-x:${[12,87,80,20,92,7][i]}%;--bubble-delay:${[-2,-5,-1,-4,-6,-3][i]}s"></i>`).join('');
  const ensureHeroDecor=()=>{
    if(!hero.querySelector('.ice-atmosphere'))hero.prepend(atmosphere);
    const hint=hero.querySelector('.feature-hint');
    if(hint&&!hint.querySelector('[data-step-card]')){
      hint.insertAdjacentHTML('afterbegin','<button type="button" class="card-step" data-step-card="-1" aria-label="选择上一张推荐牌"><svg class="icon" aria-hidden="true"><use href="#i-back"/></svg></button>');
      hint.insertAdjacentHTML('beforeend','<button type="button" class="card-step" data-step-card="1" aria-label="选择下一张推荐牌"><svg class="icon" aria-hidden="true"><use href="#i-arrow"/></svg></button>');
    }
  };
  ensureHeroDecor();new MutationObserver(ensureHeroDecor).observe(hero,{childList:true});
  document.addEventListener('click',event=>{
    const step=event.target.closest('[data-step-card]');
    if(!step||featuredDraw.busy||hero.dataset.drawState!=='choosing')return;
    const cards=[...hero.querySelectorAll('[data-pick-feature]')];
    const current=cards.findIndex(card=>card.classList.contains('is-armed'));
    const index=current<0?(Number(step.dataset.stepCard)>0?0:cards.length-1):(current+Number(step.dataset.stepCard)+cards.length)%cards.length;
    cards.forEach((card,i)=>{card.classList.toggle('is-armed',i===index);card.setAttribute('aria-pressed',String(i===index));});
    window.syncMobileInterface?.();
    document.querySelector('#feature-announcement').textContent=`已选第 ${index+1} 张，点击揭晓查看饮品。`;
  });
  const discovery=document.querySelector('#zero-discovery');
  const newDrinks=DRINKS.filter(drink=>['peach-jasmine-soda','berry-coconut-cloud'].includes(drink.id));
  discovery.innerHTML=`<div class="zero-intro"><h2>不含酒精，也很尽兴。</h2><p>两杯新风味，把茶香和果香留给今晚。</p></div><div class="zero-list">${newDrinks.map(drink=>`<button class="zero-suggestion" data-detail="${drink.id}" aria-label="查看${drink.cn}配方"><img src="${drink.image}" width="100" height="100" alt="" loading="lazy" decoding="async"><span><strong>${drink.cn}</strong><small>新品 · 无酒精</small></span></button>`).join('')}</div>`;
  const grid=document.querySelector('#drink-grid');
  const addBubbles=()=>{
    grid.querySelectorAll('.drink-open').forEach(button=>{
      if(button.querySelector('.glass-bubbles'))return;
      const drink=DRINKS.find(item=>item.id===button.dataset.detail);
      if(!drink||!['fresh','fruity','tea'].includes(drink.flavor))return;
      const bubbles=document.createElement('span');bubbles.className='glass-bubbles';bubbles.setAttribute('aria-hidden','true');
      bubbles.innerHTML='<i style="--size:7px;--left:18%"></i><i style="--size:4px;--left:80%"></i><i style="--size:10px;--left:74%"></i>';
      button.append(bubbles);
    });
  };
  addBubbles();new MutationObserver(addBubbles).observe(grid,{childList:true});
  const syncVisibility=()=>document.body.classList.toggle('page-backgrounded',document.hidden);
  document.addEventListener('visibilitychange',syncVisibility);syncVisibility();
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{
    document.body.classList.toggle('hero-out-of-view',!entries[0].isIntersecting);
  }).observe(hero);
})();
