import { useEffect, useState } from 'react'
import type { TouchEvent } from 'react'
import { difficultyOptions, formatMinutes, recipeCardStyle, timeOptions } from './shared.js'
import type { CookingHistoryEntry, Recipe } from '../../types.js'
import type { TimeLimit } from './shared.js'

type HomeScreenProps = {
  selectedRecipe: Recipe | null
  recipesData: Recipe[]
  searchQuery: string
  difficulty: (typeof difficultyOptions)[number]
  timeLimit: TimeLimit
  isRecipesLoading: boolean
  isHistoryLoading: boolean
  recipesError: string | null
  historyCount: number
  history: CookingHistoryEntry[]
  currentRecipeCompletions: number
  favoriteRecipeIds: string[]
  ongoingCookingSession: { recipeId: string; stepIndex: number } | null
  requestedEntry: {
    view: 'default' | 'history' | 'detail'
    recipeId?: string | null
    token: number
  }
  onStartCooking: () => void
  onResumeCooking: (recipeId: string, stepIndex: number) => void
  onToggleFavorite: (recipeId: string) => void
  onRetry: () => void
  onSelectRecipe: (recipeId: string) => void
  onSearchQueryChange: (value: string) => void
  onDifficultyChange: (value: (typeof difficultyOptions)[number]) => void
  onTimeLimitChange: (value: TimeLimit) => void
  onSearchEntryClick: () => void
  onImportEntryClick: () => void
  onDetailOpenChange?: (isOpen: boolean) => void
  onViewChange?: (view: 'default' | 'history' | 'detail' | 'topics' | 'filters') => void
  onDetailBackToSearch?: () => void
}

type HomeSubpage = 'topics' | 'history' | 'filters' | null

const topicCards = [
  { title: '15 分钟快手菜', description: '适合下班后快速开做，少步骤也容易成功。' },
  { title: '新手第一次做饭', description: '食材简单、翻车率低，适合第一次下厨。' },
  { title: '宿舍电饭锅料理', description: '更适合小空间和基础设备的做饭场景。' },
  { title: '比赛展示菜谱', description: '更适合做成完整产品展示和步骤演示。' },
]

const categories = ['家常菜', '早餐', '减脂餐', '夜宵', '一人食', '宿舍料理', '汤面', '下饭菜']

export function HomeScreen(props: HomeScreenProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [homeSubpage, setHomeSubpage] = useState<HomeSubpage>(null)
  const [isCategoryExpanded, setIsCategoryExpanded] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('全部分类')
  const [openFilter, setOpenFilter] = useState<'difficulty' | 'time' | null>(null)
  const [featuredIndex, setFeaturedIndex] = useState(1)
  const [isFeaturedAnimating, setIsFeaturedAnimating] = useState(true)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [touchCurrentX, setTouchCurrentX] = useState<number | null>(null)

  const featuredRecipes = props.recipesData.slice(0, 5)
  const allDifficultyOption = difficultyOptions[0]
  const allTimeOption = timeOptions[0]
  const selectedDifficultyLabel = props.difficulty === allDifficultyOption ? '全部' : props.difficulty
  const selectedTimeLabel = props.timeLimit === allTimeOption ? '全部' : `${props.timeLimit} 分钟内`
  const loopedFeaturedRecipes =
    featuredRecipes.length > 1
      ? [featuredRecipes[featuredRecipes.length - 1], ...featuredRecipes, featuredRecipes[0]]
      : featuredRecipes
  const activeFeaturedIndex =
    featuredRecipes.length > 1
      ? (featuredIndex - 1 + featuredRecipes.length) % featuredRecipes.length
      : 0
  const recentHistoryItems = props.history.reduce<Array<{ entry: CookingHistoryEntry; recipe: Recipe }>>((items, entry) => {
    if (items.some((item) => item.entry.recipeId === entry.recipeId)) {
      return items
    }

    const recipe = props.recipesData.find((candidate) => candidate.id === entry.recipeId)
    if (!recipe) {
      return items
    }

    items.push({ entry, recipe })
    return items
  }, [])
  const favoriteRecipes = props.recipesData.filter((recipe) => props.favoriteRecipeIds.includes(recipe.id))
  const ongoingRecipe =
    props.ongoingCookingSession
      ? props.recipesData.find((recipe) => recipe.id === props.ongoingCookingSession?.recipeId) ?? null
      : null

  useEffect(() => {
    props.onDetailOpenChange?.(isDetailOpen)
  }, [isDetailOpen, props.onDetailOpenChange])

  useEffect(() => {
    props.onViewChange?.(isDetailOpen ? 'detail' : homeSubpage ?? 'default')
  }, [homeSubpage, isDetailOpen, props.onViewChange])

  useEffect(() => {
    if (!props.requestedEntry.token) {
      return
    }

    if (props.requestedEntry.view === 'history') {
      setIsDetailOpen(false)
      setHomeSubpage('history')
      setIsCategoryExpanded(false)
      setOpenFilter(null)
      return
    }

    if (props.requestedEntry.view === 'detail' && props.selectedRecipe) {
      setHomeSubpage(null)
      setIsDetailOpen(true)
      setIsCategoryExpanded(false)
      setOpenFilter(null)
      return
    }

    setIsDetailOpen(false)
    setHomeSubpage(null)
    setIsCategoryExpanded(false)
    setOpenFilter(null)
  }, [props.requestedEntry, props.selectedRecipe])

  useEffect(() => {
    if (featuredRecipes.length <= 1 || isDetailOpen || homeSubpage) {
      return
    }

    const timer = window.setInterval(() => {
      setIsFeaturedAnimating(true)
      setFeaturedIndex((current) => current + 1)
    }, 3200)

    return () => window.clearInterval(timer)
  }, [featuredRecipes.length, isDetailOpen, homeSubpage])

  useEffect(() => {
    if (featuredRecipes.length <= 1) {
      setFeaturedIndex(0)
      return
    }

    setFeaturedIndex(1)
  }, [featuredRecipes.length])

  useEffect(() => {
    if (isFeaturedAnimating) {
      return
    }

    const timer = window.setTimeout(() => {
      setIsFeaturedAnimating(true)
    }, 40)

    return () => window.clearTimeout(timer)
  }, [isFeaturedAnimating])

  useEffect(() => {
    if (featuredRecipes.length <= 1) {
      return
    }

    if (featuredIndex === featuredRecipes.length + 1) {
      const timer = window.setTimeout(() => {
        setIsFeaturedAnimating(false)
        setFeaturedIndex(1)
      }, 350)

      return () => window.clearTimeout(timer)
    }

    if (featuredIndex === 0) {
      const timer = window.setTimeout(() => {
        setIsFeaturedAnimating(false)
        setFeaturedIndex(featuredRecipes.length)
      }, 350)

      return () => window.clearTimeout(timer)
    }
  }, [featuredIndex, featuredRecipes.length])

  const goToFeaturedNext = () => {
    if (featuredRecipes.length <= 1) {
      return
    }

    setIsFeaturedAnimating(true)
    setFeaturedIndex((current) => current + 1)
  }

  const goToFeaturedPrevious = () => {
    if (featuredRecipes.length <= 1) {
      return
    }

    setIsFeaturedAnimating(true)
    setFeaturedIndex((current) => current - 1)
  }

  const handleFeaturedTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    setTouchStartX(event.touches[0]?.clientX ?? null)
    setTouchCurrentX(event.touches[0]?.clientX ?? null)
  }

  const handleFeaturedTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    setTouchCurrentX(event.touches[0]?.clientX ?? null)
  }

  const handleFeaturedTouchEnd = () => {
    if (touchStartX == null || touchCurrentX == null) {
      setTouchStartX(null)
      setTouchCurrentX(null)
      return
    }

    const deltaX = touchCurrentX - touchStartX
    if (Math.abs(deltaX) > 48) {
      if (deltaX < 0) {
        goToFeaturedNext()
      } else {
        goToFeaturedPrevious()
      }
    }

    setTouchStartX(null)
    setTouchCurrentX(null)
  }

  const openRecipeDetail = (recipeId: string) => {
    props.onSelectRecipe(recipeId)
    setIsDetailOpen(true)
    setHomeSubpage(null)
    setIsCategoryExpanded(false)
    setOpenFilter(null)
  }

  const openHomeSubpage = (subpage: Exclude<HomeSubpage, null>) => {
    setHomeSubpage(subpage)
    setIsCategoryExpanded(false)
  }

  const renderSubpage = () => {
    if (homeSubpage === 'topics') {
      return (
        <main className="mobile-page-stack">
          <section className="panel mobile-page-section ds-page-header ds-subpage-header">
            <div className="home-subpage-topbar">
              <button className="back-button ghost-button small-button" onClick={() => setHomeSubpage(null)}>
                <span className="back-button-icon" aria-hidden="true">
                  ←
                </span>
                <span>返回首页</span>
              </button>
            </div>
            <div className="section-heading compact-heading">
              <div>
                <span className="section-kicker">专题</span>
                <h2>专题推荐</h2>
              </div>
            </div>
            <div className="import-result-list">
              {topicCards.map((item) => (
                <article key={item.title} className="import-result-item ds-card ds-card-import">
                  <span>专题入口</span>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  <button className="ghost-button small-button" type="button">
                    进入专题
                  </button>
                </article>
              ))}
            </div>
          </section>
        </main>
      )
    }

    if (homeSubpage === 'history') {
      return (
        <main className="mobile-page-stack">
          <section className="panel mobile-page-section ds-page-header ds-subpage-header">
            <div className="home-subpage-topbar">
              <button className="back-button ghost-button small-button" onClick={() => setHomeSubpage(null)}>
                <span className="back-button-icon" aria-hidden="true">
                  ←
                </span>
                <span>返回首页</span>
              </button>
            </div>
            <div className="section-heading compact-heading">
              <div>
                <span className="section-kicker">记录</span>
                <h2>最近做过</h2>
              </div>
              <p>你已完成 {props.historyCount} 次下厨</p>
            </div>
            {recentHistoryItems.length > 0 ? (
              <div className="import-history-list">
                {recentHistoryItems.slice(0, 6).map(({ entry, recipe }) => (
                  <article key={entry.id} className="import-history-item ds-card ds-card-asset">
                    <div>
                      <strong>{recipe.title}</strong>
                      <p>{recipe.difficulty} · {formatMinutes(recipe.duration)}</p>
                      <span>
                        {new Date(entry.finishedAt).toLocaleString('zh-CN', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <button className="ghost-button small-button" type="button" onClick={() => openRecipeDetail(recipe.id)}>
                      再看一遍
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="status-card ds-card ds-card-state">
                <h3>最近做过还没有内容</h3>
                <p>你完成第一道菜之后，这里就会优先显示最近的做菜记录。</p>
              </div>
            )}
          </section>
        </main>
      )
    }

    if (homeSubpage === 'filters') {
      return (
        <main className="mobile-page-stack">
          <section className="panel mobile-page-section ds-page-header ds-subpage-header">
            <div className="home-subpage-topbar">
              <button className="back-button ghost-button small-button" onClick={() => setHomeSubpage(null)}>
                <span className="back-button-icon" aria-hidden="true">
                  ←
                </span>
                <span>返回首页</span>
              </button>
            </div>
            <div className="section-heading compact-heading">
              <div>
                <span className="section-kicker">筛选</span>
                <h2>更多筛选</h2>
              </div>
            </div>
            <div className="import-result-list">
              <article className="import-result-item ds-card ds-card-import">
                <span>当前筛选</span>
                <strong>难度：{selectedDifficultyLabel}</strong>
                <p>如果后面要继续扩展口味、菜系、设备、人数，这一页就是最合适的承载页。</p>
              </article>
              <article className="import-result-item ds-card ds-card-import">
                <span>当前筛选</span>
                <strong>时长：{selectedTimeLabel}</strong>
                <p>首页只保留最核心筛选，其余更复杂的筛选都建议逐步挪到这里。</p>
              </article>
            </div>
          </section>
        </main>
      )
    }

    return null
  }

  if (isDetailOpen && props.selectedRecipe) {
    return (
      <main className="mobile-page-stack recipe-detail-screen">
        <header className="recipe-detail-topbar ds-detail-topbar">
          <button
            className="back-button ghost-button small-button recipe-detail-back-button"
            onClick={() => {
              setIsDetailOpen(false)
              props.onDetailBackToSearch?.()
            }}
          >
            <span className="back-button-icon" aria-hidden="true">
              ←
            </span>
            <span>返回</span>
          </button>
          <div className="recipe-detail-topbar-copy">
            <span className="section-kicker">菜品详情</span>
            <strong>{props.selectedRecipe.title}</strong>
          </div>
        </header>

        <section className="panel mobile-page-section recipe-detail-page ds-detail-page">
          <div className="recipe-detail-hero recipe-detail-hero-mobile" style={recipeCardStyle(props.selectedRecipe)}>
            <span className="detail-scene">{props.selectedRecipe.scene}</span>
            <h2>{props.selectedRecipe.title}</h2>
            <p>{props.selectedRecipe.description}</p>

            <div className="recipe-detail-hero-meta">
              <span className="recipe-chip">{props.selectedRecipe.difficulty}</span>
              <span className="recipe-chip">{formatMinutes(props.selectedRecipe.duration)}</span>
              <span className="recipe-chip">{props.selectedRecipe.servings} 人份</span>
            </div>
          </div>

          <div className="detail-stack">
            <section className="detail-block detail-block-emphasis ds-card ds-card-detail-info">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">新手提示</span>
                  <h3>先看重点</h3>
                </div>
              </div>
              <div className="insight-grid">
                <article className="insight-card ds-card ds-card-state">
                  <span>成功关键</span>
                  <strong>{props.selectedRecipe.highlight}</strong>
                </article>
                <article className="insight-card ds-card ds-card-state">
                  <span>易错提醒</span>
                  <strong>{props.selectedRecipe.riskNote}</strong>
                </article>
              </div>
            </section>

            <section className="detail-block ds-card ds-card-detail-info">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">食材准备</span>
                  <h3>需要的食材和工具</h3>
                </div>
              </div>
              <ul className="ingredient-list">
                {props.selectedRecipe.ingredients.map((ingredient) => (
                  <li key={ingredient.name}>
                    <span>{ingredient.name}</span>
                    <strong>{ingredient.amount}</strong>
                  </li>
                ))}
              </ul>
              <div className="tool-row">
                {props.selectedRecipe.tools.map((tool) => (
                  <span key={tool} className="tool-chip">
                    {tool}
                  </span>
                ))}
              </div>
            </section>

            <section className="detail-block ds-card ds-card-detail-info">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">详细步骤</span>
                  <h3>按顺序完成</h3>
                </div>
              </div>
              <ol className="step-preview-list">
                {props.selectedRecipe.steps.map((step, index) => (
                  <li key={step.title}>
                    <span>{`${index + 1}`.padStart(2, '0')}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.instruction}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="detail-block ds-card ds-card-detail-info">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">易错点</span>
                  <h3>常见翻车补救</h3>
                </div>
              </div>
              <div className="rescue-list">
                {props.selectedRecipe.rescueTips.slice(0, 3).map((tip) => (
                  <article key={tip.issue} className="rescue-card ds-card ds-card-state">
                    <strong>{tip.issue}</strong>
                    <p>{tip.answer}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="detail-block detail-summary-card ds-card ds-card-state">
              <span className="section-kicker">完成记录</span>
              <strong>你已经做过这道菜 {props.currentRecipeCompletions} 次</strong>
            </section>
          </div>
        </section>

        <div className="recipe-detail-bottom-bar">
          <div className="detail-actions">
            <button
              className="ghost-button recipe-detail-favorite-button"
              onClick={() => props.onToggleFavorite(props.selectedRecipe!.id)}
            >
              {props.favoriteRecipeIds.includes(props.selectedRecipe.id) ? '已收藏' : '收藏这道菜'}
            </button>
            <button className="primary-button recipe-detail-cta" onClick={props.onStartCooking}>
              进入跟做模式
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (homeSubpage) {
    return renderSubpage()
  }

  return (
    <main className="mobile-page-stack">
      {ongoingRecipe && props.ongoingCookingSession ? (
        <section className="panel mobile-page-section community-entry-card ds-card-section">
          <button
            type="button"
            className="community-entry-button"
            onClick={() => props.onResumeCooking(ongoingRecipe.id, props.ongoingCookingSession!.stepIndex)}
          >
            <span>继续做菜</span>
            <strong>{`继续 ${ongoingRecipe.title}`}</strong>
            <p>{`上次停在第 ${props.ongoingCookingSession.stepIndex + 1} 步，点一下继续跟做。`}</p>
          </button>
        </section>
      ) : null}

      <section className="panel mobile-page-section home-search-entry-panel ds-page-header ds-primary-header">
        <button type="button" className="home-search-entry" onClick={props.onSearchEntryClick}>
          <span className="home-search-entry-icon" aria-hidden="true">
            ⌕
          </span>
          <span className="home-search-entry-placeholder">搜索菜名、做法、食材灵感</span>
        </button>

        <button type="button" className="home-import-entry" onClick={props.onImportEntryClick}>
          <span className="home-import-entry-icon" aria-hidden="true">
            +
          </span>
          <span>导入视频或文档链接生成菜谱</span>
        </button>

        <span className="home-cooking-pattern" aria-hidden="true" />
      </section>

      <section className="panel mobile-page-section home-shortcut-section ds-card-section">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">快捷入口</span>
            <h2>首页功能分发</h2>
          </div>
          <p>先点按钮进入二级页，不把所有内容直接堆在首页。</p>
        </div>

        <div className="home-category-select">
          <button
            type="button"
            className={`home-category-trigger ${isCategoryExpanded ? 'home-category-trigger-open' : ''}`}
            onClick={() => setIsCategoryExpanded((current) => !current)}
          >
            <span className="home-category-trigger-label">分类</span>
            <span className="home-category-trigger-value">{selectedCategory}</span>
            <span className="home-category-trigger-icon" aria-hidden="true">
              ˅
            </span>
          </button>

          {isCategoryExpanded ? (
            <div className="home-category-dropdown">
              {categories.map((item) => (
                <button
                  key={item}
                  className={`home-category-option ${selectedCategory === item ? 'home-category-option-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(item)
                    setIsCategoryExpanded(false)
                  }}
                >
                  <span>{item}</span>
                  {selectedCategory === item ? (
                    <span className="home-category-option-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="home-shortcut-grid home-shortcut-grid-triple">
          <button type="button" className="home-shortcut-card home-shortcut-card-compact home-shortcut-card-topic" onClick={() => openHomeSubpage('topics')}>
            <span className="home-shortcut-icon" aria-hidden="true">☆</span>
            <span>专题</span>
            <strong>专题推荐</strong>
            <p>精选主题内容，快速进入灵感页</p>
          </button>
          <button type="button" className="home-shortcut-card home-shortcut-card-compact home-shortcut-card-history" onClick={() => openHomeSubpage('history')}>
            <span className="home-shortcut-icon" aria-hidden="true">◷</span>
            <span>记录</span>
            <strong>最近做过</strong>
            <p>查看最近做过和打开过的菜谱</p>
          </button>
          <button type="button" className="home-shortcut-card home-shortcut-card-compact home-shortcut-card-filter" onClick={() => openHomeSubpage('filters')}>
            <span className="home-shortcut-icon" aria-hidden="true">▽</span>
            <span>筛选</span>
            <strong>更多筛选</strong>
            <p>把更复杂的条件放进独立页面里</p>
          </button>
        </div>
      </section>

      {false ? (
        <section className="panel mobile-page-section ds-card-section">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-kicker">我的收藏</span>
              <h2>先从收藏里挑</h2>
            </div>
          </div>
          <div className="card-list">
            {favoriteRecipes.slice(0, 2).map((recipe) => (
              <button key={recipe.id} className="recipe-card ds-card ds-card-recipe-preview ds-card-recipe-horizontal" onClick={() => openRecipeDetail(recipe.id)}>
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
                    <span className="recipe-chip">已收藏</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel mobile-page-section home-featured-section ds-card-section ds-carousel-section">
        <div className="home-featured-head">
          <div>
            <span className="section-kicker">首页</span>
            <h2>热门菜品</h2>
          </div>
          <p>先看热门菜品，点击预览图后进入新的菜品详情页。</p>
        </div>

        <div className="featured-carousel">
          <div
            className="featured-carousel-viewport"
            onTouchStart={handleFeaturedTouchStart}
            onTouchMove={handleFeaturedTouchMove}
            onTouchEnd={handleFeaturedTouchEnd}
          >
            <div
              className="featured-carousel-track"
              style={{
                transform: `translateX(-${featuredIndex * 100}%)`,
                transition: isFeaturedAnimating ? undefined : 'none',
              }}
            >
              {loopedFeaturedRecipes.map((recipe, index) => {
                const displayIndex =
                  featuredRecipes.length > 1
                    ? (index - 1 + featuredRecipes.length) % featuredRecipes.length
                    : index

                return (
                  <button
                    key={`${recipe.id}-${index}`}
                    className="featured-preview-card ds-card ds-card-recipe-preview ds-card-recipe-vertical"
                    onClick={() => openRecipeDetail(recipe.id)}
                  >
                    <div className="featured-preview-hero" style={recipeCardStyle(recipe)}>
                      <span>{displayIndex === 0 ? '本周最热' : '人气推荐'}</span>
                      <strong>{recipe.title}</strong>
                    </div>
                    <div className="featured-preview-body">
                      <p>{recipe.highlight}</p>
                      <div className="featured-preview-meta">
                        <span>{formatMinutes(recipe.duration)}</span>
                        <span>{recipe.difficulty}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {featuredRecipes.length > 1 ? (
            <div className="featured-carousel-dots" aria-label="热门菜品轮播分页">
              {featuredRecipes.map((recipe, index) => (
                <button
                  key={`${recipe.id}-dot`}
                  type="button"
                  className={`featured-carousel-dot ${activeFeaturedIndex === index ? 'featured-carousel-dot-active' : ''}`}
                  aria-label={`查看第 ${index + 1} 个热门菜品`}
                  onClick={() => {
                    setIsFeaturedAnimating(true)
                    setFeaturedIndex(index + 1)
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel mobile-page-section ds-card-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">菜谱库</span>
            <h2>挑一道菜</h2>
          </div>
          <p>{props.isHistoryLoading ? '正在加载历史...' : `你已完成 ${props.historyCount} 次下厨`}</p>
        </div>

        <div className="filter-bar filter-dropdown-grid">
          <section className="filter-dropdown" aria-label="难度筛选">
            <span className="filter-chip-label">难度</span>
            <button
              type="button"
              className={`filter-dropdown-trigger ${openFilter === 'difficulty' ? 'filter-dropdown-trigger-open' : ''}`}
              aria-expanded={openFilter === 'difficulty'}
              onClick={() => setOpenFilter((current) => (current === 'difficulty' ? null : 'difficulty'))}
            >
              <span className="filter-dropdown-value">{selectedDifficultyLabel}</span>
              <span className="filter-dropdown-icon" aria-hidden="true">
                ˅
              </span>
            </button>

            {openFilter === 'difficulty' ? (
              <div className="filter-dropdown-menu">
                {difficultyOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`filter-dropdown-option ${props.difficulty === option ? 'filter-dropdown-option-active' : ''}`}
                    onClick={() => {
                      props.onDifficultyChange(option)
                      setOpenFilter(null)
                    }}
                  >
                    <span>{option === allDifficultyOption ? '全部' : option}</span>
                    {props.difficulty === option ? (
                      <span className="filter-dropdown-check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="filter-dropdown" aria-label="时长筛选">
            <span className="filter-chip-label">时长</span>
            <button
              type="button"
              className={`filter-dropdown-trigger ${openFilter === 'time' ? 'filter-dropdown-trigger-open' : ''}`}
              aria-expanded={openFilter === 'time'}
              onClick={() => setOpenFilter((current) => (current === 'time' ? null : 'time'))}
            >
              <span className="filter-dropdown-value">{selectedTimeLabel}</span>
              <span className="filter-dropdown-icon" aria-hidden="true">
                ˅
              </span>
            </button>

            {openFilter === 'time' ? (
              <div className="filter-dropdown-menu">
                {timeOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`filter-dropdown-option ${props.timeLimit === option ? 'filter-dropdown-option-active' : ''}`}
                    onClick={() => {
                      props.onTimeLimitChange(option)
                      setOpenFilter(null)
                    }}
                  >
                    <span>{option === allTimeOption ? '全部' : `${option} 分钟内`}</span>
                    {props.timeLimit === option ? (
                      <span className="filter-dropdown-check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        {props.recipesError ? (
          <div className="status-card ds-card ds-card-state">
            <h3>菜谱暂时无法加载</h3>
            <p>{props.recipesError}</p>
            <button className="primary-button" onClick={props.onRetry}>
              重新加载
            </button>
          </div>
        ) : props.isRecipesLoading && props.recipesData.length === 0 ? (
          <div className="status-card ds-card ds-card-state">
            <h3>正在连接菜谱服务</h3>
            <p>请稍等，正在从数据库加载菜谱。</p>
          </div>
        ) : (
          <div className="card-list">
            {props.recipesData.length > 0 ? (
              props.recipesData.map((recipe) => (
                <button key={recipe.id} className="recipe-card ds-card ds-card-recipe-preview ds-card-recipe-horizontal" onClick={() => openRecipeDetail(recipe.id)}>
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
                      <span>{recipe.steps.length} 步</span>
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
                <h3>没有找到匹配的菜</h3>
                <p>可以调整一下难度或时长筛选，看看别的推荐。</p>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
