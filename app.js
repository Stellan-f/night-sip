'use strict';
const $ = selector => document.querySelector(selector);
function isCompactViewport(){return window.matchMedia('(max-width:760px), (max-width:960px) and (max-height:500px)').matches;}
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const flavorNames = {all:'都可以', sour:'清爽酸甜', bitter:'苦甜草本', dry:'冷冽干爽', rich:'圆润醇厚', fresh:'清新气泡', fruity:'明亮果香', tea:'花香茶韵'};
const baseNames = {all:'不限基酒', gin:'金酒', tequila:'龙舌兰', rum:'朗姆', whiskey:'威士忌', vodka:'伏特加', none:'无酒精'};
const bodyNames = {all:'酒体随心', light:'轻盈利落', bold:'饱满悠长', silky:'绵密柔滑'};
const state = {view:'menu', filters:{query:'', flavor:'all', base:'all', category:'all'}, step:0, answers:{}, saved:new Set(), detail:null, selectionMode:'taste', stock:new Set(), onlyZero:false};
const categoryNames = {classic:'经典', signature:'原创特调', zero:'无酒精'};
let storageAvailable = true, toastTimer, detailTrigger, detailShakeAnimation;
const menuReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const menuMotion = {revision:0, key:null, pending:false, animations:[]};
const viewMotion = {revision:0, animation:null};
const detailMotion = {revision:0, animations:[], closing:false, overflow:''};
const selectionMotion = {revision:0, animations:[], displayed:'taste', busy:false, finish:null};
const featuredDraw = {busy:false, revision:0, animations:[], hero:null, finish:null, frame:0, cancelParticles:null, choices:[], shake:null};
const featuredReturnCache = {key:null, model:null, timer:0};
const featuredGlyphCache = new Map();
const FEATURED_GATHER_MS=1780, FEATURED_RESOLVE_MS=360;
const FEATURED_PHOTO_START_MS=FEATURED_GATHER_MS*.92;
const FEATURED_REVEAL_MS=FEATURED_PHOTO_START_MS+FEATURED_RESOLVE_MS;
let featuredId;
try { featuredId = sessionStorage.getItem('between-five-featured-v1'); } catch {}
try {
  const saved = JSON.parse(localStorage.getItem('between-five-favorites-v2') || '[]');
  state.saved = new Set(Array.isArray(saved) ? saved.filter(id => DRINKS.some(d => d.id === id)) : []);
} catch { storageAvailable = false; }
function toast(message) {
  const node = $('#toast'); node.textContent = message; node.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 3000);
}
function glassIllustration(d) {
  return d.art
    ? d.art.replace('<svg ', '<svg class="glass-art" aria-hidden="true" focusable="false" ')
    : `<svg class="glass-art" viewBox="0 0 54 54" fill="none" stroke="var(--drink)" stroke-width="1.2" aria-hidden="true" focusable="false"><use href="#i-glass" x="15" y="15" width="24" height="24"/></svg>`;
}
function glass(d) {
  return d.image
    ? `<img class="glass-art drink-photo photo-${d.id}" src="${d.image}" alt="" width="1280" height="1280" decoding="async" loading="lazy" draggable="false">`
    : glassIllustration(d);
}
function style(d) { return `--drink:${d.color};--surface:${d.surface}`; }
function saveButton(d, extra = '') {
  const saved = state.saved.has(d.id);
  return `<button class="${extra || 'icon-button save-button'}" data-save="${d.id}" aria-pressed="${saved}" aria-label="${saved ? '取消收藏' : '收藏'}${d.cn}">${icon('heart')}${extra ? (saved ? '已收藏' : '加入我的酒单') : ''}</button>`;
}
function card(d) {
  return `<article class="drink-card" style="${style(d)}"><div class="drink-visual"><button class="drink-open" data-detail="${d.id}" aria-label="查看${d.cn}配方">${glass(d)}<span class="drink-kind kind-${d.category}">${categoryNames[d.category]}</span><span class="card-note">${d.note}</span></button>${saveButton(d)}</div><div class="card-body"><div class="card-heading"><button class="name-button" data-detail="${d.id}"><h3>${d.name}</h3><span>${d.cn}</span></button><button class="icon-button" data-detail="${d.id}" aria-label="查看${d.cn}详情">${icon('arrow')}</button></div><div class="card-tags"><span>${d.tag}</span><span>${d.baseName}</span></div><p class="card-description">${d.short}</p></div></article>`;
}
const catalogResponse = {animations:[]};
function stopCatalogResponse() {
  catalogResponse.animations.forEach(animation=>animation.cancel());
  catalogResponse.animations=[];
}
function animateCatalogResponse(kind) {
  // The moving capsule and the cards provide the response; metadata stays still.
  stopCatalogResponse();
}
function animateMenuEntries(nodes, restoring = false, snapshots = []) {
  const compact = isCompactViewport();
  const identity = 'perspective(1100px) translate3d(0, 0, 0) rotateX(0deg)';
  const visible = nodes.filter(node => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight + 40;
  });
  visible.forEach((node, index) => {
    const snapshot = snapshots.find(item => item.node === node);
    const animation = node.animate([
      {opacity:restoring ? snapshot.opacity : 0, transform:restoring ? snapshot.transform : `perspective(1100px) translate3d(0, ${compact ? 18 : 24}px, ${compact ? -90 : -130}px) rotateX(${compact ? 2 : 4}deg)`},
      {opacity:1, transform:identity}
    ], {duration:restoring ? 240 : compact ? 360 : 400, delay:restoring ? 0 : Math.min(index,4) * 28, easing:'cubic-bezier(.16, 1, .3, 1)', fill:'backwards'});
    menuMotion.animations.push(animation);
  });
}
function renderMenu({animate = true} = {}) {
  const list = filterDrinks(DRINKS, state.filters);
  const grid = $('#drink-grid');
  const key = list.map(drink => drink.id).join('|');
  const shouldAnimate = animate && state.view === 'menu' && !menuReducedMotion.matches && typeof grid.animate === 'function';
  $('#result-count').textContent = `${list.length} 款风味${list.length < DRINKS.length ? ` / 共 ${DRINKS.length} 款` : ''}`;
  $('#reset-filters').hidden = !state.filters.query && state.filters.flavor === 'all' && state.filters.base === 'all' && state.filters.category === 'all';
  if (key === menuMotion.key && !menuMotion.pending && shouldAnimate) return;
  const revision = ++menuMotion.revision;
  const nodes = [...grid.children];
  // Sample before canceling so a fast change continues from the visible pose.
  const snapshots = nodes.map(node => ({node, opacity:getComputedStyle(node).opacity, transform:getComputedStyle(node).transform}));
  menuMotion.animations.forEach(animation => animation.cancel());
  menuMotion.animations = [];
  grid.inert = false;
  grid.removeAttribute('aria-busy');
  if (key === menuMotion.key && shouldAnimate) {
    menuMotion.pending = false;
    animateMenuEntries(nodes, true, snapshots);
    return;
  }
  const commit = () => {
    if (revision !== menuMotion.revision) return;
    menuMotion.animations.forEach(animation => animation.cancel());
    menuMotion.animations = [];
    grid.innerHTML = list.map(drink => `<div class="drink-arrival" data-drink="${drink.id}">${card(drink)}</div>`).join('');
    $('#menu-empty').hidden = list.length > 0;
    grid.inert = false;
    grid.removeAttribute('aria-busy');
    menuMotion.key = key;
    menuMotion.pending = false;
    if (shouldAnimate) animateMenuEntries([...grid.children]);
  };
  const departing = snapshots.filter(({node}) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight + 40;
  });
  if (!shouldAnimate || !departing.length) {commit(); return;}
  menuMotion.pending = true;
  grid.inert = true;
  grid.setAttribute('aria-busy', 'true');
  const exits = departing.map(({node, opacity, transform}) => node.animate([
    {opacity, transform},
    {opacity:0, transform:'perspective(1100px) translate3d(0, 5px, -55px) rotateX(2deg)'}
  ], {duration:130, easing:'cubic-bezier(.4, 0, 1, 1)', fill:'forwards'}));
  menuMotion.animations.push(...exits);
  Promise.all(exits.map(animation => animation.finished.catch(() => {}))).then(commit);
}
function renderSaved() {
  const saved = DRINKS.filter(d => state.saved.has(d.id));
  $('#saved-grid').innerHTML = saved.map(card).join('');
  $('#saved-empty').hidden = saved.length > 0;
  $('#saved-count').textContent = saved.length;
  $('.saved-nav').setAttribute('aria-label', `我的酒单，${saved.length} 款收藏`);
}
function resetFilters() {
  state.filters = {query:'', flavor:'all', base:'all', category:'all'};
  $('#search').value = ''; syncBasePicker(); closeBasePicker();
  document.querySelectorAll('[data-flavor]').forEach(b => {const selected = b.dataset.flavor === 'all'; b.classList.toggle('selected', selected); b.setAttribute('aria-pressed', selected);});
  document.querySelectorAll('[data-category]').forEach(b => {const selected = b.dataset.category === 'all'; b.classList.toggle('selected',selected); b.setAttribute('aria-pressed',selected);});
  renderMenu();animateCatalogResponse('reset');
}
function stopViewTransition() {
  viewMotion.revision++;
  viewMotion.animation?.cancel();
  viewMotion.animation = null;
}
function setView(view, focus = true) {
  if (!['menu','quiz','saved'].includes(view)) return;
  const changed = state.view !== view;
  stopViewTransition();
  closeBasePicker();
  selectionMotion.finish?.(false);stopSelectionTransition();
  stopCatalogResponse();
  if (featuredDraw.busy) stopFeaturedDraw();
  state.view = view;
  if (view !== 'menu' && menuMotion.animations.length) renderMenu({animate:false});
  ['menu','quiz','saved'].forEach(v => $(`#${v}-view`).hidden = v !== view);
  document.querySelectorAll('[data-view]').forEach(b => {
    if (!b.matches('.nav,.saved-nav,.mobile-nav-button')) return;
    b.classList.toggle('active', b.dataset.view === view);
    if (b.dataset.view === view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  if (view === 'quiz') setSelectionMode(state.selectionMode, false, false);
  if (view === 'saved') renderSaved();
  if (view === 'menu') renderFeaturedDrink();
  window.scrollTo({top:0, behavior:'instant'});
  if (focus && view !== 'menu') $(view === 'quiz' && state.selectionMode === 'pantry' ? '#pantry-title' : `#${view}-title`).focus({preventScroll:true});
  if (focus && view === 'menu') { const heading = $('#menu-view h1'); heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true}); }
  window.syncMobileInterface?.();
  const surface = $(`#${view}-view`);
  if (changed && !document.hidden && !menuReducedMotion.matches && typeof surface.animate === 'function') {
    const revision = viewMotion.revision;
    const animation = surface.animate([
      {opacity:0, transform:`translateY(${isCompactViewport() ? 10 : 14}px)`},
      {opacity:1, transform:'translateY(0)'}
    ], {duration:360, easing:'cubic-bezier(.16,1,.3,1)'});
    viewMotion.animation = animation;
    animation.finished.then(() => {if (revision === viewMotion.revision) viewMotion.animation = null;}, () => {});
  }
}
function selectionSurface(mode) {return $(mode==='pantry'?'#pantry-surface':'.quiz-layout');}
function stopSelectionTransition() {
  selectionMotion.revision++;
  selectionMotion.animations.forEach(animation=>animation.cancel());
  selectionMotion.animations=[];
  selectionMotion.busy=false;
  selectionMotion.finish=null;
  const content=$('#selection-content');
  content.inert=false;content.removeAttribute('aria-busy');content.dataset.modePhase='idle';
  window.syncMobileInterface?.();
}
function showSelectionMode(mode, focus=false, animatePanel=true) {
  selectionMotion.displayed=mode;
  $('.quiz-layout').hidden=mode!=='taste';
  $('#pantry-surface').hidden=mode!=='pantry';
  const title=mode==='pantry'?'#pantry-title':'#quiz-title';
  $('#quiz-view').setAttribute('aria-labelledby',title.slice(1));
  document.querySelectorAll('[data-selectmode]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.selectmode===mode));
  if(mode==='taste')renderQuiz(false,animatePanel);else renderPantry();
  if(focus)$(title).focus({preventScroll:true});
}
async function setSelectionMode(mode, focus=true, animatePanel=true) {
  if(!['taste','pantry'].includes(mode))return;
  const desktop=!isCompactViewport();
  if(mode===state.selectionMode&&(selectionMotion.busy||focus))return;
  const outgoing=selectionSurface(selectionMotion.displayed);
  const pose=getComputedStyle(outgoing);
  const snapshot={opacity:pose.opacity,transform:pose.transform};
  const canFade=focus&&state.view==='quiz'&&!document.hidden&&!menuReducedMotion.matches&&typeof outgoing.animate==='function';
  stopSelectionTransition();
  state.selectionMode=mode;
  document.querySelectorAll('[data-selectmode]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.selectmode===mode));
  window.syncMobileInterface?.();
  if(!canFade){showSelectionMode(mode,focus,animatePanel);return;}
  if(!desktop&&window.scrollY>160)window.scrollTo({top:0,behavior:'smooth'});
  const revision=selectionMotion.revision,isCurrent=()=>revision===selectionMotion.revision;
  let switched=mode===selectionMotion.displayed;
  const complete=(moveFocus=focus)=>{
    if(!isCurrent())return;
    if(!switched){showSelectionMode(mode,false,false);switched=true;}
    stopSelectionTransition();
    if(moveFocus)$(mode==='pantry'?'#pantry-title':'#quiz-title').focus({preventScroll:true});
  };
  selectionMotion.busy=true;selectionMotion.finish=complete;window.syncMobileInterface?.();
  const content=$('#selection-content');content.inert=true;content.setAttribute('aria-busy','true');
  const play=async(surface,frames,duration,easing)=>{
    const animation=surface.animate(frames,{duration,easing,fill:'both'});
    selectionMotion.animations.push(animation);
    await animation.finished.catch(()=>{});
  };
  try {
    if(!switched){
      content.dataset.modePhase='leaving';
      await play(outgoing,[snapshot,{opacity:0,transform:desktop?'scale(.99)':'none'}],desktop?130:110,'cubic-bezier(.4,0,1,1)');
      if(!isCurrent())return;
      showSelectionMode(mode,false,false);switched=true;
    }
    content.dataset.modePhase='entering';
    const incoming=selectionSurface(mode);
    await play(incoming,[incoming===outgoing?snapshot:{opacity:0,transform:desktop?'scale(.985)':'none'},{opacity:1,transform:'none'}],incoming===outgoing?220:desktop?300:260,'cubic-bezier(.16,1,.3,1)');
    complete();
  } catch {complete();}
}

function filterPantryOptions() {
  const query = $('#pantry-search').value.trim().toLocaleLowerCase();
  document.querySelectorAll('[data-stock]').forEach(button => {
    const item = PANTRY_ITEMS.find(item => item.id === button.dataset.stock);
    button.hidden = !`${item.label} ${item.aliases}`.toLocaleLowerCase().includes(query);
  });
  document.querySelectorAll('[data-stock-group]').forEach(group=>{
    group.hidden=![...group.querySelectorAll('[data-stock]')].some(button=>!button.hidden);
    if(group.tagName==='DETAILS'){
      if(query){if(!('beforeSearch' in group.dataset))group.dataset.beforeSearch=String(group.open);group.open=!group.hidden;}
      else if('beforeSearch' in group.dataset){group.open=group.dataset.beforeSearch==='true';delete group.dataset.beforeSearch;}
    }
  });
  $('#pantry-empty-search').hidden = [...document.querySelectorAll('[data-stock]')].some(button => !button.hidden);
}
function pantryResultCard(result) {
  const d = result.drink, ready = result.missing.length === 0;
  return `<article class="pantry-result" style="${style(d)}"><div class="pantry-result-head"><div class="pantry-result-art">${glass(d)}</div><div><span class="pantry-badge ${ready ? '' : 'missing'}">${ready ? '原料已齐' : `还缺 ${result.missing.length} 样`}</span><h3>${d.cn}</h3><p>${d.name} · ${d.baseName}</p></div></div><p class="pantry-match">已选 ${result.matched} / ${result.total} 项配方原料（含冰块）</p><p class="pantry-missing">${ready ? '这杯的主料和冰块都已选，核对用量后就可以准备了。' : `还需要：${result.missing.join('、')}`}</p><div class="pantry-result-actions"><button class="button secondary" data-detail="${d.id}">查看配方 ${icon('arrow')}</button>${saveButton(d)}</div></article>`;
}
function renderPantry() {
  const compact=isCompactViewport(),options=$('#pantry-options'),layout=compact?'compact':'wide';
  if (!options.children.length||options.dataset.layout!==layout) {
    options.innerHTML=PANTRY_GROUPS.map((group,index)=>{
      const chips=group.items.map(([id,label])=>`<button type="button" class="stock-chip" data-stock="${id}" aria-pressed="false">${icon('check')}<span>${label}</span></button>`).join('');
      return compact?`<details class="pantry-group" data-stock-group ${index===0||group.items.some(([id])=>state.stock.has(id))?'open':''}><summary>${group.name}<span data-group-count></span></summary><div class="pantry-options">${chips}</div></details>`:`<fieldset class="pantry-group" data-stock-group><legend>${group.name}</legend><div class="pantry-options">${chips}</div></fieldset>`;
    }).join('');options.dataset.layout=layout;
  }
  document.querySelectorAll('[data-stock]').forEach(button => button.setAttribute('aria-pressed', state.stock.has(button.dataset.stock)));
  $('#pantry-zero').checked = state.onlyZero;
  $('#pantry-selected-count').textContent = `已选 ${state.stock.size} 种原料`;
  $('#pantry-clear').disabled = !state.stock.size;
  $('#pantry-find').disabled = !state.stock.size;
  filterPantryOptions();
  const matches = matchPantry(DRINKS, state.stock, state.onlyZero);
  const ready = matches.filter(result => !result.missing.length);
  const near = matches.filter(result => result.missing.length).slice(0,3);
  $('#pantry-status').textContent = !state.stock.size ? `在当前 ${DRINKS.length} 款风味酒单中匹配。` : `${ready.length} 款原料已齐 · ${near.length} 款可补齐比较${state.onlyZero ? ' · 仅无酒精' : ''}`;
  $('#pantry-results-body').innerHTML = !state.stock.size
    ? `<div class="pantry-placeholder">${icon('glass')}<h3>先看看家里有什么。</h3><p>选中已有的材料，推荐会出现在这里。<br>也可以先体验一组朗姆、青柠、糖和冰块。</p><button class="quiet" data-pantry-demo>试选酸甜组合 ${icon('arrow')}</button></div>`
    : matches.length ? [...ready,...near].map(pantryResultCard).join('')
    : `<div class="pantry-placeholder">${icon('search')}<h3>这组材料暂时配不上现有酒单。</h3><p>${state.onlyZero ? '试试选择水果、糖浆与苏打水。' : '酒精款需要先选中它的基酒；也可以试试水果与苏打水的无酒精搭配。'}<br>未选中的基酒不会被当作你已经拥有。</p></div>`;
  window.syncMobileInterface?.();
}
function showPantryResults() {
  $('#pantry-results').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth'});
  $('#pantry-results-title').focus({preventScroll:true});
}
function toggleSave(id, trigger) {
  const d = DRINKS.find(x => x.id === id); if (!d) return;
  const saving = !state.saved.has(id);
  if (saving) state.saved.add(id); else state.saved.delete(id);
  try { localStorage.setItem('between-five-favorites-v2', JSON.stringify([...state.saved])); }
  catch { storageAvailable = false; }
  // 保留焦点所在按钮，避免收藏时重建当前列表。
  document.querySelectorAll(`[data-save="${id}"]`).forEach(b => {
    b.setAttribute('aria-pressed', saving); b.setAttribute('aria-label', `${saving ? '取消收藏' : '收藏'}${d.cn}`);
    if (!b.classList.contains('save-button') && !b.closest('.pantry-result')) b.innerHTML = `${icon('heart')}${saving ? '已收藏' : '加入我的酒单'}`;
  });
  $('#saved-count').textContent = state.saved.size;
  $('.saved-nav').setAttribute('aria-label', `我的酒单，${state.saved.size} 款收藏`);
  if (state.view === 'saved') {
    renderSaved();
    // A native modal owns focus while open, even when its background list changes.
    if (!$('#detail-dialog').open) {
      const next = $('#saved-grid [data-save]'); (next || $('#saved-title')).focus({preventScroll:true});
    }
  }
  window.syncMobileInterface?.();
  toast(`${saving ? '已收藏' : '已从酒单移除'}${d.cn}${!storageAvailable ? '（仅本次浏览有效）' : ''}`);
}
function stopDetailShake() {
  detailShakeAnimation?.cancel();
  detailShakeAnimation = null;
}
function shakeDetail(button) {
  const image = button.querySelector('.glass-art'); if (!image || typeof image.animate !== 'function') return;
  stopDetailShake();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frames = reduced ? [{opacity:1}, {opacity:.78}, {opacity:1}] : [
    {transform:'translateX(0) rotate(0deg)', offset:0},
    {transform:'translateX(-6px) rotate(-7deg)', offset:.16},
    {transform:'translateX(6px) rotate(6deg)', offset:.34},
    {transform:'translateX(-4px) rotate(-4deg)', offset:.51},
    {transform:'translateX(3px) rotate(2.5deg)', offset:.68},
    {transform:'translateX(-1px) rotate(-1deg)', offset:.84},
    {transform:'translateX(0) rotate(0deg)', offset:1}
  ];
  const animation = image.animate(frames, {duration:reduced ? 180 : 800, easing:'ease-in-out'});
  detailShakeAnimation = animation;
  animation.finished.then(() => {
    if (detailShakeAnimation === animation) detailShakeAnimation = null;
  }, () => {});
}
function stopDetailTransition() {
  detailMotion.revision++;
  detailMotion.animations.forEach(animation => animation.cancel());
  detailMotion.animations = [];
  detailMotion.closing = false;
}
function animateDetailBackdrop(from, to, duration) {
  const dialog = $('#detail-dialog');
  // Older engines may implement dialog and WAAPI without pseudo-element effects.
  try {
    const animation = dialog.animate([{opacity:from}, {opacity:to}], {duration, easing:'ease-out', pseudoElement:'::backdrop'});
    if (animation.effect?.pseudoElement !== '::backdrop') {animation.cancel(); return;}
    detailMotion.animations.push(animation);
    animation.finished.catch(() => {});
  } catch {}
}
function closeDetail(animate = true) {
  const dialog = $('#detail-dialog');
  if (!dialog.open || (detailMotion.closing && animate)) return;
  const pose = getComputedStyle(dialog), snapshot = {opacity:pose.opacity, transform:pose.transform};
  stopDetailTransition();
  stopDetailShake();
  if (!animate || document.hidden || menuReducedMotion.matches || typeof dialog.animate !== 'function') {dialog.close(); finishDetailClose(); return;}
  detailMotion.closing = true;
  const revision = detailMotion.revision;
  const animation = dialog.animate([snapshot, {opacity:0, transform:`translateY(${isCompactViewport() ? 22 : 10}px)`}], {duration:170, easing:'cubic-bezier(.4,0,1,1)', fill:'forwards'});
  detailMotion.animations.push(animation);
  animateDetailBackdrop(1, 0, 170);
  animation.finished.then(() => {
    if (revision === detailMotion.revision && dialog.open) {dialog.close(); finishDetailClose();}
  }, () => {});
}
function finishDetailClose() {
  if ($('#detail-dialog').open || state.detail === null) return;
  stopDetailTransition(); stopDetailShake();
  document.body.style.overflow = detailMotion.overflow; state.detail = null;
  restoreDetailFocus();
}
function restoreDetailFocus() {
  const visible = node => node?.isConnected && !node.disabled && !node.closest('[hidden],[inert]') && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
  const surface = $(`#${state.view}-view`);
  const alternatives = [detailTrigger, ...surface.querySelectorAll('[data-detail],[data-save]'), $(state.view === 'menu' ? '#menu-view h1' : state.view === 'quiz' && state.selectionMode === 'pantry' ? '#pantry-title' : `#${state.view}-title`)];
  const target = alternatives.find(visible);
  if (target) {if (target.matches('h1,h2')) target.setAttribute('tabindex','-1'); target.focus({preventScroll:true});}
  detailTrigger = null;
}
function openDetail(id, trigger) {
  const d = DRINKS.find(x => x.id === id); if (!d) return;
  const dialog = $('#detail-dialog'), wasOpen = dialog.open, previousDetail = state.detail;
  const pose = wasOpen ? getComputedStyle(dialog) : null;
  const snapshot = pose ? {opacity:pose.opacity, transform:pose.transform} : {opacity:0, transform:`translateY(${isCompactViewport() ? 26 : 16}px)`};
  stopDetailTransition();
  stopDetailShake();
  state.detail = id;
  if (!wasOpen) {detailTrigger = trigger || document.activeElement; if (!previousDetail) detailMotion.overflow = document.body.style.overflow;}
  $('#detail-content').innerHTML = `<div class="detail-layout" style="${style(d)}"><div class="detail-art"><div class="detail-stage"><button type="button" class="detail-shake" data-shake="${d.id}" aria-label="摇一摇${d.cn}酒杯" aria-describedby="detail-shake-hint">${glass(d)}</button><p class="detail-hint" id="detail-shake-hint">轻点酒杯，摇一摇</p></div></div><div class="detail-copy"><h2 id="detail-title">${d.name}</h2><h3>${d.cn}</h3><div class="card-tags"><span>${d.tag}</span><span>${d.baseName}</span></div><p>${d.description}</p><div class="flavor-journey"><h4>风味路径</h4><ol>${d.layers.map((layer,i) => `<li><small>${['前段','中段','尾韵'][i]}</small><span>${layer}</span></li>`).join('')}</ol><p>口感：${d.texture}</p></div><div class="recipe"><h4>${d.category === 'classic' ? '经典配方 · 单杯' : d.category === 'signature' ? '原创概念配方 · 单杯' : '无酒精概念配方 · 单杯'}</h4><dl>${d.ingredients.map(([name, amount]) => `<div><dt>${name}</dt><dd>${amount}</dd></div>`).join('')}</dl></div><p>${d.method}</p>${(d.prepNote || d.prep) ? `<p class="prep-note">备料：${d.prepNote || d.prep}</p>` : ''}${(d.ingredientNote || d.allergen) ? `<p class="ingredient-note">${d.ingredientNote || d.allergen}</p>` : ''}${saveButton(d, 'button secondary')}<br>${d.source ? `<a class="recipe-source" href="${d.source}" target="_blank" rel="noopener noreferrer">查看 IBA 原始配方 ${icon('arrow')}</a>` : `<p class="concept-note">${d.conceptNote || '为本酒单设计的原创概念配方，尚未实调；甜酸与口感需按实际原料试调。图片为 AI 视觉示意。'}</p>`}</div></div>`;
  dialog.style.animation = 'none';
  if (!wasOpen) dialog.showModal();
  dialog.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  $('#close-detail').focus({preventScroll:true});
  if (!document.hidden && !menuReducedMotion.matches && typeof dialog.animate === 'function') {
    const animation = dialog.animate([snapshot, {opacity:1, transform:'none'}], {duration:320, easing:'cubic-bezier(.16,1,.3,1)'});
    detailMotion.animations.push(animation);
    animation.finished.catch(() => {});
    animateDetailBackdrop(wasOpen ? 1 : 0, 1, 260);
  }
}
const questions = [
  {key:'flavor', title:'第一口，喜欢什么味道？', hint:'从直觉出发，选最吸引你的一个。', options:[['sour','清爽酸甜','青柠的酸，明亮又利落'],['bitter','苦甜草本','苦橙与草本，层次慢慢展开'],['dry','冷冽干爽','清澈、干净，不以甜味为主'],['rich','圆润醇厚','咖啡、木香与烘焙回味'],['fresh','清新气泡','薄荷清香，气泡轻快'],['fruity','明亮果香','莓果、菠萝与椰香'],['tea','花香茶韵','茉莉、乌龙与水果的层次'],['all','还没想好','让下一步的偏好决定']]},
  {key:'base', title:'有没有偏爱的基酒？', hint:'指定基酒后，只推荐符合的饮品；无酒精也可以单独选择。', options:[['gin','金酒','杜松子与草本气息'],['tequila','龙舌兰','鲜明的植物气息'],['rum','朗姆','青柠、热带果香与香料'],['whiskey','威士忌','木质、香料与醇厚印象'],['vodka','伏特加','果香、咖啡与绵密口感'],['none','无酒精','只推荐无酒精配方'],['all','都可以','看看不同基酒的可能']]},
  {key:'body', title:'想要怎样的酒体？', hint:'描述口感与回味，不代表实际酒精浓度。', options:[['light','轻盈利落','偏爱干净、清爽的收尾'],['bold','饱满悠长','希望风味多停留一会儿'],['silky','绵密柔滑','偏爱椰香、细腻与包裹感'],['all','都可以','保持前两步的偏好']]}
];
function focusQuestion() {
  const heading = $('#question-title');
  if (isCompactViewport()) $('#quiz-panel').scrollIntoView({block:'start', behavior:'instant'});
  else window.scrollTo({top:0, behavior:'instant'});
  heading.focus({preventScroll:true});
}
function springPanel() {
  const panel = $('#quiz-panel');
  panel.getAnimations?.().forEach(animation => animation.cancel());
  if (menuReducedMotion.matches || typeof panel.animate !== 'function') return;
  panel.animate([
    {opacity:0, transform:'translateY(10px)'},
    {opacity:1, transform:'translateY(0)'}
  ], {duration:360, easing:'cubic-bezier(.16,1,.3,1)'});
}
function renderQuiz(focus = false, animate = true) {
  const result = state.step === questions.length;
  document.querySelectorAll('#quiz-steps li').forEach((li, i) => {li.classList.toggle('current', i === state.step); li.classList.toggle('done', i < state.step); if (i === state.step) li.setAttribute('aria-current','step'); else li.removeAttribute('aria-current');});
  if (result) {renderRecommendation(); if(animate)springPanel(); if (focus) focusQuestion(); return;}
  const q = questions[state.step], selected = state.answers[q.key];
  $('#quiz-panel').innerHTML = `<div class="step-counter">${String(state.step + 1).padStart(2,'0')} / 03</div><h2 id="question-title" tabindex="-1">${q.title}</h2><p class="question-hint">${q.hint}</p><div class="quiz-options" role="radiogroup" aria-labelledby="question-title">${q.options.map(([value, title, hint], i) => `<button type="button" class="quiz-option" role="radio" aria-checked="${value === selected}" tabindex="${value === selected || (selected === undefined && i === 0) ? 0 : -1}" data-answer="${value}"><span><strong>${title}</strong><small>${hint}</small></span></button>`).join('')}</div><p class="quiz-error" id="quiz-error" role="alert"></p><div class="quiz-actions"><button class="text-link" id="quiz-prev" ${state.step === 0 ? 'disabled' : ''}>${icon('back')}上一步</button><button class="button primary" id="quiz-next">${state.step === 2 ? '看看推荐' : '下一步'} ${icon('arrow')}</button></div>`;
  if(animate)springPanel();
  if (focus) focusQuestion();
}
function chooseAnswer(value) {
  const q = questions[state.step]; if (!q || !q.options.some(x => x[0] === value)) return;
  state.answers[q.key] = value;
  document.querySelectorAll('[data-answer]').forEach(b => {b.setAttribute('aria-checked', b.dataset.answer === value); b.tabIndex = b.dataset.answer === value ? 0 : -1;});
  $('#quiz-error').textContent = '';
}
function renderRecommendation() {
  const ranked = rankDrinks(DRINKS, state.answers), d = ranked[0];
  if (!d) {$('#quiz-panel').innerHTML = '<h2 id="question-title" tabindex="-1">暂时没有符合的饮品</h2><button class="button secondary" id="quiz-restart">重新选择</button>'; return;}
  const reasons = [];
  if (state.answers.base !== 'all') reasons.push(`${d.base === 'none' ? '这杯采用无酒精配方。' : `它以你选择的${d.baseName}为基酒。`}`);
  if (state.answers.flavor !== 'all') reasons.push(d.flavor === state.answers.flavor ? `它的${d.tag}呼应了你喜欢的风味。` : `当前酒单中，没有同时符合该基酒与“${flavorNames[state.answers.flavor]}”的选项；这杯更偏${d.tag}，供你比较。`);
  if (state.answers.body !== 'all') reasons.push(d.body === state.answers.body ? `酒体更接近你期待的${bodyNames[d.body]}。` : `它的酒体更偏${bodyNames[d.body]}，与你选择的印象有所不同。`);
  if (!reasons.length) reasons.push('你保留了全部可能，先从这杯经典的苦甜草本结构开始了解，也可以回酒单自由比较。');
  $('#quiz-panel').innerHTML = `<div class="quiz-results" style="${style(d)}"><div class="step-counter">为你挑出的第一杯</div><div class="result-art">${glass(d)}</div><h2 id="question-title" tabindex="-1">${d.name}</h2><h3>${d.cn}</h3><div class="card-tags"><span>${d.tag}</span><span>${d.baseName}</span></div><p class="recommend-reason">${reasons.join('')}</p><p class="preference-summary">你的偏好：${flavorNames[state.answers.flavor]} / ${baseNames[state.answers.base]} / ${bodyNames[state.answers.body]}</p><div class="result-actions"><button class="button primary" data-detail="${d.id}">查看配方 ${icon('arrow')}</button>${saveButton(d, 'button secondary')}</div>${ranked[1] ? `<div class="alternate">同样符合基酒选择，也可以看看<button data-detail="${ranked[1].id}">${ranked[1].name} · ${ranked[1].cn} ${icon('arrow')}</button></div>` : ''}<div class="quiz-actions"><button class="text-link" id="quiz-edit">${icon('back')}修改上一步</button><button class="quiet" id="quiz-restart">重新选择</button></div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('button,a'); if (!b) return;
  if (b.matches('.brand')) {e.preventDefault(); setView('menu');}
  if (b.dataset.view) setView(b.dataset.view);
  if (b.hasAttribute('data-draw-feature')) restartFeaturedChoices();
  if (b.hasAttribute('data-pick-feature')) selectFeaturedCard(b,e);
  if (b.hasAttribute('data-shake-feature')) shakeFeaturedDrink();
  if (b.hasAttribute('data-confirm-feature')) confirmFeaturedChoice();
  if (b.dataset.detail) openDetail(b.dataset.detail,b);
  if (b.dataset.shake) shakeDetail(b);
  if (b.hasAttribute('data-open-pantry')) {state.selectionMode = 'pantry'; setView('quiz');}
  if (b.dataset.selectmode) setSelectionMode(b.dataset.selectmode);
  if (b.dataset.stock) {
    if (state.stock.has(b.dataset.stock)) state.stock.delete(b.dataset.stock); else state.stock.add(b.dataset.stock);
    renderPantry();
  }
  if (b.id === 'pantry-clear') {state.stock.clear(); state.onlyZero = false; $('#pantry-search').value = ''; renderPantry();}
  if (b.hasAttribute('data-pantry-demo')) {
    state.stock = new Set(['white-rum','lime','sugar','ice']); state.onlyZero = false; $('#pantry-search').value = ''; renderPantry(); showPantryResults();
  }
  if (b.id === 'pantry-find') showPantryResults();
  if (b.dataset.save) toggleSave(b.dataset.save,b);
  if (b.dataset.category) {
    const changed=state.filters.category!==b.dataset.category;
    state.filters.category = b.dataset.category;
    document.querySelectorAll('[data-category]').forEach(x => {const selected = x === b; x.classList.toggle('selected',selected); x.setAttribute('aria-pressed',selected);}); renderMenu();
    if(changed)animateCatalogResponse('category');
  }
  if (b.dataset.flavor) {
    const changed=state.filters.flavor!==b.dataset.flavor;
    state.filters.flavor = b.dataset.flavor;
    document.querySelectorAll('[data-flavor]').forEach(x => {const selected = x === b; x.classList.toggle('selected', selected); x.setAttribute('aria-pressed', selected);}); renderMenu();
    if(changed)animateCatalogResponse('flavor');
  }
  if (b.matches('#reset-filters,#empty-reset')) {resetFilters(); $('#search').focus({preventScroll:true});}
  if (b.dataset.answer) chooseAnswer(b.dataset.answer);
  if (b.id === 'quiz-next') {
    if (state.answers[questions[state.step].key] === undefined) {$('#quiz-error').textContent = '请选择一个选项，也可以选择“都可以”或“还没想好”。'; $('[data-answer]').focus({preventScroll:true}); return;}
    state.step++; renderQuiz(true);
  }
  if (b.id === 'quiz-prev') {state.step = Math.max(0,state.step - 1); renderQuiz(true);}
  if (b.id === 'quiz-edit') {state.step = 2; renderQuiz(true);}
  if (b.id === 'quiz-restart') {state.step = 0; state.answers = {}; renderQuiz(true);}
  if (b.id === 'close-detail') closeDetail();
});
$('#search').addEventListener('input', e => {state.filters.query = e.target.value; renderMenu();});
$('#pantry-search').addEventListener('input', filterPantryOptions);
$('#pantry-zero').addEventListener('change', e => {state.onlyZero = e.target.checked; renderPantry();});
const baseOptions = [...document.querySelectorAll('[data-base]')];
let activeBase = 0, baseSearch = '', baseSearchTimer;
function syncBasePicker() {
  $('#base-value').textContent = baseNames[state.filters.base];
  baseOptions.forEach(option => option.setAttribute('aria-selected', option.dataset.base === state.filters.base));
}
function highlightBase(index) {
  activeBase = (index + baseOptions.length) % baseOptions.length;
  baseOptions.forEach((option, i) => option.classList.toggle('is-active', i === activeBase));
  $('#base-filter').setAttribute('aria-activedescendant', baseOptions[activeBase].id);
  if (!$('#base-options').hidden) baseOptions[activeBase].scrollIntoView({block:'nearest'});
}
function openBasePicker() {
  $('#base-options').hidden = false;
  $('#base-filter').setAttribute('aria-expanded','true');
  highlightBase(baseOptions.findIndex(option => option.dataset.base === state.filters.base));
  // Open above the trigger when there is more room there; preserve the page position.
  const rect = $('#base-options').getBoundingClientRect();
  $('#base-picker').classList.toggle('opens-up', rect.bottom > window.innerHeight - 16 && rect.top > rect.height + 16);
}
function closeBasePicker(restoreFocus = false) {
  $('#base-options').hidden = true;
  $('#base-filter').setAttribute('aria-expanded','false');
  $('#base-filter').removeAttribute('aria-activedescendant');
  $('#base-picker').classList.remove('opens-up');
  baseSearch = ''; clearTimeout(baseSearchTimer);
  if (restoreFocus) $('#base-filter').focus({preventScroll:true});
}
function selectBase(value) {
  if (!baseOptions.some(option => option.dataset.base === value)) return;
  const changed=state.filters.base!==value;
  state.filters.base = value;
  syncBasePicker(); renderMenu(); closeBasePicker(true);
  if(changed)animateCatalogResponse('base');
}
$('#base-filter').addEventListener('click', () => {
  if ($('#base-options').hidden) openBasePicker(); else closeBasePicker();
});
$('#base-options').addEventListener('click', e => {
  const option = e.target.closest('[data-base]'); if (option) selectBase(option.dataset.base);
});
$('#base-picker').addEventListener('keydown', e => {
  const open = !$('#base-options').hidden;
  if (e.key === 'Tab') {closeBasePicker(); return;}
  if (e.key === 'Escape' && open) {e.preventDefault(); closeBasePicker(true); return;}
  if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
    e.preventDefault();
    if (!open) openBasePicker();
    if (e.key === 'Home') highlightBase(0);
    else if (e.key === 'End') highlightBase(baseOptions.length - 1);
    else if (open) highlightBase(activeBase + (e.key === 'ArrowDown' ? 1 : -1));
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); if (open) selectBase(baseOptions[activeBase].dataset.base); else openBasePicker();
  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (!open) openBasePicker();
    baseSearch += e.key.toLowerCase(); clearTimeout(baseSearchTimer);
    baseSearchTimer = setTimeout(() => {baseSearch = '';}, 800);
    const index = baseOptions.findIndex(option => option.textContent.trim().toLowerCase().startsWith(baseSearch));
    if (index >= 0) highlightBase(index);
  }
});
document.addEventListener('pointerdown', e => {if (!$('#base-picker').contains(e.target)) closeBasePicker();});
document.addEventListener('focusin', e => {if (!$('#base-picker').contains(e.target)) closeBasePicker();});
$('#quiz-panel').addEventListener('keydown', e => {
  if (!e.target.matches('[data-answer]') || !['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
  e.preventDefault(); const buttons = [...document.querySelectorAll('[data-answer]')]; let index = buttons.indexOf(e.target);
  index = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (['ArrowDown','ArrowRight'].includes(e.key) ? 1 : -1) + buttons.length) % buttons.length;
  chooseAnswer(buttons[index].dataset.answer); buttons[index].focus();
});
$('#detail-dialog').addEventListener('click', e => {
  if (e.target !== $('#detail-dialog')) return;
  const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDetail();
});
$('#detail-dialog').addEventListener('cancel', event => {event.preventDefault(); closeDetail();});
$('#detail-dialog').addEventListener('close', finishDetailClose);
function stopFeaturedDraw() {
  clearTimeout(featuredReturnCache.timer);featuredReturnCache.timer=0;
  featuredDraw.shake?.cancel(); featuredDraw.shake=null;
  $('#hero-feature')?.classList.remove('is-recomposing','is-returning');
  document.querySelectorAll('.feature-copy-layer').forEach(layer=>layer.remove());
  $('.feature-info')?.removeAttribute('aria-hidden');
  featuredDraw.revision++;
  featuredDraw.animations.forEach(animation => animation.cancel());
  featuredDraw.animations = [];
  cancelAnimationFrame(featuredDraw.frame);
  featuredDraw.cancelParticles?.();
  featuredDraw.cancelParticles = null;
  for (const selector of ['.draw-particles','.title-particles','.return-particles']) {
    const canvas = $(selector);
    canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
  }
  const title = $('.feature-info h2');
  if (title) {title.style.opacity = ''; title.removeAttribute('aria-hidden');}
  $('#hero-feature')?.removeAttribute('aria-busy');
  document.querySelectorAll('[data-pick-feature]').forEach(card => {
    card.removeAttribute('aria-disabled');
    card.style.removeProperty('--return-opacity');card.style.removeProperty('--return-shadow');
  });
  featuredDraw.busy = false;
  featuredDraw.finish = null;
}
function mountFeaturedGlass(hero, preparedImage) {
  const slot=$('.feature-glass');
  const existing=slot.querySelector('.drink-photo');
  if(existing&&existing.getAttribute('src')===hero.image)return existing;
  if(!hero.image){slot.innerHTML=glassIllustration(hero);return null;}
  const image=preparedImage||requestFeaturedImage(hero);
  image.className=`glass-art drink-photo photo-${hero.id}`;
  image.alt='';image.width=image.height=1280;image.decoding='async';image.draggable=false;
  if(image.naturalWidth){slot.replaceChildren(image);return image;}
  slot.innerHTML=glassIllustration(hero);
  if(!image.complete){
    const illustration=slot.firstElementChild;
    image.hidden=true;
    image.addEventListener('load',()=>{
      if(image.parentElement!==slot)return;
      illustration.remove();image.hidden=false;
      queueFeaturedReturnPreparation();
    },{once:true});
    image.addEventListener('error',()=>image.remove(),{once:true});
    slot.append(image);
  }
  return image;
}
function featuredImageRect(relativeTo, naturalImage) {
  const image=$('.feature-glass .drink-photo'),rect=image.getBoundingClientRect(),css=getComputedStyle(image);
  const n=value=>parseFloat(value)||0;
  const left=n(css.borderLeftWidth)+n(css.paddingLeft),top=n(css.borderTopWidth)+n(css.paddingTop);
  const width=rect.width-left-n(css.borderRightWidth)-n(css.paddingRight);
  const height=rect.height-top-n(css.borderBottomWidth)-n(css.paddingBottom);
  const source=naturalImage||image,ratio=(source.naturalWidth||1)/(source.naturalHeight||1);
  const fittedWidth=Math.min(width,height*ratio),fittedHeight=fittedWidth/ratio;
  return {x:rect.left-relativeTo.left+left+(width-fittedWidth)/2,y:rect.top-relativeTo.top+top+(height-fittedHeight)/2,width:fittedWidth,height:fittedHeight};
}
function updateFeaturedDrink(hero, restoreInitiatorFocus = false, image) {
  const feature = $('#hero-feature');
  const restoreFocus = restoreInitiatorFocus || $('.draw-deck').contains(document.activeElement);
  featuredDraw.hero = hero;
  featuredId = hero.id;
  try {sessionStorage.setItem('between-five-featured-v1',featuredId);} catch {}
  const categories = {classic:'经典精选',signature:'原创特调',zero:'无酒精'};
  feature.style.cssText = style(hero);
  feature.dataset.featured = hero.id;
  feature.dataset.drawState = 'revealed';
  feature.dataset.drawPhase = 'revealed';
  mountFeaturedGlass(hero,image);
  $('.hero-caption').textContent = categories[hero.category];
  $('.feature-info p').textContent = '今日为你抽到';
  $('.feature-info h2').textContent = hero.name;
  $('.feature-info small').textContent = `${hero.cn} · ${hero.tag}`;
  $('.draw-hint span').textContent = '再抽一杯';
  $('[data-draw-feature]').setAttribute('aria-label',`再铺开七张牌，当前是${hero.cn}`);
  $('[data-shake-feature]').setAttribute('aria-label',`摇一摇${hero.cn}酒杯`);
  const detail = $('.feature-detail');
  detail.disabled = false;
  detail.dataset.detail = hero.id;
  detail.setAttribute('aria-label',`查看${hero.cn}配方`);
  window.syncMobileInterface?.();
  if (restoreFocus) $('[data-draw-feature]').focus({preventScroll:true});
  queueFeaturedReturnPreparation();
}
function dealFeaturedChoices(focus = false, keepMotion = false) {
  if (!keepMotion) stopFeaturedDraw();
  const pool = DRINKS.filter(drink => drink.id !== featuredId);
  const choices = pool.length >= 7 ? pool : [...DRINKS];
  // A deal contains distinct drinks; the selected position determines the result.
  for (let i=choices.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [choices[i],choices[j]]=[choices[j],choices[i]];
  }
  featuredDraw.choices = choices.slice(0,7);
  const feature = $('#hero-feature');
  feature.dataset.drawState = 'choosing';
  feature.dataset.drawPhase = 'choosing';
  delete feature.dataset.featured;
  $('.feature-title').style.minHeight = '';
  $('.feature-info p').textContent = '今晚的灵感';
  $('.feature-info h2').textContent = '下一杯，会是谁？';
  $('.feature-info small').textContent = '七张牌，七种新的风味。';

  $('.feature-detail').disabled = true;
  $('.feature-detail').removeAttribute('data-detail');
  document.querySelectorAll('[data-pick-feature]').forEach((card,index) => {
    card.hidden = index >= featuredDraw.choices.length;
    card.classList.remove('is-picked'); card.classList.remove('is-armed');card.setAttribute('aria-pressed','false');
  });
  window.syncMobileInterface?.();
  if (focus) {
    $('#feature-announcement').textContent = '七张推荐牌已铺开，请任选一张。';
    $('[data-pick-feature="0"]')?.focus({preventScroll:true});
  }
}
function renderFeaturedDrink() {
  stopFeaturedDraw();
  $('#hero-feature').innerHTML = `<div class="hero-art feature-stage"><button class="feature-draw feature-shake" data-shake-feature type="button" aria-label="摇一摇推荐酒杯" title="点酒杯，摇一摇"><span class="feature-glass"></span></button><div class="draw-hand-scroll" aria-label="可左右滑动的推荐手牌"><div class="draw-deck" role="group" aria-label="七张叠放的推荐牌，任选一张">${Array.from({length:7},(_,index)=>`<button class="draw-card" type="button" data-pick-feature="${index}" style="--slot:${index};--fan:${(index-3)*2.2};--bend:${Math.abs(index-3)*2}" aria-label="抽第${index+1}张推荐牌">${icon('glass')}<span>NIGHT SIP</span><span class="draw-card-number">${String(index+1).padStart(2,'0')}</span></button>`).join('')}</div></div><canvas class="draw-particles" aria-hidden="true"></canvas><div class="feature-hint"><button class="mobile-reveal" data-confirm-feature type="button" hidden><span>揭晓这张</span>${icon('arrow')}</button><span class="draw-hint-message">${icon('shuffle')}<span data-hint-copy>${window.matchMedia('(hover:none)').matches?'轻点挑牌，再点揭晓':'悬停挑选，点击揭晓'}</span></span><button class="draw-hint" type="button" data-draw-feature aria-label="再铺开七张推荐牌">${icon('shuffle')}<span data-hint-copy>再抽一杯</span></button></div></div><div class="feature-info"><div class="feature-meta"><p></p><span class="hero-caption"></span></div><div class="feature-title"><h2></h2></div><small></small></div><button class="feature-detail" type="button">查看配方 ${icon('arrow')}</button><canvas class="return-particles" aria-hidden="true"></canvas><canvas class="title-particles" aria-hidden="true"></canvas>`;
  dealFeaturedChoices();
}
function requestFeaturedImage(hero) {
  if(!hero.image)return null;
  const image = new Image();
  image.loading='eager';image.fetchPriority='high';
  image.src = hero.image;
  return image;
}
function prepareFeaturedImage(hero, image = requestFeaturedImage(hero)) {
  if(!image)return Promise.resolve(null);
  if (image.complete) return Promise.resolve(image.naturalWidth > 0 ? image : null);
  return new Promise(resolve => {
    const timer=setTimeout(done,1400);
    function done() {
      clearTimeout(timer);
      image.removeEventListener('load',done);image.removeEventListener('error',done);
      resolve(image.naturalWidth?image:null);
    }
    image.addEventListener('load',done);image.addEventListener('error',done);
  });
}
function featuredSmooth(value) {
  const t=Math.max(0,Math.min(1,value));
  // Zero velocity and acceleration at both ends, including stagger boundaries.
  return t*t*t*(t*(t*6-15)+10);
}
function createFeaturedParticlePath(start,target,{bend=12,lift=0,delay=0,end=.94}={}) {
  const dx=target.x-start.x,dy=target.y-start.y,length=Math.hypot(dx,dy)||1;
  const nx=-dy/length,ny=dx/length;
  return {start,target,delay,end,
    first:{x:start.x+dx*.28+nx*bend,y:start.y+dy*.28+ny*bend-lift},
    second:{x:target.x-dx*.22+nx*bend*.45,y:target.y-dy*.22+ny*bend*.45-lift*.3}};
}
function featuredParticleAt(path,progress) {
  const t=featuredSmooth((progress-path.delay)/(path.end-path.delay)),u=1-t;
  return {x:u*u*u*path.start.x+3*u*u*t*path.first.x+3*u*t*t*path.second.x+t*t*t*path.target.x,
    y:u*u*u*path.start.y+3*u*u*t*path.first.y+3*u*t*t*path.second.y+t*t*t*path.target.y,travel:t};
}
function featuredRevealPhotoOpacity(progress) {
  // The particles first build the complete cup; photography only resolves its
  // fine detail after the last particle has landed. Never preview its silhouette.
  return featuredSmooth((progress*FEATURED_GATHER_MS-FEATURED_PHOTO_START_MS)/FEATURED_RESOLVE_MS);
}
function createFeaturedRevealPath(cardBounds,target,bounds,random=Math.random) {
  // Start positions are independent of destination pixels. Mapping corresponding
  // card/cup coordinates would show a miniature cup before any gathering occurs.
  const start={x:cardBounds.x+cardBounds.width*(.06+random()*.88),
    y:cardBounds.y+cardBounds.height*(.06+random()*.88)};
  const angle=random()*Math.PI*2,spread=.6+random()*.4;
  const rx=bounds.width*.46*spread,ry=bounds.height*.47*spread;
  return {start,target,delay:random()*.065,end:.78+random()*.08,
    first:{x:bounds.width*.5+Math.cos(angle)*rx,y:bounds.height*.48+Math.sin(angle)*ry},
    second:{x:target.x+Math.cos(angle+.65)*rx*.62,y:target.y+Math.sin(angle+.65)*ry*.62}};
}
function createFeaturedCopyLayers(hero, mode) {
  const feature=$('#hero-feature');
  const createCopy=(incoming)=>{
    const copy=document.createElement('div');copy.className='feature-copy-layer';copy.inert=true;copy.setAttribute('aria-hidden','true');
    copy.dataset.copyState=incoming?(mode==='choosing'?'choosing':'revealed'):(hero?'choosing':'revealed');
    const stage=document.createElement('div');stage.className='hero-art feature-stage';
    stage.append($('.feature-hint').cloneNode(true));
    copy.append(stage,$('.feature-info').cloneNode(true),$('.feature-detail').cloneNode(true));
    copy.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    copy.querySelectorAll('[data-confirm-feature]').forEach(node=>node.remove());
    copy.querySelectorAll('button').forEach(button=>{button.disabled=false;});
    if(incoming&&hero){
      copy.querySelector('.feature-meta p').textContent='今日为你抽到';
      copy.querySelector('.hero-caption').textContent={classic:'经典精选',signature:'原创特调',zero:'无酒精'}[hero.category];
      copy.querySelector('h2').textContent=hero.name;
      copy.querySelector('.feature-info small').textContent=`${hero.cn} · ${hero.tag}`;
    }else if(incoming&&mode==='choosing'){
      copy.querySelector('.feature-meta p').textContent='今晚的灵感';
      copy.querySelector('h2').textContent='下一杯，会是谁？';
      copy.querySelector('.feature-info small').textContent='七张牌，七种新的风味。';
    }
    copy.style.opacity='0';feature.append(copy);return copy;
  };
  const from=createCopy(false),to=createCopy(true);
  return {from,to,duration:hero?FEATURED_REVEAL_MS:1600,started:false};
}
function featuredGlyphMask(character,font,ratio) {
  const key=[character,font,ratio].join('|');
  if(featuredGlyphCache.has(key))return featuredGlyphCache.get(key);
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)return null;
  context.font=font;
  const metrics=context.measureText(character),size=parseFloat(font.match(/([\d.]+)px/)?.[1])||16;
  const ascent=metrics.fontBoundingBoxAscent??size*.9,descent=metrics.fontBoundingBoxDescent??size*.25;
  const left=2+Math.max(0,metrics.actualBoundingBoxLeft),baseline=2+ascent;
  const width=Math.ceil(left+Math.max(metrics.width,metrics.actualBoundingBoxRight)+2),height=Math.ceil(ascent+descent+4);
  canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio);
  context.scale(ratio,ratio);context.font=font;context.textBaseline='alphabetic';context.fillStyle='#fff';
  context.fillText(character,left,baseline);
  const data=context.getImageData(0,0,canvas.width,canvas.height).data,points=[];
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
    const alpha=data[(y*canvas.width+x)*4+3];
    if(alpha>80)points.push((x+.5)/ratio-left,(y+.5)/ratio-baseline,alpha/255);
  }
  const mask={points:new Float32Array(points),ascent,descent};
  // Bound memory across repeated drinks and resizes; masks contain only glyphs,
  // never a full hero bitmap or a low-resolution photograph of the text.
  if(featuredGlyphCache.size>=256)featuredGlyphCache.delete(featuredGlyphCache.keys().next().value);
  featuredGlyphCache.set(key,mask);return mask;
}
function sampleFeaturedCopyText(copy,bounds) {
  const ratio=Math.min(devicePixelRatio||1,2),points=[],roles=new Map();
  const selectors=['.feature-meta p','.hero-caption','.feature-title h2','.feature-info small','.draw-hint span','.draw-hint-message [data-hint-copy]','.feature-detail'];
  for(const selector of selectors){
    const leaf=copy.querySelector(selector);if(!leaf)continue;
    const css=getComputedStyle(leaf),box=leaf.getBoundingClientRect();
    if(!box.width||!box.height||css.visibility==='hidden')continue;
    const font=`${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
    const rolePoints=[];
    for(const node of leaf.childNodes){
      if(node.nodeType!==Node.TEXT_NODE)continue;
      let offset=0;
      for(const character of node.textContent){
        const length=character.length;
        if(!character.trim()){offset+=length;continue;}
        const range=document.createRange();range.setStart(node,offset);range.setEnd(node,offset+length);offset+=length;
        const rect=range.getBoundingClientRect(),mask=featuredGlyphMask(character,font,ratio);if(!mask)continue;
        const baseline=rect.top-bounds.top+(rect.height-mask.ascent-mask.descent)/2+mask.ascent;
        for(let i=0;i<mask.points.length;i+=3){
          const point={x:rect.left-bounds.left+mask.points[i],y:baseline+mask.points[i+1],alpha:mask.points[i+2],color:css.color,role:selector};
          rolePoints.push(point);points.push(point);
        }
      }
    }
    if(rolePoints.length)roles.set(selector,rolePoints);
  }
  return {points,roles};
}
function buildFeaturedTextParticleModel(layers) {
  const bounds=$('#hero-feature').getBoundingClientRect();
  const from=sampleFeaturedCopyText(layers.from,bounds),to=sampleFeaturedCopyText(layers.to,bounds);
  if(!from.points.length||!to.points.length)return null;
  const count=Math.min(Math.max(from.points.length,to.points.length),isCompactViewport()?1000:1800),groups=new Map();
  let minY=bounds.height,maxY=0;
  for(let i=0;i<count;i++){
    const target=to.points[Math.floor((i+Math.random())*to.points.length/count)];
    const candidates=from.roles.get(target.role)||from.points;
    const start=candidates[Math.floor(Math.random()*candidates.length)],seed=Math.random();
    const path=createFeaturedParticlePath(start,target,{bend:(seed-.5)*48,lift:12+seed*12,delay:seed*.065,end:.74+seed*.08});
    const coefficients=axis=>[start[axis],3*(path.first[axis]-start[axis]),3*(start[axis]-2*path.first[axis]+path.second[axis]),target[axis]-start[axis]+3*(path.first[axis]-path.second[axis])];
    const particle={x:coefficients('x'),y:coefficients('y'),delay:path.delay,end:path.end,alpha:target.alpha,radius:.52+seed*.25};
    if(!groups.has(target.color))groups.set(target.color,{color:target.color,particles:[]});
    groups.get(target.color).particles.push(particle);
    minY=Math.min(minY,start.y,target.y,path.first.y,path.second.y);maxY=Math.max(maxY,start.y,target.y,path.first.y,path.second.y);
  }
  return {groups:[...groups.values()],count,w:bounds.width,h:bounds.height,clearTop:Math.max(0,minY-4),clearBottom:Math.min(bounds.height,maxY+4)};
}
function prepareFeaturedReturnText() {
  const layers=createFeaturedCopyLayers(null,'choosing');
  try{return buildFeaturedTextParticleModel(layers);}finally{layers.from.remove();layers.to.remove();}
}
function createFeaturedCopyTransition(hero, mode, prepared) {
  const feature=$('#hero-feature'),layers=createFeaturedCopyLayers(hero,mode);
  const model=prepared||buildFeaturedTextParticleModel(layers),canvas=$('.title-particles');
  const context=canvas.getContext('2d'),ratio=Math.min(devicePixelRatio||1,isCompactViewport()?1.5:2);
  if(model&&context){canvas.width=Math.ceil(model.w*ratio);canvas.height=Math.ceil(model.h*ratio);context.scale(ratio,ratio);}
  layers.from.style.opacity='1';
  feature.classList.add('is-recomposing');
  $('.feature-info').setAttribute('aria-hidden','true');
  return {...layers,model,context};
}
function startFeaturedCopyTransition(layer,time) {
  if(!layer)return;
  time??=document.timeline.currentTime;
  if(!layer.started){
    layer.started=true;layer.startTime=time;
    // The native target stays absent until every text particle has landed.
    // It only supplies the final crisp edge, never substitutes for the motion.
    for(const [node,incoming] of [[layer.from,false],[layer.to,true]]){
      const frames=incoming?[{opacity:0,offset:0},{opacity:0,offset:.86},...Array.from({length:16},(_,i)=>({opacity:featuredSmooth((i+1)/16),offset:.86+.14*(i+1)/16}))]:
        [{opacity:1,offset:0},...Array.from({length:16},(_,i)=>({opacity:1-featuredSmooth((i+1)/16),offset:.14*(i+1)/16})),{opacity:0,offset:1}];
      const animation=node.animate(frames,{duration:layer.duration,fill:'both',easing:'linear'});
      animation.startTime=time;animation.finished.catch(()=>{});featuredDraw.animations.push(animation);
    }
  }
  const {model,context}=layer;if(!model||!context)return;
  const progress=Math.min((time-layer.startTime)/layer.duration,1);
  const opacity=featuredSmooth(progress/.10)*(1-featuredSmooth((progress-.86)/.14));
  context.clearRect(0,model.clearTop,model.w,model.clearBottom-model.clearTop);
  for(const group of model.groups){
    context.fillStyle=group.color;
    for(const p of group.particles){
      const t=featuredSmooth((progress-p.delay)/(p.end-p.delay)),x=p.x,y=p.y;
      const px=((x[3]*t+x[2])*t+x[1])*t+x[0],py=((y[3]*t+y[2])*t+y[1])*t+y[0];
      context.globalAlpha=opacity*p.alpha;
      context.fillRect(px-p.radius,py-p.radius,p.radius*2,p.radius*2);
    }
  }
  context.globalAlpha=1;
}
function shakeFeaturedDrink() {
  if(featuredDraw.busy||$('#hero-feature').dataset.drawState!=='revealed')return;
  const image=$('.feature-glass .glass-art:not([hidden])');if(!image?.animate)return;
  featuredDraw.shake?.cancel();
  const base=getComputedStyle(image).transform;
  const reduced=menuReducedMotion.matches;
  const frames=reduced?[{opacity:1},{opacity:.8},{opacity:1}]:[
    {transform:base,offset:0},
    {transform:'translateY(-3px) rotate(-6deg) scale(1.035)',offset:.2},
    {transform:'translateY(-2px) rotate(4deg) scale(1.025)',offset:.42},
    {transform:'rotate(-2.5deg) scale(1.015)',offset:.62},
    {transform:'rotate(1deg) scale(1.005)',offset:.8},
    {transform:base,offset:1}
  ];
  const animation=image.animate(frames,{duration:reduced?180:780,easing:'ease-in-out'});
  featuredDraw.shake=animation;
  animation.finished.catch(()=>{}).then(()=>{if(featuredDraw.shake===animation){featuredDraw.shake=null;queueFeaturedReturnPreparation();}});
}
function selectFeaturedCard(button,event) {
  if(featuredDraw.busy)return;
  if((isCompactViewport()||window.matchMedia('(hover:none)').matches)&&event.detail!==0&&!button.classList.contains('is-armed')){
    document.querySelectorAll('[data-pick-feature]').forEach(card=>{card.classList.remove('is-armed');card.setAttribute('aria-pressed','false');});
    button.classList.add('is-armed');button.setAttribute('aria-pressed','true');button.focus({preventScroll:true});window.syncMobileInterface?.();return;
  }
  return drawFeaturedDrink(Number(button.dataset.pickFeature));
}
function confirmFeaturedChoice(){
  const armed=[...document.querySelectorAll('[data-pick-feature]')].find(card=>card.classList.contains('is-armed'));
  if(armed)return drawFeaturedDrink(Number(armed.dataset.pickFeature));
}
document.addEventListener('keydown',event=>{
  const card=event.target.closest?.('[data-pick-feature]');
  if(!card||$('#hero-feature').dataset.drawState!=='choosing'||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  const index=Number(card.dataset.pickFeature);
  const target=event.key==='Home'?0:event.key==='End'?6:(index+(event.key==='ArrowRight'?1:6))%7;
  $(`[data-pick-feature="${target}"]`)?.focus({preventScroll:true});
});

function dissolveFeaturedCard(image,isCurrent,hero) {
  const canvas=$('.draw-particles'),context=canvas.getContext('2d');
  if (!context || !image?.naturalWidth) return Promise.resolve();
  const canvasRect=canvas.getBoundingClientRect(),{width,height}=canvasRect;
  if (!width || !height) return Promise.resolve();
  const ratio=Math.min(window.devicePixelRatio||1,isCompactViewport()?1.5:2);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.scale(ratio,ratio);
  const sample=document.createElement('canvas'),resolution=144;
  sample.width=sample.height=resolution;
  const sampler=sample.getContext('2d',{willReadFrequently:true});
  if (!sampler) return Promise.resolve();
  mountFeaturedGlass(hero,image);
  const destination=featuredImageRect(canvasRect,image);
  const size=destination.width,left=destination.x,top=destination.y;
  let pixels;
  try {sampler.drawImage(image,0,0,resolution,resolution);pixels=sampler.getImageData(0,0,resolution,resolution).data;} catch {return Promise.resolve();}
  const targets=[];
  for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
    const offset=(y*resolution+x)*4;
    if(pixels[offset+3]>96)targets.push({x:left+x/resolution*size,y:top+y/resolution*size,color:[pixels[offset],pixels[offset+1],pixels[offset+2]],alpha:pixels[offset+3]/255});
  }
  const count=Math.min(targets.length,isCompactViewport()?1100:2200);
  if (!count) return Promise.resolve();
  const card=$('.draw-card.is-picked').getBoundingClientRect();
  const sourceBounds={x:card.left-canvasRect.left,y:card.top-canvasRect.top,width:card.width,height:card.height};
  const particles=Array.from({length:count},(_,i)=>{
    // One sample per stratum avoids a regular scanline/moire lattice in the
    // assembled particle cup while retaining even coverage of its silhouette.
    const target=targets[Math.floor((i+Math.random())*targets.length/count)],seed=Math.random();
    const path=createFeaturedRevealPath(sourceBounds,target,{width,height});
    return {...target,path,seed,cssColor:`rgb(${target.color.join(',')})`,radius:.7+seed*.45};
  });
  let titleLayer;
  try {titleLayer=createFeaturedCopyTransition(hero);} catch {titleLayer=null;}
  return new Promise(resolve=>{
    let start,resolveAnimation;featuredDraw.cancelParticles=resolve;
    function frame(time){
      try{paintFrame(time);}catch{resolve();}
    }
    function paintFrame(time){
      if(!isCurrent()){resolve();return;}
      if(start===undefined){
        start=time;
        const startOffset=FEATURED_PHOTO_START_MS/FEATURED_REVEAL_MS;
        const frames=[{opacity:0,offset:0},{opacity:0,offset:startOffset},...Array.from({length:16},(_,i)=>({opacity:featuredSmooth((i+1)/16),offset:startOffset+(1-startOffset)*(i+1)/16}))];
        resolveAnimation=$('.feature-glass').animate(frames,{duration:FEATURED_REVEAL_MS,fill:'both',easing:'linear'});
        resolveAnimation.startTime=time;
        featuredDraw.animations.push(resolveAnimation);resolveAnimation.finished.catch(()=>{});
      }
      const elapsed=time-start,progress=Math.min(elapsed/FEATURED_GATHER_MS,1);
      const feature=$('#hero-feature');
      if(elapsed>=FEATURED_PHOTO_START_MS&&feature.dataset.drawPhase!=='resolving')feature.dataset.drawPhase='resolving';
      else if(progress>=.65&&elapsed<FEATURED_PHOTO_START_MS&&feature.dataset.drawPhase!=='forming')feature.dataset.drawPhase='forming';
      const photograph=featuredRevealPhotoOpacity(elapsed/FEATURED_GATHER_MS);
      context.clearRect(0,0,width,height);
      for(const p of particles){
        const position=featuredParticleAt(p.path,progress);
        const depth=Math.sin(position.travel*Math.PI);
        const radius=p.radius+(Math.max(.9,size/resolution*.62)-p.radius)*position.travel+depth*.25;
        context.globalAlpha=(1-photograph)*(.86+p.seed*.14)*p.alpha*featuredSmooth((progress-p.path.delay)/.12);
        context.fillStyle=p.cssColor;context.beginPath();context.arc(position.x,position.y,radius,0,Math.PI*2);context.fill();
      }
      context.globalAlpha=1;
      startFeaturedCopyTransition(titleLayer,time);
      if(elapsed<FEATURED_REVEAL_MS)featuredDraw.frame=requestAnimationFrame(frame);
      else{featuredDraw.cancelParticles=null;resolve();}
    }
    featuredDraw.frame=requestAnimationFrame(frame);
  });
}
async function drawFeaturedDrink(index) {
  if(featuredDraw.busy||state.view!=='menu'||$('#hero-feature').dataset.drawState!=='choosing')return;
  const next=featuredDraw.choices[index];
  if(!next)return;
  // Capture before the explicit mobile confirm disappears during the reveal.
  const restoreInitiatorFocus = $('.draw-deck').contains(document.activeElement) || Boolean(document.activeElement?.matches?.('[data-confirm-feature]'));
  stopFeaturedDraw();
  const revision=featuredDraw.revision,isCurrent=()=>revision===featuredDraw.revision;
  featuredDraw.busy=true;
  const feature=$('#hero-feature');feature.dataset.drawState='drawing';feature.dataset.drawPhase='selected';feature.setAttribute('aria-busy','true');
  document.querySelectorAll('[data-pick-feature]').forEach(card=>card.setAttribute('aria-disabled','true'));

  $('#feature-announcement').textContent=`正在揭晓第${index+1}张牌的推荐。`;
  const pendingImage=requestFeaturedImage(next);
  const ready=prepareFeaturedImage(next,pendingImage);
  const animate=(node,frames,options)=>{const animation=node.animate(frames,options);featuredDraw.animations.push(animation);return animation.finished.catch(()=>{});};
  const reveal=()=>{
    if(!isCurrent())return;
    stopFeaturedDraw();updateFeaturedDrink(next, restoreInitiatorFocus, pendingImage);
    $('#feature-announcement').textContent=`今日为你抽到：${next.cn}，${next.tag}。可以查看配方，或再铺开七张牌。`;
  };
  featuredDraw.finish=reveal;
  try{
    if(!menuReducedMotion.matches&&feature.animate){
      const cards=[...document.querySelectorAll('[data-pick-feature]')],selected=cards[index];
      selected.classList.add('is-picked');
      const target=$('.draw-particles').getBoundingClientRect(),deck=$('.draw-deck').getBoundingClientRect();
      const dx=target.left+target.width/2-deck.left-selected.offsetLeft-selected.offsetWidth/2;
      const dy=target.top+target.height/2-deck.top-selected.offsetTop-selected.offsetHeight/2;
      await Promise.all(cards.map((card,i)=>{
        const from=getComputedStyle(card).transform;
        const frames=i===index?[
          {opacity:1,transform:from,offset:0},
          {opacity:1,transform:`translate3d(${dx}px,${dy-5}px,70px) rotateX(8deg) rotateY(18deg) rotateZ(-5deg) scale(1.12)`,offset:.7},
          {opacity:1,transform:`translate3d(${dx}px,${dy}px,64px) rotateX(-3deg) rotateY(-12deg) rotateZ(-3deg) scale(1.14)`,offset:1}
        ]:[{opacity:1,transform:from},{opacity:0,transform:'translate3d(0,-40%,-65px) scale(.8)'}];
        return animate(card,frames,{duration:i===index?580:260,easing:'cubic-bezier(.16,1,.3,1)',fill:'forwards'});
      }));
    }
    if(!isCurrent()||menuReducedMotion.matches||!feature.animate)return;
    const image=await ready;
    if(!isCurrent())return;
    if(image){
      feature.dataset.drawPhase='particles';
      await Promise.all([animate($('.draw-card.is-picked'),[{opacity:1},{opacity:0}],{duration:280,easing:'ease-in-out',fill:'forwards'}),dissolveFeaturedCard(image,isCurrent,next)]);
    }
  }catch{
    // Keep the selected recipe available if the animation cannot run.
  }finally{reveal();}
}
function featuredReturnRoundRect(context,x,y,width,height,radius) {
  const r=Math.min(radius,width/2,height/2);
  context.beginPath();context.moveTo(x+r,y);context.arcTo(x+width,y,x+width,y+height,r);
  context.arcTo(x+width,y+height,x,y+height,r);context.arcTo(x,y+height,x,y,r);context.arcTo(x,y,x+width,y,r);context.closePath();
}
function featuredReturnCardFace(card) {
  const width=card.offsetWidth,height=card.offsetHeight,computed=getComputedStyle(card);
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(width*2);canvas.height=Math.ceil(height*2);
  const context=canvas.getContext('2d');if(!context)return null;
  context.scale(2,2);
  const colors=computed.backgroundImage.match(/rgba?\([^)]*\)|#[\da-f]+/gi)||['#5b4945','#29232e'];
  const gradient=context.createLinearGradient(0,0,width,height);gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]||colors[0]);
  featuredReturnRoundRect(context,0,0,width,height,parseFloat(computed.borderRadius)||14);context.fillStyle=gradient;context.fill();
  context.strokeStyle='#f4d4ae60';context.lineWidth=.8;context.stroke();
  const border=getComputedStyle(card,'::before'),inset=parseFloat(border.left)||6;
  featuredReturnRoundRect(context,inset,inset,width-inset*2,height-inset*2,parseFloat(border.borderRadius)||9);
  context.strokeStyle=border.borderTopColor;context.lineWidth=1;context.stroke();
  const logo=card.querySelector('.icon'),logoSize=parseFloat(getComputedStyle(logo).width)||24;
  const label=card.querySelector('span:not(.draw-card-number)'),labelStyle=getComputedStyle(label);
  const lineHeight=parseFloat(labelStyle.lineHeight)||parseFloat(labelStyle.fontSize)*1.6,gap=parseFloat(computed.rowGap)||8;
  const logoX=(width-logoSize)/2,logoY=(height-logoSize-gap-lineHeight)/2;
  context.save();context.translate(logoX,logoY);context.scale(logoSize/24,logoSize/24);
  context.strokeStyle=computed.color;context.lineWidth=1.5;context.lineJoin='round';context.lineCap='round';
  context.beginPath();context.moveTo(3,3);context.lineTo(21,3);context.lineTo(12,13);context.closePath();
  context.moveTo(12,13);context.lineTo(12,21);context.moveTo(7,21);context.lineTo(17,21);context.moveTo(7,6);context.lineTo(17,6);context.stroke();context.restore();
  context.font=`${labelStyle.fontWeight} ${labelStyle.fontSize} ${labelStyle.fontFamily}`;context.fillStyle=labelStyle.color;
  context.textAlign='center';context.textBaseline='middle';context.fillText(label.textContent,width/2,logoY+logoSize+gap+lineHeight/2);
  const number=card.querySelector('.draw-card-number'),numberStyle=getComputedStyle(number);
  context.font=`${numberStyle.fontWeight} ${numberStyle.fontSize} ${numberStyle.fontFamily}`;context.fillStyle=numberStyle.color;
  context.textAlign='left';context.textBaseline='top';context.fillText(number.textContent,parseFloat(numberStyle.left)||8,(parseFloat(numberStyle.top)||8)+2);
  return {canvas,width,height};
}
function featuredReturnTriangle(context,face,source,target) {
  const [s0,s1,s2]=source,[t0,t1,t2]=target;
  const determinant=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);
  if(!determinant)return;
  const coefficients=axis=>[
    (t0[axis]*(s1.y-s2.y)+t1[axis]*(s2.y-s0.y)+t2[axis]*(s0.y-s1.y))/determinant,
    (t0[axis]*(s2.x-s1.x)+t1[axis]*(s0.x-s2.x)+t2[axis]*(s1.x-s0.x))/determinant,
    (t0[axis]*(s1.x*s2.y-s2.x*s1.y)+t1[axis]*(s2.x*s0.y-s0.x*s2.y)+t2[axis]*(s0.x*s1.y-s1.x*s0.y))/determinant
  ];
  const x=coefficients('x'),y=coefficients('y');
  context.save();context.beginPath();context.moveTo(t0.x,t0.y);context.lineTo(t1.x,t1.y);context.lineTo(t2.x,t2.y);context.closePath();context.clip();
  context.transform(x[0],y[0],x[1],y[1],x[2],y[2]);context.drawImage(face.canvas,0,0,face.width,face.height);context.restore();
}
function captureFeaturedReturnHand() {
  const feature=$('#hero-feature'),bounds=feature.getBoundingClientRect(),clone=feature.cloneNode(true);
  clone.classList.remove('is-returning','is-recomposing');clone.dataset.drawState='choosing';clone.setAttribute('aria-hidden','true');
  clone.style.cssText+=`;position:fixed;left:-10000px;top:0;width:${bounds.width}px;height:${bounds.height}px;opacity:0;pointer-events:none;margin:0;`;
  clone.querySelectorAll('.draw-card').forEach(card=>card.classList.remove('is-picked','is-armed'));
  feature.parentElement.append(clone);
  try {
    const bitmap=document.createElement('canvas');bitmap.width=Math.ceil(bounds.width);bitmap.height=Math.ceil(bounds.height);
    const context=bitmap.getContext('2d',{willReadFrequently:true});if(!context)return null;
    const rootRect=clone.getBoundingClientRect(),deck=clone.querySelector('.draw-deck'),deckRect=deck.getBoundingClientRect(),deckStyle=getComputedStyle(deck);
    const perspective=parseFloat(deckStyle.perspective)||800,origin=deckStyle.perspectiveOrigin.split(' ').map(parseFloat);
    const hand=[...clone.querySelectorAll('.draw-card')];
    for(const card of isCompactViewport()?hand:hand.reverse()) {
      const face=featuredReturnCardFace(card);if(!face)continue;
      const computed=getComputedStyle(card),matrix=new DOMMatrix(computed.transform),pivot=computed.transformOrigin.split(' ').map(parseFloat);
      const project=(x,y)=>{
        const point=matrix.transformPoint(new DOMPoint(x-pivot[0],y-pivot[1],0));
        const px=point.x+pivot[0]+card.offsetLeft,py=point.y+pivot[1]+card.offsetTop,scale=perspective/(perspective-point.z);
        return {x:deckRect.left-rootRect.left+origin[0]+(px-origin[0])*scale,y:deckRect.top-rootRect.top+origin[1]+(py-origin[1])*scale};
      };
      // Small strips preserve the CSS perspective instead of stretching one flat rectangle.
      for(let row=0;row<5;row++) {
        const y0=face.height*row/5,y1=face.height*(row+1)/5;
        const strip=[{x:0,y:y0},{x:face.width,y:y0},{x:face.width,y:y1},{x:0,y:y1}],target=strip.map(point=>project(point.x,point.y));
        featuredReturnTriangle(context,face,[strip[0],strip[1],strip[2]],[target[0],target[1],target[2]]);
        featuredReturnTriangle(context,face,[strip[0],strip[2],strip[3]],[target[0],target[2],target[3]]);
      }
    }
    return bitmap;
  } finally {clone.remove();}
}
function featuredReturnKey(bounds) {
  return [featuredId,bounds.width,bounds.height,innerWidth,innerHeight,devicePixelRatio,isCompactViewport()].join(':');
}
function queueFeaturedReturnPreparation() {
  clearTimeout(featuredReturnCache.timer);
  if(menuReducedMotion.matches)return;
  // Prepare the reusable geometry while the cup rests, never on its return frame.
  featuredReturnCache.timer=setTimeout(()=>{
    featuredReturnCache.timer=0;
    if(featuredDraw.busy||featuredDraw.shake||state.view!=='menu'||$('#hero-feature').dataset.drawState!=='revealed')return;
    try {prepareFeaturedReturnModel();} catch {featuredReturnCache.key=null;featuredReturnCache.model=null;}
  },160);
}
function prepareFeaturedReturnModel() {
  const feature=$('#hero-feature'),bounds=feature.getBoundingClientRect(),image=$('.feature-glass .drink-photo');
  if(!image?.naturalWidth)return null;
  const key=featuredReturnKey(bounds);
  if(featuredReturnCache.key===key&&featuredReturnCache.model)return featuredReturnCache.model;
  const from=document.createElement('canvas'),resolution=144;from.width=from.height=resolution;
  const source=from.getContext('2d',{willReadFrequently:true});if(!source)return null;
  // Sample only the transparent asset. Rasterizing a full DPR-sized panel with
  // drop-shadow and then reading it back caused the large click-time stall.
  source.drawImage(image,0,0,resolution,resolution);
  const destination=featuredImageRect(bounds,image);
  const to=captureFeaturedReturnHand();if(!to)return null;
  const sample=(bitmap,step,rect)=>{
    const data=bitmap.getContext('2d',{willReadFrequently:true}).getImageData(0,0,bitmap.width,bitmap.height).data,points=[];
    for(let y=0;y<bitmap.height;y+=step)for(let x=0;x<bitmap.width;x+=step){const offset=(y*bitmap.width+x)*4;if(data[offset+3]>96)points.push({x:rect?rect.x+x/bitmap.width*rect.width:x,y:rect?rect.y+y/bitmap.height*rect.height:y,color:[data[offset],data[offset+1],data[offset+2]],alpha:data[offset+3]/255});}
    return points;
  };
  const fromPoints=sample(from,1,destination),toPoints=sample(to,3);if(!fromPoints.length||!toPoints.length)return null;
  const count=Math.min(Math.max(fromPoints.length,toPoints.length),isCompactViewport()?800:1700);
  const particles=Array.from({length:count},(_,index)=>{
    const start=fromPoints[Math.floor(index*fromPoints.length/count)],target=toPoints[Math.floor(index*toPoints.length/count)],seed=Math.random();
    const path=createFeaturedParticlePath(start,target,{bend:12+seed*14,lift:10,delay:(target.x/bounds.width)*.065+seed*.05,end:.88+seed*.1});
    const coefficients=axis=>[start[axis],3*(path.first[axis]-start[axis]),3*(start[axis]-2*path.first[axis]+path.second[axis]),target[axis]-start[axis]+3*(path.first[axis]-path.second[axis])];
    const [red,green,blue]=start.color,dr=(target.color[0]-red)/32,dg=(target.color[1]-green)/32,db=(target.color[2]-blue)/32;
    const colors=Array.from({length:33},(_,step)=>`rgb(${Math.round(red+dr*step)},${Math.round(green+dg*step)},${Math.round(blue+db*step)})`);
    return {start,target,path,x:coefficients('x'),y:coefficients('y'),colors,radius:.62+seed*.48};
  });
  const text=prepareFeaturedReturnText();
  const model={w:bounds.width,h:bounds.height,particles,text};
  featuredReturnCache.key=key;featuredReturnCache.model=model;
  return model;
}
function buildFeaturedReturnLayers() {
  const model=prepareFeaturedReturnModel();if(!model)return null;
  const ratio=Math.min(window.devicePixelRatio||1,isCompactViewport()?1.5:2);
  const canvas=$('.return-particles'),context=canvas.getContext('2d');if(!context)return null;
  canvas.width=Math.ceil(model.w*ratio);canvas.height=Math.ceil(model.h*ratio);context.scale(ratio,ratio);
  return {...model,context};
}
async function restartFeaturedChoices() {
  const feature=$('#hero-feature');
  if(featuredDraw.busy||state.view!=='menu'||feature.dataset.drawState!=='revealed')return;
  $('.draw-hand-scroll')?.scrollTo?.({left:0,behavior:'instant'});
  // Mobile uses the same return, with fewer particles and sharp native cards.
  if(menuReducedMotion.matches||typeof feature.animate!=='function') {dealFeaturedChoices(true);return;}
  stopFeaturedDraw();featuredDraw.busy=true;
  const revision=featuredDraw.revision,isCurrent=()=>revision===featuredDraw.revision;
  let dealt=false;
  const complete=()=>{
    if(!isCurrent())return;
    if(!dealt){dealFeaturedChoices(false,true);dealt=true;}
    stopFeaturedDraw();
    $('[data-pick-feature="0"]')?.focus({preventScroll:true});
    $('#feature-announcement').textContent='七张推荐牌已重新组成，请任选一张。';
  };
  featuredDraw.finish=complete;
  try {
    const layer=buildFeaturedReturnLayers();if(!layer){complete();return;}
    const text=createFeaturedCopyTransition(null,'choosing',layer.text);
    const {context,w,h,particles}=layer;
    const cards=[...document.querySelectorAll('[data-pick-feature]')];
    cards.forEach(card=>{card.classList.remove('is-picked','is-armed');card.style.setProperty('--return-opacity','0');});
    feature.dataset.drawState='returning';feature.dataset.drawPhase='returning-scatter';feature.classList.add('is-returning');feature.setAttribute('aria-busy','true');
    document.querySelectorAll('[data-pick-feature]').forEach(card=>card.setAttribute('aria-disabled','true'));
    $('#feature-announcement').textContent='酒杯正在散成粒子，重新组成七张推荐牌。';
    await new Promise(resolve=>{
      let start;featuredDraw.cancelParticles=resolve;
      function frame(time) {
        try{paintFrame(time);}catch{resolve();}
      }
      function paintFrame(time) {
        if(!isCurrent()){resolve();return;}
        if(start===undefined){
          start=time;
          const opacityFrames=Array.from({length:25},(_,i)=>({opacity:featuredSmooth(i/24),offset:i/24}));
          // Opacity is composited by the browser; card style/shadow never changes
          // inside the particle loop. The live cup retains its original shadow.
          cards.forEach((card,index)=>{
            const animation=card.animate(opacityFrames,{duration:800,delay:1600*(.42+Math.abs(index-3)*.012),fill:'both',easing:'linear'});
            animation.startTime=time;animation.finished.catch(()=>{});featuredDraw.animations.push(animation);
          });
          const animation=$('.feature-glass').animate(opacityFrames.map(frame=>({...frame,opacity:1-frame.opacity})),{duration:576,fill:'both',easing:'linear'});
          animation.startTime=time;animation.finished.catch(()=>{});featuredDraw.animations.push(animation);
        }
        const progress=Math.min((time-start)/1600,1),material=featuredSmooth((progress-.56)/.42);
        if(progress>=.52&&feature.dataset.drawPhase!=='returning-forming')feature.dataset.drawPhase='returning-forming';
        context.clearRect(0,0,w,h);
        for(const particle of particles){
          const gather=featuredSmooth((progress-particle.path.delay)/(particle.path.end-particle.path.delay)),x=particle.x,y=particle.y;
          context.fillStyle=particle.colors[Math.round(gather*32)];context.globalAlpha=.82*(1-material)*featuredSmooth((progress-particle.path.delay)/.18)*(particle.start.alpha+(particle.target.alpha-particle.start.alpha)*gather);
          context.beginPath();context.arc(((x[3]*gather+x[2])*gather+x[1])*gather+x[0],((y[3]*gather+y[2])*gather+y[1])*gather+y[0],particle.radius+Math.sin(gather*Math.PI)*.18,0,Math.PI*2);context.fill();
        }
        context.globalAlpha=1;
        startFeaturedCopyTransition(text,time);
        if(progress<1)featuredDraw.frame=requestAnimationFrame(frame);else{featuredDraw.cancelParticles=null;resolve();}
      }
      featuredDraw.frame=requestAnimationFrame(frame);
    });
    complete();
  } catch {complete();}
}

document.addEventListener('visibilitychange',()=>{if(document.hidden)featuredDraw.finish?.();});
menuReducedMotion.addEventListener('change',()=>{if(menuReducedMotion.matches)featuredDraw.finish?.();});

renderFeaturedDrink();
$('#menu-summary').textContent = `${DRINKS.filter(d=>d.category==='classic').length} 款经典 · ${DRINKS.filter(d=>d.category==='signature').length} 款特调 · ${DRINKS.filter(d=>d.category==='zero').length} 款无酒精`;
$('.hero-copy').insertAdjacentHTML('beforeend', `<button class="pantry-entry" data-open-pantry>家里有材料？用原料选一杯 ${icon('arrow')}</button>`);
renderMenu({animate:false}); renderSaved();
menuReducedMotion.addEventListener('change', () => {
  selectionMotion.finish?.(false); stopCatalogResponse(); renderMenu({animate:false});
  if (menuReducedMotion.matches) {
    stopViewTransition();
    if (detailMotion.closing) closeDetail(false); else stopDetailTransition();
    stopDetailShake();
  }
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) {
    selectionMotion.finish?.(false); stopViewTransition();
    if (detailMotion.closing) closeDetail(false); else stopDetailTransition();
  }
});

// Keep one highlight per single-selection group, including wrapped mobile rows.
// Positioning and hover use separate layers; hit targets stay fixed and text never pulses.
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const groups = [...document.querySelectorAll('.collection-tabs, .flavor-filters')];
  groups.push($('.selection-modes'));
  const controllers = groups.map(group => {
    const buttons = [...group.querySelectorAll(':scope > button')];
    const highlight = document.createElement('span');
    highlight.className = 'filter-highlight';
    highlight.setAttribute('aria-hidden', 'true');
    const surface=document.createElement('span');surface.className='filter-surface';highlight.append(surface);
    buttons.forEach(button => {
      const label = document.createElement('span');
      label.className = 'filter-label';
      label.textContent = button.textContent;
      button.replaceChildren(label);
    });
    group.prepend(highlight);
    group.classList.add('sliding-filters');
    let animation,placed=false,destination;
    function setEmphasis(selected) {
      buttons.forEach(button=>{
        const label=button.querySelector('.filter-label');
        if(button===selected)label.dataset.capsuleEmphasis='selected';else delete label.dataset.capsuleEmphasis;
      });
    }
    function update(animate = true) {
      const selected = buttons.find(button => button.getAttribute('aria-pressed') === 'true');
      if (!selected || !group.getClientRects().length || !selected.offsetWidth) return;
      const parent = group.getBoundingClientRect();
      const button = selected.getBoundingClientRect();
      const next = {
        x:button.left - parent.left - group.clientLeft + group.scrollLeft,
        y:button.top - parent.top - group.clientTop + group.scrollTop,
        w:button.width, h:button.height
      };
      if (destination && Object.keys(next).every(key => next[key] === destination[key])) {
        if (!animate) {animation?.cancel();setEmphasis(selected);}
        return;
      }
      const current = placed ? highlight.getBoundingClientRect() : null;
      const from = current && {
        x:current.left - parent.left - group.clientLeft + group.scrollLeft,
        y:current.top - parent.top - group.clientTop + group.scrollTop,
        w:current.width, h:current.height
      };
      animation?.cancel();setEmphasis(selected);
      const target = `translate3d(${next.x}px, ${next.y}px, 0)`;
      highlight.style.width = `${next.w}px`;
      highlight.style.height = `${next.h}px`;
      highlight.style.transform = target;
      group.classList.add('has-sliding-highlight');
      destination = next;
      placed = true;
      if (animate && from && !reducedMotion.matches && highlight.animate) {
        animation = highlight.animate([
          {transform:`translate3d(${from.x}px, ${from.y}px, 0) scale(${from.w / next.w}, ${from.h / next.h})`},
          {transform:target}
        ], {duration:420, easing:'cubic-bezier(.22, 1.12, .36, 1)'});
      } else setEmphasis(selected);
    }
    new MutationObserver(() => update()).observe(group, {subtree:true, attributes:true, attributeFilter:['aria-pressed']});
    update(false);
    return {group, buttons, update};
  });
  let resizeFrame;
  const refresh = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => controllers.forEach(controller => controller.update(false)));
  };
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(refresh);
    controllers.forEach(({group, buttons}) => [group, ...buttons].forEach(node => observer.observe(node)));
  } else window.addEventListener('resize', refresh, {passive:true});
  document.fonts?.ready.then(refresh);
  reducedMotion.addEventListener('change', refresh);
})();
