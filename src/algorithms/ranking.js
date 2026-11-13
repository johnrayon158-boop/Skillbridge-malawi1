export function rankItems(items = []) {
  const list = Array.isArray(items) ? items : []

  const getScore = (item) => {
    const value = Number(item?.score ?? item?.match_score ?? item?.overall_score ?? item?.overallMatch ?? item?.match ?? item?.value ?? 0)
    return Number.isFinite(value) ? value : 0
  }
  return list.map((item, index) => ({ item, index }))
    .sort((a, b) => getScore(b.item) - getScore(a.item) || a.index - b.index)
    .map(({ item }) => item)
}
