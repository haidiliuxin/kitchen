import type { CookingHistoryEntry, Recipe } from '../../types.js'
import type { CommunityPost } from './CommunityScreen.js'

type ProfileScreenProps = {
  isLoggedIn: boolean
  favoriteRecipes: Recipe[]
  recentHistoryItems: Array<{ entry: CookingHistoryEntry; recipe: Recipe }>
  myPosts: CommunityPost[]
  onLoginToggle: () => void
  onOpenFavoriteRecipe: (recipeId: string) => void
  onOpenHistoryRecipe: (recipeId: string) => void
  onOpenImportHistory: () => void
  onOpenMyPost: (postId: string) => void
}

export function ProfileScreen({
  isLoggedIn,
  favoriteRecipes,
  recentHistoryItems,
  myPosts,
  onLoginToggle,
  onOpenFavoriteRecipe,
  onOpenHistoryRecipe,
  onOpenImportHistory,
  onOpenMyPost,
}: ProfileScreenProps) {
  return (
    <main className="mobile-page-stack">
      <section className="panel mobile-page-section profile-hero-card">
        <span className="section-kicker">我的</span>
        <h1>{isLoggedIn ? '账号中心' : '欢迎登录'}</h1>
        <p className="profile-hero-copy">集中管理收藏、最近做过、导入历史和我的发布。</p>
      </section>

      <section className="panel mobile-page-section profile-form-card">
        <div className="profile-avatar">{isLoggedIn ? '已登录' : '游客'}</div>

        <div className="profile-field-group">
          <label className="search-field">
            <span>手机号 / 邮箱</span>
            <input placeholder="输入手机号或邮箱" />
          </label>

          <label className="search-field">
            <span>密码</span>
            <input type="password" placeholder="输入密码" />
          </label>
        </div>

        <div className="profile-actions">
          {!isLoggedIn ? (
            <button className="primary-button" onClick={onLoginToggle}>
              登录
            </button>
          ) : (
            <button className="ghost-button" onClick={onLoginToggle}>
              退出登录
            </button>
          )}
        </div>
      </section>

      <section className="panel mobile-page-section profile-status-card">
        <span className="section-kicker">当前状态</span>
        <strong>{isLoggedIn ? '你已经登录，可以继续管理收藏和历史记录。' : '当前为游客模式，登录后可同步收藏和记录。'}</strong>
      </section>

      <section className="panel mobile-page-section profile-posts-card">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">我的收藏</span>
            <h3>收进来的菜谱</h3>
          </div>
        </div>

        {favoriteRecipes.length > 0 ? (
          <div className="community-feed">
            {favoriteRecipes.map((recipe) => (
              <article key={recipe.id} className="community-post-card profile-post-card">
                <div className="community-post-head">
                  <div>
                    <span className="section-kicker">已收藏</span>
                    <h3>{recipe.title}</h3>
                  </div>
                  <span className="community-like-pill">{recipe.difficulty}</span>
                </div>
                <p>{recipe.description}</p>
                <div className="tag-row">
                  {recipe.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <button className="ghost-button small-button" onClick={() => onOpenFavoriteRecipe(recipe.id)}>
                  查看菜谱
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>还没有收藏菜谱</h3>
            <p>你在菜谱详情页和完成页点收藏后，这里就会出现内容。</p>
          </div>
        )}
      </section>

      <section className="panel mobile-page-section profile-posts-card">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">最近做过</span>
            <h3>回到最近完成的菜</h3>
          </div>
        </div>

        {recentHistoryItems.length > 0 ? (
          <div className="import-history-list">
            {recentHistoryItems.map(({ entry, recipe }) => (
              <article key={entry.id} className="import-history-item">
                <div>
                  <strong>{recipe.title}</strong>
                  <p>{recipe.difficulty}</p>
                  <span>
                    {new Date(entry.finishedAt).toLocaleString('zh-CN', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <button className="ghost-button small-button" onClick={() => onOpenHistoryRecipe(recipe.id)}>
                  再看一遍
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>还没有最近做过</h3>
            <p>完成一道菜后，这里会显示最近的做菜记录。</p>
          </div>
        )}
      </section>

      <section className="panel mobile-page-section profile-posts-card">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">导入历史</span>
            <h3>去看看导入过什么</h3>
          </div>
        </div>
        <button type="button" className="home-import-entry import-history-entry" onClick={onOpenImportHistory}>
          <span className="home-import-entry-icon" aria-hidden="true">
            →
          </span>
          <span>打开导入历史</span>
        </button>
      </section>

      <section className="panel mobile-page-section profile-posts-card">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">我的发布</span>
            <h3>看看我发过什么</h3>
          </div>
        </div>

        {myPosts.length > 0 ? (
          <div className="community-feed">
            {myPosts.map((post) => (
              <article key={post.id} className="community-post-card profile-post-card">
                <div className="community-post-head">
                  <div>
                    <span className="section-kicker">{post.author}</span>
                    <h3>{post.title}</h3>
                  </div>
                  <span className="community-like-pill">{post.likes} 赞</span>
                </div>
                <p>{post.content}</p>
                <div className="tag-row">
                  {post.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <button className="ghost-button small-button" onClick={() => onOpenMyPost(post.id)}>
                  查看详情
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>你还没有发布内容</h3>
            <p>去社区发一条心得后，这里就会显示你发布过的内容。</p>
          </div>
        )}
      </section>
    </main>
  )
}
