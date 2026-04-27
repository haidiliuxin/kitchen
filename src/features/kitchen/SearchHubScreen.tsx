import { formatMinutes, recipeCardStyle } from './shared.js'
import type { Recipe } from '../../types.js'

const hotSearches = [
  '番茄炒蛋怎么更嫩',
  '空气炸锅早餐',
  '适合减脂的晚饭',
  '十分钟快手菜',
  '新手第一次做鱼',
  '便当菜推荐',
  '汤面怎么更香',
  'vivo 比赛作品 UI',
]

const searchCategories = [
  '今日热搜',
  '家常热门',
  '减脂专区',
  '快手晚餐',
  '早餐灵感',
  '宿舍料理',
]

type SearchHubScreenProps = {
  recipesData: Recipe[]
  searchQuery: string
  recentSearches: string[]
  onSearchQueryChange: (value: string) => void
  onSaveRecentSearch: (value: string) => void
  onClearRecentSearches: () => void
  onOpenRecipe: (recipeId: string) => void
}

export function SearchHubScreen({
  recipesData,
  searchQuery,
  recentSearches,
  onSearchQueryChange,
  onSaveRecentSearch,
  onClearRecentSearches,
  onOpenRecipe,
}: SearchHubScreenProps) {
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const searchResults = normalizedQuery
    ? recipesData
        .map((recipe) => {
          const title = recipe.title.toLowerCase()
          const subtitle = recipe.subtitle.toLowerCase()
          const tags = recipe.tags.join(' ').toLowerCase()
          const tokens = recipe.searchTokens.join(' ').toLowerCase()
          const ingredients = recipe.ingredients.map((ingredient) => ingredient.name).join(' ').toLowerCase()
          const description = recipe.description.toLowerCase()

          let score = 0
          if (title === normalizedQuery) score += 120
          if (title.startsWith(normalizedQuery)) score += 80
          if (title.includes(normalizedQuery)) score += 60
          if (subtitle.includes(normalizedQuery)) score += 35
          if (tags.includes(normalizedQuery)) score += 30
          if (tokens.includes(normalizedQuery)) score += 28
          if (ingredients.includes(normalizedQuery)) score += 24
          if (description.includes(normalizedQuery)) score += 12
          score += Math.max(0, 20 - recipe.duration / 2)

          return { recipe, score }
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((item) => item.recipe)
    : []

  return (
    <main className="mobile-page-stack">
      <section className="panel mobile-page-section search-hero-card">
        <span className="section-kicker">搜索</span>
        <h1>热搜推荐</h1>
        <p className="search-hero-copy">从热搜、分类和最近搜索里快速找到想做的菜，输入关键词后会立刻显示匹配结果。</p>
      </section>

      <section className="panel mobile-page-section">
        <label className="search-field app-search-field">
          <span>搜索菜名、做法、食材</span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onSaveRecentSearch(searchQuery)
              }
            }}
            placeholder="输入关键词，例如：番茄、鸡胸肉、下饭菜"
          />
        </label>
      </section>

      {recentSearches.length > 0 ? (
        <section className="panel mobile-page-section">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-kicker">最近搜索</span>
              <h3>回到刚才的搜索上下文</h3>
            </div>
            <button type="button" className="ghost-button small-button" onClick={onClearRecentSearches}>
              清空
            </button>
          </div>
          <div className="hot-topic-grid">
            {recentSearches.map((item) => (
              <button
                key={item}
                className="ghost-button hot-topic-chip"
                onClick={() => {
                  onSearchQueryChange(item)
                  onSaveRecentSearch(item)
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel mobile-page-section">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">推荐分类</span>
            <h3>先逛再搜</h3>
          </div>
        </div>
        <div className="hot-topic-grid">
          {searchCategories.map((item) => (
            <button
              key={item}
              className="ghost-button hot-topic-chip"
              onClick={() => {
                onSearchQueryChange(item)
                onSaveRecentSearch(item)
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="panel mobile-page-section trending-card">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">排行榜</span>
            <h3>热搜榜单</h3>
          </div>
        </div>

        <div className="trending-list">
          {hotSearches.map((item, index) => (
            <button
              key={item}
              className="trending-item search-trending-button"
              onClick={() => {
                onSearchQueryChange(item)
                onSaveRecentSearch(item)
              }}
            >
              <div className="trending-rank">
                <strong>{String(index + 1).padStart(2, '0')}</strong>
              </div>
              <div className="trending-copy">
                <h4>{item}</h4>
                <p>{index < 3 ? '点击后会直接带出相关结果。' : '点进去看看有没有合适的做菜灵感。'}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="panel mobile-page-section search-result-card">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">搜索结果</span>
            <h3>{normalizedQuery ? `“${searchQuery}” 的匹配结果` : '输入后这里显示结果'}</h3>
          </div>
        </div>

        {normalizedQuery ? (
          searchResults.length > 0 ? (
            <div className="card-list">
              {searchResults.map((recipe) => (
                <button key={recipe.id} className="recipe-card" onClick={() => onOpenRecipe(recipe.id)}>
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
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>没有搜到匹配内容</h3>
              <p>可以换个关键词，或者先点上面的热搜词和分类入口继续找菜。</p>
            </div>
          )
        ) : (
          <div className="empty-state">
            <h3>先输入关键词</h3>
            <p>输入后这里会显示匹配菜谱，点击结果就能进入现有菜谱详情页。</p>
          </div>
        )}
      </section>
    </main>
  )
}
