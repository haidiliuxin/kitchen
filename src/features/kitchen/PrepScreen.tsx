import type { MissingIngredient, PrepIngredient, PrepPlan, Recipe } from '../../types.js'

type PrepScreenProps = {
  selectedRecipe: Recipe
  prepPlan: PrepPlan | null
  servings: number
  missingIngredients: MissingIngredient[]
  isLoading: boolean
  error: string | null
  onBack: () => void
  onServingsChange: (servings: number) => void
  onToggleMissingIngredient: (name: string, defaultAmount: string) => void
  onMissingAmountChange: (name: string, amount: string) => void
  onRefreshPlan: () => void
  onStartCooking: () => void
}

function isMissing(missingIngredients: MissingIngredient[], name: string): boolean {
  return missingIngredients.some((item) => item.name === name)
}

function getMissingAmount(missingIngredients: MissingIngredient[], name: string): string {
  return missingIngredients.find((item) => item.name === name)?.amount ?? ''
}

export function PrepScreen({
  selectedRecipe,
  prepPlan,
  servings,
  missingIngredients,
  isLoading,
  error,
  onBack,
  onServingsChange,
  onToggleMissingIngredient,
  onMissingAmountChange,
  onRefreshPlan,
  onStartCooking,
}: PrepScreenProps) {
  const ingredients: PrepIngredient[] = prepPlan?.ingredients ?? selectedRecipe.ingredients.map((ingredient) => ({
    name: ingredient.name,
    originalAmount: ingredient.amount,
    scaledAmount: ingredient.amount,
  }))

  return (
    <main className="mobile-page-stack prep-screen">
      <header className="recipe-detail-topbar ds-detail-topbar">
        <button className="back-button ghost-button small-button recipe-detail-back-button" onClick={onBack}>
          <span className="back-button-icon" aria-hidden="true">←</span>
          <span>返回菜谱</span>
        </button>
        <div className="recipe-detail-topbar-copy">
          <span className="section-kicker">备菜模式</span>
          <strong>{selectedRecipe.title}</strong>
        </div>
      </header>

      <section className="panel mobile-page-section prep-hero ds-page-header ds-primary-header">
        <span className="section-kicker">先备好，再开火</span>
        <h1>这次做几人份？</h1>
        <p>系统会按人数换算食材。视频导入菜谱会优先参考视频里识别到的基础份量，再做人数换算。</p>
        <div className="prep-serving-row" role="group" aria-label="选择人数">
          {[1, 2, 3, 4, 5, 6].map((option) => (
            <button
              key={option}
              type="button"
              className={`prep-serving-button ${servings === option ? 'prep-serving-button-active' : ''}`}
              onClick={() => onServingsChange(option)}
            >
              {option} 人
            </button>
          ))}
        </div>
      </section>

      <section className="panel mobile-page-section ds-card-section">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">食材核对</span>
            <h2>按 {servings} 人份准备</h2>
          </div>
          {isLoading ? <span className="pill-muted">计算中</span> : null}
        </div>

        {error ? (
          <div className="empty-state-card">
            <strong>备菜计划暂时无法加载</strong>
            <p>{error}</p>
            <button className="primary-button" onClick={onRefreshPlan}>重新计算</button>
          </div>
        ) : null}

        <ul className="prep-ingredient-list">
          {ingredients.map((ingredient) => {
            const checked = isMissing(missingIngredients, ingredient.name)
            return (
              <li key={ingredient.name} className="prep-ingredient-item">
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleMissingIngredient(ingredient.name, ingredient.scaledAmount)}
                  />
                  <span>
                    <strong>{ingredient.name}</strong>
                    <small>{ingredient.scaledAmount}</small>
                    <em>勾选表示还没准备好</em>
                    {ingredient.note ? <em>{ingredient.note}</em> : null}
                  </span>
                </label>
                {checked ? (
                  <input
                    className="prep-missing-input"
                    value={getMissingAmount(missingIngredients, ingredient.name)}
                    onChange={(event) => onMissingAmountChange(ingredient.name, event.target.value)}
                    placeholder="备注（可选）"
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel mobile-page-section ds-card-section">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">工具确认</span>
            <h2>确认厨房工具</h2>
          </div>
        </div>
        <div className="tool-row">
          {(prepPlan?.tools ?? selectedRecipe.tools).map((tool) => (
            <span key={tool} className="tool-chip">{tool}</span>
          ))}
        </div>
        <p className="prep-note">{prepPlan?.note ?? '确认食材和工具都在手边，再进入正式做菜。'}</p>
      </section>

      <div className="recipe-detail-bottom-bar prep-bottom-bar">
        <div className="detail-actions">
          <button className="ghost-button recipe-detail-favorite-button" onClick={onRefreshPlan}>
            重新计算
          </button>
          <button className="primary-button recipe-detail-cta" onClick={onStartCooking} disabled={isLoading}>
            食材已备齐，开始做菜
          </button>
        </div>
      </div>
    </main>
  )
}
