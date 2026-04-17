import type { Recipe } from '../../types.js'

type FinishScreenProps = {
  selectedRecipe: Recipe
  recommendations: Recipe[]
  historyCount: number
  currentRecipeCompletions: number
  onRestartRecipe: () => void
  onOpenRecipe: (recipeId: string) => void
  onBackToDiscover: () => void
}

export function FinishScreen({
  selectedRecipe,
  recommendations,
  historyCount,
  currentRecipeCompletions,
  onRestartRecipe,
  onOpenRecipe,
  onBackToDiscover,
}: FinishScreenProps) {
  return (
    <main className="finish-layout">
      <section className="panel finish-panel">
        <span className="eyebrow">完成啦</span>
        <h1>{`${selectedRecipe.title} 已经出锅`}</h1>
        <p className="finish-copy">
          这次完成已经写进数据库，推荐菜谱也来自后端接口。接下来你可以继续做同一道，或者试试系统根据历史记录给出的下一道菜。
        </p>

        <div className="finish-metrics">
          <article className="metric-card">
            <span className="metric-label">累计完成</span>
            <strong>{historyCount} 次</strong>
            <p>数据来自 SQLite 历史表，刷新页面也不会丢失。</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">本菜成功次数</span>
            <strong>{currentRecipeCompletions} 次</strong>
            <p>后续可以继续往这里接用户画像和个性化推荐逻辑。</p>
          </article>
        </div>

        <div className="next-grid">
          {recommendations.length > 0 ? (
            recommendations.map((recipe) => (
              <article key={recipe.id} className="next-card">
                <span>{recipe.scene}</span>
                <strong>{recipe.title}</strong>
                <p>{recipe.highlight}</p>
                <button className="ghost-button" onClick={() => onOpenRecipe(recipe.id)}>
                  去看看这道
                </button>
              </article>
            ))
          ) : (
            <div className="status-card">
              <h3>推荐菜谱稍后会在这里出现</h3>
              <p>如果接口刚重启或数据还没返回，也可以先回到菜谱库继续挑选。</p>
            </div>
          )}
        </div>

        <div className="finish-actions">
          <button className="primary-button" onClick={onRestartRecipe}>
            再做一次这道菜
          </button>
          <button className="ghost-button" onClick={onBackToDiscover}>
            返回继续挑菜
          </button>
        </div>
      </section>
    </main>
  )
}
