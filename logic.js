/* 风味标签与推荐权重为本演示的编辑性规则，不代表客观评分或酒精浓度。 */
function filterDrinks(drinks, filters) {
  const query = (filters.query || '').trim().toLocaleLowerCase();
  return drinks.filter(d =>
    (filters.flavor === 'all' || d.flavor === filters.flavor) &&
    (filters.base === 'all' || d.base === filters.base) &&
    (!filters.category || filters.category === 'all' || d.category === filters.category) &&
    (!query || [d.name, d.cn, d.baseName, d.tag, ...(d.layers || []), ...d.ingredients.map(x => x[0])].join(' ').toLocaleLowerCase().includes(query))
  );
}
function rankDrinks(drinks, answers) {
  // 基酒是明确约束；风味和酒体在符合该基酒的酒款之间排序。
  return drinks.filter(d => answers.base === 'all' || d.base === answers.base)
    .map((d, index) => ({drink: d, index, score:
      (d.flavor === answers.flavor ? 6 : 0) + (d.body === answers.body ? 3 : 0)}))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(x => x.drink);
}
function pickFeaturedDrink(drinks, previousId, random = Math.random) {
  if (!drinks.length) return undefined;
  const alternatives = drinks.filter(drink => drink.id !== previousId);
  const pool = alternatives.length ? alternatives : drinks;
  return pool[Math.floor(random() * pool.length)];
}
if (typeof module !== 'undefined' && module.exports) module.exports = {filterDrinks, rankDrinks, pickFeaturedDrink};
