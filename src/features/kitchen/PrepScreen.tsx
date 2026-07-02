import { useEffect, useMemo, useState } from 'react'
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

export function PrepScreen({
  selectedRecipe,
  prepPlan,
  servings,
  isLoading,
  error,
  onBack,
  onServingsChange,
  onRefreshPlan,
  onStartCooking,
}: PrepScreenProps) {
  const ingredients: PrepIngredient[] = useMemo(
    () =>
      prepPlan?.ingredients ??
      selectedRecipe.ingredients.map((ingredient) => ({
        name: ingredient.name,
        originalAmount: ingredient.amount,
        scaledAmount: ingredient.amount,
        note: '来自视频解析',
      })),
    [prepPlan?.ingredients, selectedRecipe.ingredients],
  )
  const tools = useMemo(() => prepPlan?.tools ?? selectedRecipe.tools, [prepPlan?.tools, selectedRecipe.tools])
  const [confirmedIngredients, setConfirmedIngredients] = useState<Set<string>>(() => new Set())
  const [confirmedTools, setConfirmedTools] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setConfirmedIngredients((previous) => {
      const next = new Set<string>()
      const names = new Set(ingredients.map((ingredient) => ingredient.name))
      previous.forEach((name) => {
        if (names.has(name)) {
          next.add(name)
        }
      })
      return next
    })
  }, [ingredients])

  useEffect(() => {
    setConfirmedTools((previous) => {
      const next = new Set<string>()
      const names = new Set(tools)
      previous.forEach((name) => {
        if (names.has(name)) {
          next.add(name)
        }
      })
      return next
    })
  }, [tools])

  const confirmedIngredientCount = ingredients.filter((ingredient) => confirmedIngredients.has(ingredient.name)).length
  const confirmedToolCount = tools.filter((tool) => confirmedTools.has(tool)).length
  const pendingCount = ingredients.length + tools.length - confirmedIngredientCount - confirmedToolCount
  const isEverythingConfirmed = pendingCount === 0

  const toggleIngredient = (name: string) => {
    setConfirmedIngredients((previous) => {
      const next = new Set(previous)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const toggleTool = (name: string) => {
    setConfirmedTools((previous) => {
      const next = new Set(previous)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const handleStartCooking = () => {
    if (!isEverythingConfirmed && !window.confirm('还有食材或工具未确认，确定开始吗？')) {
      return
    }

    onStartCooking()
  }

  return (
    <main className="mobile-page-stack prep-screen prep-check-screen">
      <header className="prep-check-header">
        <button className="back-button ghost-button small-button prep-check-back" onClick={onBack}>
          <span className="back-button-icon" aria-hidden="true">←</span>
          <span>返回</span>
        </button>
        <div className="prep-check-header-copy">
          <span className="section-kicker">备菜确认</span>
          <strong>{selectedRecipe.title}</strong>
          <p>确认食材和工具都在手边，再开始跟做。</p>
        </div>
      </header>

      <section className="panel mobile-page-section prep-serving-card">
        <div className="prep-card-heading">
          <div>
            <h1>这次做几人份？</h1>
            <p>系统会按人数换算食材，优先参考视频中识别到的基础份量。</p>
          </div>
          {isLoading ? <span className="pill-muted">计算中</span> : null}
        </div>
        <div className="prep-serving-row" role="group" aria-label="选择人数">
          {[1, 2, 3, 4, 5, 6].map((option) => (
            <button
              key={option}
              type="button"
              className={`prep-serving-button ${servings === option ? 'prep-serving-button-active' : ''}`}
              onClick={() => onServingsChange(option)}
            >
              {option}人
            </button>
          ))}
        </div>
        <p className="prep-serving-result">已按 {servings} 人份换算食材。</p>
      </section>

      <section className="panel mobile-page-section prep-check-card">
        <div className="prep-card-heading">
          <div>
            <span className="section-kicker">食材清单</span>
            <h2>食材清单</h2>
            <p>食材来自视频解析，份量已按人数换算。</p>
          </div>
        </div>

        {error ? (
          <div className="empty-state-card">
            <strong>备菜计划暂时无法加载</strong>
            <p>{error}</p>
            <button className="primary-button" onClick={onRefreshPlan}>重新计算</button>
          </div>
        ) : null}

        <ul className="prep-ingredient-list prep-check-list">
          {ingredients.map((ingredient) => {
            const checked = confirmedIngredients.has(ingredient.name)
            return (
              <li key={ingredient.name} className="prep-ingredient-item prep-check-item">
                <label>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleIngredient(ingredient.name)}
                  />
                  <span className="prep-check-main">
                    <strong>{ingredient.name}</strong>
                    <em>{ingredient.note ?? '来自视频解析 / AI 换算'}</em>
                  </span>
                  <small>{ingredient.scaledAmount}</small>
                </label>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="panel mobile-page-section prep-check-card prep-tool-card">
        <div className="prep-card-heading">
          <div>
            <span className="section-kicker">工具确认</span>
            <h2>工具确认</h2>
            <p>确认这些工具在手边，再进入跟做。</p>
          </div>
        </div>
        <div className="tool-row prep-tool-check-row" role="group" aria-label="工具确认">
          {tools.map((tool) => {
            const checked = confirmedTools.has(tool)
            return (
              <button
                key={tool}
                type="button"
                className={`tool-chip prep-tool-chip ${checked ? 'prep-tool-chip-active' : ''}`}
                onClick={() => toggleTool(tool)}
                aria-pressed={checked}
              >
                <span aria-hidden="true">{checked ? '✓' : '○'}</span>
                {tool}
              </button>
            )
          })}
        </div>
      </section>

      <div className="recipe-detail-bottom-bar prep-bottom-bar prep-check-bottom-bar">
        <div className="detail-actions prep-check-actions">
          <button className="ghost-button recipe-detail-favorite-button" onClick={onRefreshPlan}>
            重新计算
          </button>
          <button
            className={`primary-button recipe-detail-cta ${isEverythingConfirmed ? 'prep-start-ready' : 'prep-start-pending'}`}
            onClick={handleStartCooking}
            disabled={isLoading}
          >
            {isEverythingConfirmed ? '食材已备齐，开始做菜' : `还有 ${pendingCount} 项未确认`}
          </button>
        </div>
      </div>
    </main>
  )
}
