/* Matches the existing recipes against explicitly selected household stock.
   Quantities, tools and optional garnish are not inferred. */
const PANTRY_GROUPS = [
  {name:'基酒', items:[
    ['gin','金酒','gin 杜松子'], ['tequila','100% 龙舌兰','tequila'],
    ['white-rum','白朗姆','rum 古巴朗姆'], ['dark-rum','深色朗姆','rum 黑朗姆'],
    ['bourbon','波本威士忌','whiskey bourbon'], ['rye','黑麦威士忌','whiskey rye'],
    ['vodka','伏特加','vodka'], ['citrus-vodka','柠檬风味伏特加','citron vodka']
  ]},
  {name:'利口酒与苦精', items:[
    ['campari','Campari','金巴利 苦酒'], ['sweet-vermouth','甜红味美思','vermouth'],
    ['dry-vermouth','干味美思','vermouth'], ['orange-liqueur','橙味利口酒 / Cointreau','君度'],
    ['coffee-liqueur','咖啡利口酒 / Kahlúa','甘露'], ['bitters','Angostura 苦精','安格式'],
    ['maraschino','Maraschino Luxardo 利口酒','樱桃 马拉斯奇诺'], ['violet','紫罗兰利口酒','creme de violette']
  ]},
  {name:'水果与果汁', items:[
    ['lime','青柠 / 鲜青柠汁','lime'], ['lemon','柠檬 / 鲜柠檬汁','lemon'],
    ['grapefruit','葡萄柚汁','西柚'], ['pineapple','菠萝汁','凤梨'],
    ['cranberry','蔓越莓汁','cranberry'], ['peach','白桃果泥','peach'],
    ['strawberry','草莓果泥','strawberry'], ['passionfruit','百香果果肉','passion fruit'],
    ['pear','梨汁','pear'], ['cucumber','过滤黄瓜汁','cucumber']
  ]},
  {name:'茶、咖啡与饮料', items:[
    ['jasmine','冷却茉莉茶','花茶'], ['oolong','冷却浓乌龙茶','乌龙'],
    ['soda','苏打水','气泡水 soda'], ['ginger-soda','无酒精姜味苏打水','ginger'],
    ['cold-brew','冷萃咖啡','coffee'], ['espresso','浓缩咖啡','espresso'],
    ['coconut-milk','椰奶','coconut milk'], ['coconut-cream','椰奶油','cream of coconut'],
    ['ginger-beer','无酒精姜汁汽水 / Ginger Beer','姜啤 姜汁啤酒'], ['grapefruit-soda','粉葡萄柚汽水','西柚 soda'],
    ['osmanthus','冷却桂花茶','桂花 osmanthus'], ['matcha','冷却抹茶液','matcha'],
    ['smoked-tea','冷却烟熏红茶','正山小种 lapsang'], ['tonic','无酒精汤力水','tonic']
  ]},
  {name:'糖与糖浆', items:[
    ['sugar','细砂糖 / 白蔗糖','糖'], ['sugar-cube','方糖','糖'],
    ['syrup','糖浆（1:1）','simple syrup'], ['honey-syrup','蜂蜜糖浆（1:1）','蜂蜜'],
    ['chili-syrup','辣椒糖浆','辣'], ['plum-syrup','梅子糖浆','plum']
  ]},
  {name:'香草与其他风味', items:[
    ['mint','薄荷','mint'], ['basil','鲜罗勒叶','basil'],
    ['sesame','无糖黑芝麻酱','芝麻'], ['salt','细盐','盐'], ['chili-powder','辣椒粉','辣']
  ]},
  {name:'基础材料', items:[['ice','冰块','冰'], ['water','饮用水','水']]}
];
const PANTRY_ITEMS = PANTRY_GROUPS.flatMap(g => g.items.map(([id,label,aliases]) => ({id,label,aliases})));
const PANTRY_LABELS = Object.fromEntries(PANTRY_ITEMS.map(item => [item.id,item.label]));
// The first requirement is the exact base spirit (alternatives are grouped).
// Optional Martini garnish is excluded; ice is required by every listed method.
const PANTRY_RECIPES = {
  'negroni':['gin','campari','sweet-vermouth'],
  'margarita':['tequila','orange-liqueur','lime'],
  'daiquiri':['white-rum','lime','sugar'],
  'dry-martini':['gin','dry-vermouth'],
  'old-fashioned':[['bourbon','rye'],'sugar-cube','bitters','water'],
  'mojito':['white-rum','lime','mint','sugar','soda'],
  'cosmopolitan':['citrus-vodka','orange-liqueur','lime','cranberry'],
  'pina-colada':['white-rum','coconut-cream','pineapple'],
  'espresso-martini':['vodka','coffee-liqueur','syrup','espresso'],
  'jasmine-grapefruit':['gin','jasmine','grapefruit','lemon','honey-syrup','soda'],
  'oolong-peach':['bourbon','oolong','peach','lemon','syrup'],
  'spicy-pineapple':['dark-rum','pineapple','lime','chili-syrup','salt','chili-powder'],
  'sesame-coffee':['vodka','cold-brew','coconut-milk','sesame','syrup'],
  'passion-ginger':['passionfruit','lime','syrup','ginger-soda'],
  'strawberry-basil':['strawberry','lemon','syrup','basil','soda'],
  'whiskey-sour':['bourbon','lemon','syrup'],
  'john-collins':['gin','lemon','syrup','soda'],
  'moscow-mule':['vodka','ginger-beer','lime'],
  'paloma':['tequila','lime','salt','grapefruit-soda'],
  'aviation':['gin','maraschino','lemon','violet'],
  'dark-stormy':['dark-rum','ginger-beer'],
  'osmanthus-pear':['gin','osmanthus','pear','lemon','honey-syrup'],
  'matcha-cloud':['vodka','matcha','coconut-milk','honey-syrup'],
  'plum-dusk':['bourbon','smoked-tea','plum-syrup','lemon'],
  'cucumber-tonic':['cucumber','lime','syrup','tonic'],
  'peach-jasmine-soda':['peach','jasmine','lemon','soda','syrup'],
  'berry-coconut-cloud':['strawberry','coconut-milk','lemon','syrup']
};
function matchPantry(drinks, selected, onlyZero = false) {
  const stock = new Set(selected);
  if (!stock.size) return [];
  const groups = value => Array.isArray(value) ? value : [value];
  return drinks.flatMap((drink,index) => {
    const recipe = PANTRY_RECIPES[drink.id];
    if (!recipe || (onlyZero && drink.base !== 'none')) return [];
    // Never suggest an alcoholic base that the visitor has not selected.
    if (drink.base !== 'none' && !groups(recipe[0]).some(id => stock.has(id))) return [];
    const requirements = [...recipe, 'ice'].map(groups);
    const matched = requirements.filter(ids => ids.some(id => stock.has(id)));
    if (!matched.length) return [];
    const missing = requirements.filter(ids => !ids.some(id => stock.has(id)))
      .map(ids => ids.map(id => PANTRY_LABELS[id]).join(' 或 '));
    return [{drink,missing,matched:matched.length,total:requirements.length,index}];
  }).sort((a,b) => a.missing.length - b.missing.length || b.matched/b.total - a.matched/a.total || a.index-b.index);
}
if (typeof module !== 'undefined' && module.exports) module.exports = {PANTRY_GROUPS,PANTRY_ITEMS,PANTRY_RECIPES,matchPantry};
