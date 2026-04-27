import { useEffect, useMemo, useState } from 'react'

export type CommunityPost = {
  id: string
  author: string
  title: string
  content: string
  likes: number
  tags: string[]
  isMine?: boolean
}

export type CommunityComment = {
  id: string
  author: string
  content: string
  createdAt: string
}

type CommunityScreenProps = {
  posts: CommunityPost[]
  commentsByPostId: Record<string, CommunityComment[]>
  requestedPostId?: string | null
  likedPostIds: string[]
  isLoggedIn: boolean
  currentUserLabel: string
  onToggleLikePost: (postId: string) => void
  onPublishPost: (payload: { title: string; content: string; tags: string[] }) => void
  onAddComment: (payload: { postId: string; content: string }) => void
}

type CommunityView = 'feed' | 'detail' | 'compose'

const communityTopics = ['新手第一次下厨', '10 分钟快手菜', '翻车补救', '备菜习惯', '减脂餐打卡']

export function CommunityScreen({
  posts,
  commentsByPostId,
  requestedPostId,
  likedPostIds,
  isLoggedIn,
  currentUserLabel,
  onToggleLikePost,
  onPublishPost,
  onAddComment,
}: CommunityScreenProps) {
  const [view, setView] = useState<CommunityView>('feed')
  const [selectedPostId, setSelectedPostId] = useState<string | null>(posts[0]?.id ?? null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [draftTags, setDraftTags] = useState('')
  const [commentDraft, setCommentDraft] = useState('')

  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? null
  const selectedPostComments = useMemo(
    () => (selectedPostId ? commentsByPostId[selectedPostId] ?? [] : []),
    [commentsByPostId, selectedPostId],
  )
  const isSelectedPostLiked = selectedPost ? likedPostIds.includes(selectedPost.id) : false

  useEffect(() => {
    if (!requestedPostId) {
      return
    }

    setSelectedPostId(requestedPostId)
    setView('detail')
  }, [requestedPostId])

  const openPostDetail = (postId: string) => {
    setSelectedPostId(postId)
    setCommentDraft('')
    setView('detail')
  }

  const handlePublish = () => {
    const title = draftTitle.trim()
    const content = draftContent.trim()
    if (!title || !content) {
      return
    }

    onPublishPost({
      title,
      content,
      tags: draftTags
        .split(/[\s,，]+/)
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 4),
    })

    setDraftTitle('')
    setDraftContent('')
    setDraftTags('')
    setView('feed')
  }

  const handleSubmitComment = () => {
    if (!selectedPostId || !commentDraft.trim() || !isLoggedIn) {
      return
    }

    onAddComment({
      postId: selectedPostId,
      content: commentDraft.trim(),
    })
    setCommentDraft('')
  }

  const renderDetailOverlay = () => {
    if (view !== 'detail' || !selectedPost) {
      return null
    }

    return (
      <div className="app-subpage-overlay">
        <main className="mobile-page-stack app-subpage-sheet">
          <section className="panel mobile-page-section social-hero-card ds-page-header ds-overlay-header">
            <div className="home-subpage-topbar">
              <button type="button" className="back-button ghost-button small-button" onClick={() => setView('feed')}>
                <span className="back-button-icon" aria-hidden="true">
                  ←
                </span>
                <span>返回社区</span>
              </button>
            </div>

            <span className="section-kicker">帖子详情</span>
            <h1>{selectedPost.title}</h1>
            <p className="social-hero-copy">帖子详情页现在除了点赞，还接上了评论区和发表评论，形成最小互动闭环。</p>
          </section>

          <section className="panel mobile-page-section community-post-card ds-card ds-card-community">
            <div className="community-post-head">
              <div>
                <span className="section-kicker">{selectedPost.author}</span>
                <h3>{selectedPost.title}</h3>
              </div>
              <span className="community-like-pill">{selectedPost.likes} 赞</span>
            </div>
            <p>{selectedPost.content}</p>
            <div className="tag-row">
              {selectedPost.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>

            <div className="community-detail-actions">
              <button
                className={`ghost-button secondary-action-button ${isSelectedPostLiked ? 'community-liked-button' : ''}`}
                onClick={() => onToggleLikePost(selectedPost.id)}
              >
                {isSelectedPostLiked ? '已点赞' : '点个赞'}
              </button>
              <button className="ghost-button secondary-action-button" onClick={() => setView('compose')}>
                我也写一条
              </button>
            </div>
          </section>

          <section className="panel mobile-page-section community-comments-card ds-card ds-card-state">
            <div className="section-heading compact-heading">
              <div>
                <span className="section-kicker">评论区</span>
                <h3>{selectedPostComments.length > 0 ? `${selectedPostComments.length} 条评论` : '还没有评论'}</h3>
              </div>
            </div>

            {selectedPostComments.length > 0 ? (
              <div className="community-comment-list">
                {selectedPostComments.map((comment) => (
                  <article key={comment.id} className="community-comment-item ds-card ds-card-state">
                    <div className="community-comment-head">
                      <strong>{comment.author}</strong>
                      <span>{new Date(comment.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p>{comment.content}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state ds-card ds-card-state">
                <h3>先来第一条评论</h3>
                <p>评论闭环已经接上，登录后就可以在这里直接留言互动。</p>
              </div>
            )}

            <label className="search-field">
              <span>{isLoggedIn ? `以 ${currentUserLabel} 的身份评论` : '登录后可发表评论'}</span>
              <textarea
                className="community-textarea community-comment-textarea"
                rows={4}
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder={isLoggedIn ? '写下你的做菜心得或补充建议' : '先去“我的”页登录，再回来评论'}
                disabled={!isLoggedIn}
              />
            </label>

            <div className="community-detail-actions">
              <button className="primary-button" onClick={handleSubmitComment} disabled={!isLoggedIn || !commentDraft.trim()}>
                发布评论
              </button>
            </div>
          </section>
        </main>
      </div>
    )
  }

  const renderComposeOverlay = () => {
    if (view !== 'compose') {
      return null
    }

    return (
      <div className="app-subpage-overlay">
        <main className="mobile-page-stack app-subpage-sheet">
          <section className="panel mobile-page-section social-hero-card community-compose-hero ds-page-header ds-task-header">
            <div className="home-subpage-topbar">
              <button type="button" className="back-button ghost-button small-button" onClick={() => setView('feed')}>
                <span className="back-button-icon" aria-hidden="true">
                  ←
                </span>
                <span>返回社区</span>
              </button>
            </div>

            <span className="section-kicker">发心得</span>
            <h1>发布一条做菜心得</h1>
            <p className="social-hero-copy">发帖闭环保留，发布后仍会回到社区流，同时出现在“我的发布”里。</p>
          </section>

          <section className="panel mobile-page-section social-composer-card community-compose-card ds-card ds-card-task">
            <div className="community-compose-tips ds-card ds-card-state">
              <span className="section-kicker">发布建议</span>
              <p>标题尽量说清一道菜或一个技巧，正文更适合写步骤感受、踩坑点和解决办法。</p>
            </div>

            <label className="search-field">
              <span>标题</span>
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="例如：番茄炒蛋别急着放盐"
              />
            </label>

            <label className="search-field">
              <span>标签</span>
              <input
                value={draftTags}
                onChange={(event) => setDraftTags(event.target.value)}
                placeholder="例如：新手友好 翻车补救"
              />
            </label>

            <label className="search-field">
              <span>正文</span>
              <textarea
                className="community-textarea community-compose-textarea"
                rows={7}
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                placeholder="写下这次做菜的心得、踩坑点或者小技巧"
              />
            </label>

            <div className="community-compose-footer">
              <span className="community-compose-count">{draftContent.trim().length} 字</span>
              <div className="community-detail-actions">
                <button className="primary-button" onClick={handlePublish} disabled={!draftTitle.trim() || !draftContent.trim()}>
                  发布心得
                </button>
                <button className="ghost-button secondary-action-button" onClick={() => setView('feed')}>
                  先返回
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <>
      <main className="mobile-page-stack">
        <section className="panel mobile-page-section social-hero-card ds-page-header ds-primary-header">
          <span className="section-kicker">社区</span>
          <h1>做菜社区</h1>
          <p className="social-hero-copy">社区现在保留帖子流、发帖和评论三条最核心互动链路，已经能作为前端社区闭环来验收。</p>
        </section>

        <section className="panel mobile-page-section community-entry-card ds-card-section">
          <div className="community-entry-grid">
            <button type="button" className="community-entry-button" onClick={() => setView('compose')}>
              <span>发布</span>
              <strong>发一条心得</strong>
              <p>把这次做菜的小技巧、翻车点和心得发到社区里。</p>
            </button>
          </div>
        </section>

        <section className="panel mobile-page-section ds-card-section">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-kicker">热门话题</span>
              <h3>先逛社区再发帖</h3>
            </div>
          </div>
          <div className="hot-topic-grid">
            {communityTopics.map((topic) => (
              <button key={topic} className="ghost-button hot-topic-chip">
                {topic}
              </button>
            ))}
          </div>
        </section>

        <section className="community-feed">
          {posts.map((post) => (
            <article key={post.id} className="panel mobile-page-section community-post-card ds-card ds-card-community">
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
              <div className="community-detail-actions">
                <button className="ghost-button small-button" onClick={() => openPostDetail(post.id)}>
                  查看详情
                </button>
                <button className="ghost-button small-button" onClick={() => setView('compose')}>
                  我也写一条
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>

      {renderDetailOverlay()}
      {renderComposeOverlay()}
    </>
  )
}
