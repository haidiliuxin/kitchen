import { difficultyOptions, formatMinutes, recipeCardStyle, timeOptions } from './shared.js'
import type { Difficulty, Recipe } from '../../types.js'
import type { TimeLimit } from './shared.js'

type DiscoverScreenProps = {
  selectedRecipe: Recipe | null
  recipesData: Recipe[]
  searchQuery: string
  difficulty: '全部' | Difficulty
  timeLimit: TimeLimit
  isRecipesLoading: boolean
  isHistoryLoading: boolean
  recipesError: string | null
  historyCount: number
  currentRecipeCompletions: number
  onStartCooking: () => void
  onRetry: () => void
  onSelectRecipe: (recipeId: string) => void
  onSearchQueryChange: (value: string) => void
  onDifficultyChange: (value: '全部' | Difficulty) => void
  onTimeLimitChange: (value: TimeLimit) => void
}

export function DiscoverScreen({
  selectedRecipe,
  recipesData,
  searchQuery,
  difficulty,
  timeLimit,
  isRecipesLoading,
  isHistoryLoading,
  recipesError,
  historyCount,
  currentRecipeCompletions,
  onStartCooking,
  onRetry,
  onSelectRecipe,
  onSearchQueryChange,
  onDifficultyChange,
  onTimeLimitChange,
}: DiscoverScreenProps) {
  return (
    <>
      <header className="hero-banner">
        <div className="hero-copy">
          <span className="eyebrow">前后端完整版本</span>
          <h1>小白下厨</h1>
          <p className="hero-text">
            现在这版已经接上真实数据库和 API。菜谱、历史记录、推荐结果和 AI
            教练回复都来自后端服务，前端只负责把做饭这件事变得更顺手。
          </p>
          <div className="hero-actions">
            <button className="primary-button" onClick={onStartCooking} disabled={!selectedRecipe}>
              {selectedRecipe ? `直接开始做 ${selectedRecipe.title}` : '先挑一道菜'}
            </button>
            <button
              className="ghost-button"
              onClick={() => {
                const focusTarget = document.getElementById('recipe-library')
                focusTarget?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              浏览菜谱库
            </button>
          </div>
        </div>

        <div className="hero-metrics">
          <article className="metric-card">
            <span className="metric-label">当前菜谱</span>
            <strong>{isRecipesLoading ? '载入中' : `${recipesData.length} 道`}</strong>
            <p>搜索和筛选都由后端 API 驱动，数据来自 SQLite。</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">后端状态</span>
            <strong>{recipesError ? '异常' : '已连接'}</strong>
            <p>菜谱详情、推荐结果和 AI 回复都通过真实接口返回。</p>
          </article>
          <article className="metric-card">
            <span className="metric-label">完成记录</span>
            <strong>{isHistoryLoading ? '载入中' : `${historyCount} 次`}</strong>
            <p>每次完成都会写入数据库，而不是只保存在浏览器里。</p>
          </article>
        </div>
      </header>

      <main className="discover-layout" id="recipe-library">
        <section className="panel library-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">发现适合现在的菜</span>
              <h2>菜谱库</h2>
            </div>
            <p>搜索条件会实时请求后端接口，数据库里只返回匹配结果。</p>
          </div>

          <div className="filter-bar">
            <label className="search-field">
              <span>搜菜名、食材或场景</span>
              <input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="例如：鸡蛋、番茄、15 分钟、一人晚饭"
              />
            </label>

            <label className="select-field">
              <span>难度</span>
              <select
                value={difficulty}
                onChange={(event) => onDifficultyChange(event.target.value as '全部' | Difficulty)}
              >
                {difficultyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="select-field">
              <span>总时长</span>
              <select
                value={timeLimit}
                onChange={(event) =>
                  onTimeLimitChange(
                    event.target.value === '全部'
                      ? '全部'
                      : (Number(event.target.value) as Exclude<TimeLimit, '全部'>),
                  )
                }
              >
                {timeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === '全部' ? '全部' : `${option} 分钟内`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {recipesError ? (
            <div className="status-card">
              <h3>菜谱接口暂时不可用</h3>
              <p>{recipesError}</p>
              <button className="primary-button" onClick={onRetry}>
                重新加载
              </button>
            </div>
          ) : isRecipesLoading && recipesData.length === 0 ? (
            <div className="status-card">
              <h3>正在连接菜谱服务</h3>
              <p>后端正在从数据库读取菜谱，请稍等一下。</p>
            </div>
          ) : (
            <div className="card-list">
              {recipesData.length > 0 ? (
                recipesData.map((recipe) => (
                  <button
                    key={recipe.id}
                    className={`recipe-card ${
                      selectedRecipe?.id === recipe.id ? 'recipe-card-active' : ''
                    }`}
                    onClick={() => onSelectRecipe(recipe.id)}
                  >
                    <div className="recipe-card-cover" style={recipeCardStyle(recipe)}>
                      <span>{recipe.scene}</span>
                      <strong>{recipe.highlight}</strong>
                    </div>
                    <div className="recipe-card-body">
                      <div className="recipe-card-head">
                        <div>
                          <h3>{recipe.title}</h3>
                          <p>{recipe.subtitle}</p>
                        </div>
                        <span className="recipe-chip">{recipe.difficulty}</span>
                      </div>
                      <div className="recipe-meta">
                        <span>{formatMinutes(recipe.duration)}</span>
                        <span>{recipe.servings} 人份</span>
                        <span>{recipe.steps.length} 步完成</span>
                      </div>
                      <div className="tag-row">
                        {recipe.tags.map((tag) => (
                          <span key={tag} className="tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <h3>没有找到完全匹配的菜</h3>
                  <p>可以试试换个食材关键词，或者把时长筛选放宽一点。</p>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="panel detail-panel">
          {selectedRecipe ? (
            <>
              <div className="recipe-detail-hero" style={recipeCardStyle(selectedRecipe)}>
                <span className="detail-scene">{selectedRecipe.scene}</span>
                <h2>{selectedRecipe.title}</h2>
                <p>{selectedRecipe.description}</p>
              </div>

              <div className="detail-stack">
                <section className="detail-block">
                  <div className="section-heading compact-heading">
                    <div>
                      <span className="section-kicker">这道菜适合谁</span>
                      <h3>新手说明</h3>
                    </div>
                  </div>
                  <div className="insight-grid">
                    <article className="insight-card">
                      <span>成功关键</span>
                      <strong>{selectedRecipe.highlight}</strong>
                    </article>
                    <article className="insight-card">
                      <span>翻车风险</span>
                      <strong>{selectedRecipe.riskNote}</strong>
                    </article>
                  </div>
                </section>

                <section className="detail-block">
                  <div className="section-heading compact-heading">
                    <div>
                      <span className="section-kicker">开始前先备好</span>
                      <h3>食材与工具</h3>
                    </div>
                  </div>
                  <ul className="ingredient-list">
                    {selectedRecipe.ingredients.map((ingredient) => (
                      <li key={ingredient.name}>
                        <span>{ingredient.name}</span>
                        <strong>{ingredient.amount}</strong>
                      </li>
                    ))}
                  </ul>
                  <div className="tool-row">
                    {selectedRecipe.tools.map((tool) => (
                      <span key={tool} className="tool-chip">
                        {tool}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="detail-block">
                  <div className="section-heading compact-heading">
                    <div>
                      <span className="section-kicker">后端返回的步骤</span>
                      <h3>步骤预览</h3>
                    </div>
                  </div>
                  <ol className="step-preview-list">
                    {selectedRecipe.steps.map((step, index) => (
                      <li key={step.title}>
                        <span>{`0${index + 1}`}</span>
                        <div>
                          <strong>{step.title}</strong>
                          <p>{step.instruction}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="detail-block">
                  <div className="section-heading compact-heading">
                    <div>
                      <span className="section-kicker">失败也有兜底</span>
                      <h3>常见补救</h3>
                    </div>
                  </div>
                  <div className="rescue-list">
                    {selectedRecipe.rescueTips.slice(0, 3).map((tip) => (
                      <article key={tip.issue} className="rescue-card">
                        <strong>{tip.issue}</strong>
                        <p>{tip.answer}</p>
                      </article>
                    ))}
                  </div>
                </section>

                <div className="detail-actions">
                  <button className="primary-button" onClick={onStartCooking}>
                    进入跟做模式
                  </button>
                  <p>
                    已做成 <strong>{currentRecipeCompletions}</strong> 次
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="status-card">
              <h3>先挑一道菜</h3>
              <p>数据库里有结果后，这里会显示完整的菜谱详情和步骤拆解。</p>
            </div>
          )}
        </aside>
      </main>
    </>
  )
}
