import { useEffect, useState } from 'react'

export type CommunityPost = {
  id: string
  author: string
  title: string
  content: string
  likes: number
  tags: string[]
  isMine?: boolean
}

type CommunityScreenProps = {
  posts: CommunityPost[]
  requestedPostId?: string | null
  likedPostIds: string[]
  onToggleLikePost: (postId: string) => void
  onPublishPost: (payload: { title: string; content: string; tags: string[] }) => void
}

type CommunityView = 'feed' | 'detail' | 'compose'

const communityTopics = ['新手第一次下厨', '10 分钟快手菜', '翻车补救', '备菜习惯', '减脂餐打卡']

export function CommunityScreen({
  posts,
  requestedPostId,
  likedPostIds,
  onToggleLikePost,
  onPublishPost,
}: CommunityScreenProps) {
  const [view, setView] = useState<CommunityView>('feed')
  const [selectedPostId, setSelectedPostId] = useState<string | null>(posts[0]?.id ?? null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [draftTags, setDraftTags] = useState('')

  const selectedPost = posts.find((post) => post.id === selectedPostId) ?? null
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

  if (view === 'detail' && selectedPost) {
    return (
      <main className="mobile-page-stack">
        <section className="panel mobile-page-section social-hero-card">
          <div className="home-subpage-topbar">
            <button className="back-button ghost-button small-button" onClick={() => setView('feed')}>
              <span className="back-button-icon" aria-hidden="true">
                ←
              </span>
              <span>返回社区</span>
            </button>
          </div>

          <span className="section-kicker">帖子详情</span>
          <h1>{selectedPost.title}</h1>
          <p className="social-hero-copy">分享做菜心得、翻车补救和新手经验，让菜谱从工具变成交流场。</p>
        </section>

        <section className="panel mobile-page-section community-post-card">
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
            <button className={`ghost-button ${isSelectedPostLiked ? 'community-liked-button' : ''}`} onClick={() => onToggleLikePost(selectedPost.id)}>
              {isSelectedPostLiked ? '已点赞' : '点个赞'}
            </button>
            <button className="ghost-button" onClick={() => setView('compose')}>
              我也写一条
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (view === 'compose') {
    return (
      <main className="mobile-page-stack">
        <section className="panel mobile-page-section social-hero-card community-compose-hero">
          <div className="home-subpage-topbar">
            <button className="back-button ghost-button small-button" onClick={() => setView('feed')}>
              <span className="back-button-icon" aria-hidden="true">
                ←
              </span>
              <span>返回社区</span>
            </button>
          </div>

          <span className="section-kicker">发心得</span>
          <h1>发布一条做菜心得</h1>
          <p className="social-hero-copy">分享做菜心得、翻车补救和新手经验，让菜谱从工具变成交流场。</p>
        </section>

        <section className="panel mobile-page-section social-composer-card community-compose-card">
          <div className="community-compose-tips">
            <span className="section-kicker">发布建议</span>
            <p>标题尽量说清一道菜或一个技巧，内容更适合写步骤感受、踩坑点和解决办法。</p>
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
              <button className="ghost-button" onClick={() => setView('feed')}>
                先返回
              </button>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="mobile-page-stack">
      <section className="panel mobile-page-section social-hero-card">
        <span className="section-kicker">社区</span>
        <h1>做菜社区</h1>
        <p className="social-hero-copy">分享做菜心得、翻车补救和新手经验，让菜谱从工具变成交流场。</p>
      </section>

      <section className="panel mobile-page-section community-entry-card">
        <div className="community-entry-grid">
          <button className="community-entry-button" onClick={() => setView('compose')}>
            <span>发布</span>
            <strong>发一条心得</strong>
            <p>把这次做菜的小技巧、翻车点和心得发到社区里。</p>
          </button>
        </div>
      </section>

      <section className="panel mobile-page-section community-topic-card">
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
          <article key={post.id} className="panel mobile-page-section community-post-card">
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
  )
}
