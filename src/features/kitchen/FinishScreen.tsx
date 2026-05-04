import type { Recipe } from '../../types.js'

type FinishScreenProps = {
  selectedRecipe: Recipe
  recommendations: Recipe[]
  historyCount: number
  currentRecipeCompletions: number
  isFavorite: boolean
  onRestartRecipe: () => void
  onToggleFavorite: () => void
  onOpenCurrentRecipeDetail: () => void
  onOpenRecentHistory: () => void
  onOpenCommunity: () => void
  onOpenRecipe: (recipeId: string) => void
  onBackToDiscover: () => void
}

export function FinishScreen({
  selectedRecipe,
  recommendations,
  historyCount,
  currentRecipeCompletions,
  isFavorite,
  onRestartRecipe,
  onToggleFavorite,
  onOpenCurrentRecipeDetail,
  onOpenRecentHistory,
  onOpenCommunity,
  onOpenRecipe,
  onBackToDiscover,
}: FinishScreenProps) {
  return (
    <main className="finish-layout">
      <section className="panel finish-panel">
        <span className="eyebrow">完成啦</span>
        <h1>{`${selectedRecipe.title} 已经出锅`}</h1>
        <p className="finish-copy">
          这次完成已经写进记录里了。你现在可以回看这道菜、去最近做过继续管理记录，
          也可以直接去交流区写下这次做菜心得。
        </p>

        <div className="finish-metrics">
          <article className="metric-card">
            <span className="metric-label">累计完成</span>
            <strong>{historyCount} 次</strong>
            <p>做完的菜会进入最近做过，方便你下次继续查看。</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">这道菜已完成</span>
            <strong>{currentRecipeCompletions} 次</strong>
            <p>后面可以继续在这里接收藏、评分和更个性化的推荐。</p>
          </article>
        </div>

        <section className="finish-followup-card">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-kicker">下一步</span>
              <h3>完成后继续做什么</h3>
            </div>
          </div>

          <div className="finish-followup-grid">
            <button type="button" className="finish-followup-item" onClick={onOpenCurrentRecipeDetail}>
              <span>回看</span>
              <strong>返回菜谱详情</strong>
              <p>再看一遍食材、步骤和易错点，方便复盘这次做菜。</p>
            </button>

            <button type="button" className="finish-followup-item" onClick={onToggleFavorite}>
              <span>收藏</span>
              <strong>{isFavorite ? '已收藏这道菜' : '收藏这道菜'}</strong>
              <p>先把这道菜收进“我的收藏”，后面回到个人页可以继续查看。</p>
            </button>

            <button type="button" className="finish-followup-item" onClick={onOpenRecentHistory}>
              <span>记录</span>
              <strong>查看最近做过</strong>
              <p>刚完成的这道菜会出现在最近记录里，后面能继续扩成完整历史页。</p>
            </button>

            <button type="button" className="finish-followup-item" onClick={onOpenCommunity}>
              <span>交流</span>
              <strong>去写做菜心得</strong>
              <p>把这次成功经验、翻车点或食材替换写到交流区里。</p>
            </button>
          </div>
        </section>

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
              <h3>推荐菜谱稍后会出现在这里</h3>
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
