import { useMemo } from 'react'
import type { Recipe, CookingHistoryEntry } from '../../types.js'
import type { CommunityPost } from './CommunityScreen.js'

export type ProfileView = 'overview' | 'favorites' | 'history' | 'imports' | 'posts'

type ProfileScreenProps = {
  isLoggedIn: boolean
  loginIdentifier: string
  loginPassword: string
  currentUserLabel: string
  favoriteRecipes: Recipe[]
  recentHistoryItems: Array<{ entry: CookingHistoryEntry; recipe: Recipe }>
  myPosts: CommunityPost[]
  view: ProfileView
  serverBaseUrl: string
  serverBaseUrlDraft: string
  serverConnectionStatus: string | null
  isTestingServerConnection: boolean
  onViewChange: (view: ProfileView) => void
  onLoginIdentifierChange: (value: string) => void
  onLoginPasswordChange: (value: string) => void
  onLoginSubmit: () => void
  onLogout: () => void
  onServerBaseUrlDraftChange: (value: string) => void
  onSaveServerBaseUrl: () => void
  onResetServerBaseUrl: () => void
  onTestServerConnection: () => void
  onOpenFavoriteRecipe: (recipeId: string) => void
  onOpenHistoryRecipe: (recipeId: string) => void
  onOpenImportHistory: () => void
  onOpenMyPost: (postId: string) => void
}

export function ProfileScreen({
  isLoggedIn,
  loginIdentifier,
  loginPassword,
  currentUserLabel,
  favoriteRecipes,
  recentHistoryItems,
  myPosts,
  view,
  serverBaseUrl,
  serverBaseUrlDraft,
  serverConnectionStatus,
  isTestingServerConnection,
  onViewChange,
  onLoginIdentifierChange,
  onLoginPasswordChange,
  onLoginSubmit,
  onLogout,
  onServerBaseUrlDraftChange,
  onSaveServerBaseUrl,
  onResetServerBaseUrl,
  onTestServerConnection,
  onOpenFavoriteRecipe,
  onOpenHistoryRecipe,
  onOpenImportHistory,
  onOpenMyPost,
}: ProfileScreenProps) {
  const entryCards = useMemo(
    () => [
      {
        id: 'favorites' as const,
        kicker: '收藏',
        title: '我的收藏',
        description:
          favoriteRecipes.length > 0
            ? `现在已经收藏了 ${favoriteRecipes.length} 道菜，点进去继续看。`
            : '把收藏的菜谱收进一个单独页面里，不再堆在总览页。',
      },
      {
        id: 'history' as const,
        kicker: '记录',
        title: '最近做过',
        description:
          recentHistoryItems.length > 0
            ? `最近做过 ${recentHistoryItems.length} 条内容，点进去继续回看。`
            : '这里会承接最近完成的做菜记录。',
      },
      {
        id: 'imports' as const,
        kicker: '导入',
        title: '导入历史',
        description: '查看最近导入过的链接结果，继续回看或完善生成的菜谱。',
      },
      {
        id: 'posts' as const,
        kicker: '发布',
        title: '我的发布',
        description:
          myPosts.length > 0
            ? `已经发布 ${myPosts.length} 条心得，点进去集中查看。`
            : '把社区发布内容从总览页收进独立页面。',
      },
    ],
    [favoriteRecipes.length, recentHistoryItems.length, myPosts.length],
  )

  const renderTopbar = (title: string, kicker: string) => (
    <section className="panel mobile-page-section profile-hero-card ds-page-header ds-overlay-header">
      <div className="home-subpage-topbar">
        <button type="button" className="back-button ghost-button small-button" onClick={() => onViewChange('overview')}>
          <span className="back-button-icon" aria-hidden="true">
            ←
          </span>
          <span>返回我的</span>
        </button>
      </div>
      <span className="section-kicker">{kicker}</span>
      <h1>{title}</h1>
    </section>
  )

  const renderSubpage = () => {
    if (view === 'overview') {
      return null
    }

    if (view === 'favorites') {
      return (
        <div className="profile-subpage-overlay">
          <main className="mobile-page-stack profile-subpage-sheet">
            {renderTopbar('我的收藏', '收藏')}
            <section className="panel mobile-page-section profile-posts-card ds-card-section">
              {favoriteRecipes.length > 0 ? (
                <div className="community-feed">
                  {favoriteRecipes.map((recipe) => (
                    <article key={recipe.id} className="community-post-card profile-post-card ds-card ds-card-asset">
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
                <div className="empty-state ds-card ds-card-state">
                  <h3>还没有收藏菜谱</h3>
                  <p>你在菜谱详情页和完成页点收藏后，这里就会出现内容。</p>
                </div>
              )}
            </section>
          </main>
        </div>
      )
    }

    if (view === 'history') {
      return (
        <div className="profile-subpage-overlay">
          <main className="mobile-page-stack profile-subpage-sheet">
            {renderTopbar('最近做过', '记录')}
            <section className="panel mobile-page-section profile-posts-card ds-card-section">
              {recentHistoryItems.length > 0 ? (
                <div className="import-history-list">
                  {recentHistoryItems.map(({ entry, recipe }) => (
                    <article key={entry.id} className="import-history-item ds-card ds-card-asset">
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
                <div className="empty-state ds-card ds-card-state">
                  <h3>还没有最近做过</h3>
                  <p>完成一道菜后，这里会显示最近的做菜记录。</p>
                </div>
              )}
            </section>
          </main>
        </div>
      )
    }

    if (view === 'imports') {
      return (
        <div className="profile-subpage-overlay">
          <main className="mobile-page-stack profile-subpage-sheet">
            {renderTopbar('导入历史', '导入')}
            <section className="panel mobile-page-section profile-posts-card ds-card-section">
              <div className="community-entry-grid">
                <button type="button" className="community-entry-button" onClick={onOpenImportHistory}>
                  <span>入口</span>
                  <strong>打开导入历史</strong>
                  <p>这里作为“我的”页里的二级入口页，再进入完整的导入历史内容。</p>
                </button>
              </div>
            </section>
          </main>
        </div>
      )
    }

    return (
      <div className="profile-subpage-overlay">
        <main className="mobile-page-stack profile-subpage-sheet">
          {renderTopbar('我的发布', '发布')}
            <section className="panel mobile-page-section profile-posts-card ds-card-section">
            {myPosts.length > 0 ? (
              <div className="community-feed">
                {myPosts.map((post) => (
                  <article key={post.id} className="community-post-card profile-post-card ds-card ds-card-community">
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
              <div className="empty-state ds-card ds-card-state">
                <h3>你还没有发布内容</h3>
                <p>去社区发一条心得后，这里就会显示你发布过的内容。</p>
              </div>
            )}
          </section>
        </main>
      </div>
    )
  }

  return (
    <>
      <main className="mobile-page-stack">
        <section className="panel mobile-page-section profile-hero-card ds-page-header ds-primary-header">
          <span className="section-kicker">我的</span>
          <h1>{isLoggedIn ? `${currentUserLabel} 的账户` : '欢迎登录'}</h1>
          <p className="profile-hero-copy">
            登录后会记住当前身份，你的评论、发布和个人内容也会按这个身份展示。
          </p>
        </section>

        <section className="panel mobile-page-section profile-form-card ds-card ds-card-task">
          <div className="profile-avatar">{isLoggedIn ? currentUserLabel.slice(0, 2) : '游客'}</div>

          <div className="profile-field-group">
            <label className="search-field">
              <span>手机号 / 邮箱 / 昵称</span>
              <input
                value={loginIdentifier}
                onChange={(event) => onLoginIdentifierChange(event.target.value)}
                placeholder="输入你的登录标识"
                disabled={isLoggedIn}
              />
            </label>

            <label className="search-field">
              <span>密码</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(event) => onLoginPasswordChange(event.target.value)}
                placeholder="输入密码"
                disabled={isLoggedIn}
              />
            </label>
          </div>

          <div className="profile-actions">
            {!isLoggedIn ? (
              <button className="primary-button secondary-action-button" onClick={onLoginSubmit} disabled={!loginIdentifier.trim() || !loginPassword.trim()}>
                登录
              </button>
            ) : (
              <button className="ghost-button secondary-action-button" onClick={onLogout}>
                退出登录
              </button>
            )}
          </div>
        </section>

        <section className="panel mobile-page-section profile-status-card ds-card ds-card-state">
          <span className="section-kicker">当前状态</span>
          <strong>{isLoggedIn ? `当前已登录：${currentUserLabel}` : '未登录，登录后可以评论并保留个人身份。'}</strong>
        </section>

        <section className="panel mobile-page-section server-settings-card ds-card ds-card-task">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-kicker">服务器</span>
              <h3>后端地址设置</h3>
            </div>
          </div>

          <p className="server-settings-copy">
            如果你用 cloudflared / ngrok 做内网穿透，把公网 HTTPS 地址填在这里。以后地址变了，不用重新打 APK。
          </p>

          <label className="search-field">
            <span>当前服务器地址</span>
            <input
              value={serverBaseUrlDraft}
              onChange={(event) => onServerBaseUrlDraftChange(event.target.value)}
              placeholder="例如：https://xxxx.trycloudflare.com"
            />
          </label>

          <div className="server-settings-actions">
            <button
              type="button"
              className="primary-button secondary-action-button"
              onClick={onSaveServerBaseUrl}
            >
              保存地址
            </button>
            <button
              type="button"
              className="ghost-button secondary-action-button"
              onClick={onTestServerConnection}
              disabled={isTestingServerConnection}
            >
              {isTestingServerConnection ? '测试中...' : '测试连接'}
            </button>
            <button
              type="button"
              className="ghost-button secondary-action-button"
              onClick={onResetServerBaseUrl}
            >
              恢复默认
            </button>
          </div>

          <div className="server-settings-current">
            <span>正在使用</span>
            <strong>{serverBaseUrl || '打包时默认地址 / 同源接口'}</strong>
          </div>

          {serverConnectionStatus && <p className="server-settings-status">{serverConnectionStatus}</p>}
        </section>

        <section className="panel mobile-page-section community-entry-card ds-card-section">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-kicker">功能入口</span>
              <h3>进入我的二级页面</h3>
            </div>
          </div>

          <div className="community-entry-grid">
            {entryCards.map((item) => (
              <button key={item.id} type="button" className="community-entry-button" onClick={() => onViewChange(item.id)}>
                <span>{item.kicker}</span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </button>
            ))}
          </div>
        </section>
      </main>

      {renderSubpage()}
    </>
  )
}
