import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App.css'
import { CommunityScreen } from './features/kitchen/CommunityScreen.js'
import type { CommunityComment, CommunityPost } from './features/kitchen/CommunityScreen.js'
import { CookScreen } from './features/kitchen/CookScreen.js'
import { FinishScreen } from './features/kitchen/FinishScreen.js'
import { HomeScreen } from './features/kitchen/HomeScreen.js'
import { ImportScreen } from './features/kitchen/ImportScreen.js'
import { ProfileScreen } from './features/kitchen/ProfileScreen.js'
import type { ProfileView } from './features/kitchen/ProfileScreen.js'
import { SearchHubScreen } from './features/kitchen/SearchHubScreen.js'
import { useKitchenApp } from './features/kitchen/useKitchenApp.js'

type MainTab = 'home' | 'community' | 'profile'
type AuthState = {
  identifier: string
  password: string
  displayName: string
}
type CommunityCommentsByPostId = Record<string, CommunityComment[]>

const AUTH_STORAGE_KEY = 'kitchen-helper:auth'
const FAVORITES_STORAGE_KEY = 'kitchen-helper:favorites'
const LIKED_POSTS_STORAGE_KEY = 'kitchen-helper:liked-posts'
const COMMUNITY_POSTS_STORAGE_KEY = 'kitchen-helper:community-posts'
const COMMUNITY_COMMENTS_STORAGE_KEY = 'kitchen-helper:community-comments'

const tabItems: Array<{ id: MainTab; label: string; icon: string }> = [
  { id: 'home', label: '首页', icon: '●' },
  { id: 'community', label: '交流', icon: '●' },
  { id: 'profile', label: '我的', icon: '●' },
]

const initialCommunityPosts: CommunityPost[] = [
  {
    id: 'post-1',
    author: '小满',
    title: '番茄炒蛋别急着放盐',
    content: '我试了几次，先把番茄炒软再调味，最后鸡蛋回锅会更嫩，颜色也更亮。',
    likes: 128,
    tags: ['家常菜', '新手友好'],
  },
  {
    id: 'post-2',
    author: '阿周',
    title: '土豆丝切细一点真的很重要',
    content: '切得太粗很容易变成炖土豆。泡一下水再下锅，口感会清爽很多。',
    likes: 94,
    tags: ['刀工', '口感'],
  },
  {
    id: 'post-3',
    author: 'Momo',
    title: '做饭时我会先把调料排一列',
    content: '特别适合忙起来会手乱的人，按顺序摆好之后出错率低很多。',
    likes: 211,
    tags: ['厨房习惯', '备菜'],
  },
]

function readLocalStorageValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return fallback
    }

    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function getScrollTop() {
  return window.scrollY ?? document.documentElement.scrollTop ?? document.body.scrollTop ?? 0
}

function restoreScrollPosition(top: number) {
  window.scrollTo({ top, left: 0, behavior: 'auto' })
  document.documentElement.scrollTop = top
  document.body.scrollTop = top
  document.scrollingElement?.scrollTo({ top, left: 0, behavior: 'auto' })
}

function App() {
  const app = useKitchenApp()
  const [activeTab, setActiveTab] = useState<MainTab>('home')
  const [authState, setAuthState] = useState<AuthState | null>(() => readLocalStorageValue<AuthState | null>(AUTH_STORAGE_KEY, null))
  const [loginIdentifier, setLoginIdentifier] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [isHomeDetailOpen, setIsHomeDetailOpen] = useState(false)
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>(() =>
    readLocalStorageValue<CommunityPost[]>(COMMUNITY_POSTS_STORAGE_KEY, initialCommunityPosts),
  )
  const [communityCommentsByPostId, setCommunityCommentsByPostId] = useState<CommunityCommentsByPostId>(() =>
    readLocalStorageValue<CommunityCommentsByPostId>(COMMUNITY_COMMENTS_STORAGE_KEY, {}),
  )
  const [likedPostIds, setLikedPostIds] = useState<string[]>(() =>
    readLocalStorageValue<string[]>(LIKED_POSTS_STORAGE_KEY, []),
  )
  const [favoriteRecipeIds, setFavoriteRecipeIds] = useState<string[]>(() =>
    readLocalStorageValue<string[]>(FAVORITES_STORAGE_KEY, []),
  )
  const [lastCookingSession, setLastCookingSession] = useState<{ recipeId: string; stepIndex: number } | null>(null)
  const [communityDetailRequest, setCommunityDetailRequest] = useState<string | null>(null)
  const [isSearchScreenOpen, setIsSearchScreenOpen] = useState(false)
  const [isImportScreenOpen, setIsImportScreenOpen] = useState(false)
  const [importScreenEntryRequest, setImportScreenEntryRequest] = useState<{ view: 'default' | 'history'; token: number }>({
    view: 'default',
    token: 0,
  })
  const [profileView, setProfileView] = useState<ProfileView>('overview')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [returnToSearchAfterDetail, setReturnToSearchAfterDetail] = useState(false)
  const [homeView, setHomeView] = useState<'default' | 'history' | 'detail' | 'topics' | 'filters'>('default')
  const [homeEntryRequest, setHomeEntryRequest] = useState<{
    view: 'default' | 'history' | 'detail'
    recipeId?: string | null
    token: number
  }>({
    view: 'default',
    recipeId: null,
    token: 0,
  })

  const isCookingFlow = app.screen === 'cook' || app.screen === 'finish'
  const isLoggedIn = Boolean(authState)
  const currentUserLabel = authState?.displayName ?? '游客'
  const shouldShowBottomTabBar =
    !isSearchScreenOpen && !isImportScreenOpen && !(activeTab === 'home' && isHomeDetailOpen)
  const scrollPositionsRef = useRef<Record<string, number>>({})
  const currentViewKey = isCookingFlow
    ? `flow:${app.screen}`
    : isImportScreenOpen
      ? `overlay:import:${importScreenEntryRequest.view}`
      : isSearchScreenOpen
        ? 'overlay:search'
        : activeTab === 'home'
          ? `tab:home:${homeView}`
          : `tab:${activeTab}`

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      if (authState) {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState))
      } else {
        window.localStorage.removeItem(AUTH_STORAGE_KEY)
      }
    } catch {
      // Ignore storage write failures.
    }
  }, [authState])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteRecipeIds))
    } catch {
      // Ignore storage write failures.
    }
  }, [favoriteRecipeIds])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(LIKED_POSTS_STORAGE_KEY, JSON.stringify(likedPostIds))
    } catch {
      // Ignore storage write failures.
    }
  }, [likedPostIds])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(COMMUNITY_POSTS_STORAGE_KEY, JSON.stringify(communityPosts))
    } catch {
      // Ignore storage write failures.
    }
  }, [communityPosts])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(COMMUNITY_COMMENTS_STORAGE_KEY, JSON.stringify(communityCommentsByPostId))
    } catch {
      // Ignore storage write failures.
    }
  }, [communityCommentsByPostId])

  useLayoutEffect(() => {
    const savedTop = scrollPositionsRef.current[currentViewKey] ?? 0
    restoreScrollPosition(savedTop)
    const frameId = window.requestAnimationFrame(() => {
      restoreScrollPosition(savedTop)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      scrollPositionsRef.current[currentViewKey] = getScrollTop()
    }
  }, [currentViewKey])

  useEffect(() => {
    if (app.screen === 'cook' && app.selectedRecipe) {
      setLastCookingSession({
        recipeId: app.selectedRecipe.id,
        stepIndex: app.currentStepIndex,
      })
    }
  }, [app.currentStepIndex, app.screen, app.selectedRecipe])

  useEffect(() => {
    if (authState) {
      setLoginIdentifier(authState.identifier)
      return
    }

    setLoginIdentifier('')
  }, [authState])

  const handleTabChange = (nextTab: MainTab) => {
    setActiveTab(nextTab)
    setIsHomeDetailOpen(false)
    setHomeView('default')
    if (nextTab !== 'profile') {
      setProfileView('overview')
    }
    if (nextTab !== 'community') {
      setCommunityDetailRequest(null)
    }
    setIsSearchScreenOpen(false)
    setIsImportScreenOpen(false)
    setReturnToSearchAfterDetail(false)
  }

  const openSearchScreen = () => {
    setIsImportScreenOpen(false)
    setIsSearchScreenOpen(true)
    setIsHomeDetailOpen(false)
    setReturnToSearchAfterDetail(false)
  }

  const closeSearchScreen = () => {
    setIsSearchScreenOpen(false)
    setIsHomeDetailOpen(false)
    setReturnToSearchAfterDetail(false)
  }

  const openImportScreen = () => {
    setIsSearchScreenOpen(false)
    setIsImportScreenOpen(true)
    setIsHomeDetailOpen(false)
    setImportScreenEntryRequest((previous) => ({ view: 'default', token: previous.token + 1 }))
    setReturnToSearchAfterDetail(false)
  }

  const closeImportScreen = () => {
    setIsImportScreenOpen(false)
    setIsHomeDetailOpen(false)
    setReturnToSearchAfterDetail(false)
  }

  const openHomeEntry = (view: 'default' | 'history' | 'detail', recipeId?: string | null) => {
    setActiveTab('home')
    setIsSearchScreenOpen(false)
    setIsImportScreenOpen(false)
    setIsHomeDetailOpen(view === 'detail')
    setHomeView(view)
    setHomeEntryRequest((previous) => ({
      view,
      recipeId: recipeId ?? null,
      token: previous.token + 1,
    }))
  }

  const openImportHistoryEntry = () => {
    setIsSearchScreenOpen(false)
    setIsImportScreenOpen(true)
    setImportScreenEntryRequest((previous) => ({ view: 'history', token: previous.token + 1 }))
  }

  const saveRecentSearch = (value: string) => {
    const normalized = value.trim()
    if (!normalized) {
      return
    }

    setRecentSearches((previous) => [normalized, ...previous.filter((item) => item !== normalized)].slice(0, 8))
  }

  const handleToggleLikeCommunityPost = (postId: string) => {
    const liked = likedPostIds.includes(postId)
    setLikedPostIds((previous) =>
      liked ? previous.filter((item) => item !== postId) : [...previous, postId],
    )
    setCommunityPosts((previous) =>
      previous.map((post) =>
        post.id === postId ? { ...post, likes: liked ? Math.max(0, post.likes - 1) : post.likes + 1 } : post,
      ),
    )
  }

  const handlePublishCommunityPost = (payload: { title: string; content: string; tags: string[] }) => {
    setCommunityPosts((previous) => [
      {
        id: `post-${Date.now()}`,
        author: '我',
        title: payload.title,
        content: payload.content,
        likes: 0,
        tags: payload.tags,
        isMine: true,
      },
      ...previous,
    ])
  }

  const handleAddCommunityComment = (payload: { postId: string; content: string }) => {
    if (!isLoggedIn) {
      return
    }

    setCommunityCommentsByPostId((previous) => ({
      ...previous,
      [payload.postId]: [
        ...(previous[payload.postId] ?? []),
        {
          id: `comment-${Date.now()}`,
          author: currentUserLabel,
          content: payload.content,
          createdAt: new Date().toISOString(),
        },
      ],
    }))
  }

  const myCommunityPosts = communityPosts.filter((post) => post.isMine)
  const favoriteRecipes = app.recipesData.filter((recipe) => favoriteRecipeIds.includes(recipe.id))
  const recentHistoryRecipes = app.history
    .map((entry) => ({
      entry,
      recipe: app.recipesData.find((recipe) => recipe.id === entry.recipeId) ?? null,
    }))
    .filter((item): item is { entry: (typeof app.history)[number]; recipe: (typeof app.recipesData)[number] } => Boolean(item.recipe))
    .filter((item, index, all) => all.findIndex((candidate) => candidate.entry.recipeId === item.entry.recipeId) === index)
    .slice(0, 6)

  const toggleFavoriteRecipe = (recipeId: string) => {
    setFavoriteRecipeIds((previous) =>
      previous.includes(recipeId) ? previous.filter((item) => item !== recipeId) : [recipeId, ...previous],
    )
  }

  const clearRecentSearches = () => {
    setRecentSearches([])
  }

  const handleLoginSubmit = () => {
    const identifier = loginIdentifier.trim()
    const password = loginPassword.trim()
    if (!identifier || !password) {
      return
    }

    setAuthState({
      identifier,
      password,
      displayName: identifier.includes('@') ? identifier.split('@')[0] : identifier,
    })
    setLoginPassword('')
  }

  const handleLogout = () => {
    setAuthState(null)
    setLoginIdentifier('')
    setLoginPassword('')
  }

  const handleProfileViewChange = (nextView: ProfileView) => {
    scrollPositionsRef.current[`tab:profile:${profileView}`] = getScrollTop()
    setProfileView(nextView)
  }

  return (
    <div className={`app-shell ${isCookingFlow ? 'app-shell-cooking' : 'app-shell-mobile'}`}>
      {app.notice && (
        <div className="notice-banner">
          <span>{app.notice}</span>
          <button className="ghost-button small-button" onClick={() => app.setNotice(null)}>
            收起
          </button>
        </div>
      )}

      {isCookingFlow ? (
        <>
          {app.screen === 'cook' && app.selectedRecipe && app.currentStep && (
            <CookScreen
              selectedRecipe={app.selectedRecipe}
              currentStep={app.currentStep}
              currentStepIndex={app.currentStepIndex}
              timerLeft={app.timerLeft}
              isTimerRunning={app.isTimerRunning}
              voiceEnabled={app.voiceEnabled}
              voiceStatus={app.voiceStatus}
              lastVoiceCommand={app.lastVoiceCommand}
              liveCoachNote={app.liveCoachNote}
              messages={app.messages}
              quickPrompts={app.quickPrompts}
              assistantInput={app.assistantInput}
              isAssistantLoading={app.isAssistantLoading}
              isFinishing={app.isFinishing}
              onBackToDiscover={() => {
                app.setScreen('discover')
                app.disableVoice()
              }}
              onJumpToStep={app.jumpToStep}
              onToggleTimer={() => app.setIsTimerRunning((previous) => !previous)}
              onResetTimer={() => {
                app.setTimerLeft(app.currentStep.durationMinutes * 60)
                app.setIsTimerRunning(false)
              }}
              onToggleVoice={() => {
                void app.toggleVoice()
              }}
              onPromptClick={(question) => {
                void app.submitAssistantQuestion(question)
              }}
              onAssistantInputChange={app.setAssistantInput}
              onAssistantSubmit={() => {
                const question = app.assistantInput.trim()
                if (!question) {
                  return
                }

                void app.submitAssistantQuestion(question)
                app.setAssistantInput('')
              }}
              onFinishCooking={() => {
                void app.finishCooking()
              }}
            />
          )}

          {app.screen === 'finish' && app.selectedRecipe && (
            <FinishScreen
              selectedRecipe={app.selectedRecipe}
              recommendations={app.recommendations}
              historyCount={app.history.length}
              currentRecipeCompletions={app.currentRecipeCompletions}
              isFavorite={app.selectedRecipe ? favoriteRecipeIds.includes(app.selectedRecipe.id) : false}
              onRestartRecipe={app.startCooking}
              onToggleFavorite={() => {
                if (app.selectedRecipe) {
                  toggleFavoriteRecipe(app.selectedRecipe.id)
                }
              }}
              onOpenCurrentRecipeDetail={() => {
                if (app.selectedRecipe) {
                  app.setSelectedRecipeId(app.selectedRecipe.id)
                }
                app.setScreen('discover')
                openHomeEntry('detail', app.selectedRecipe?.id ?? null)
              }}
              onOpenRecentHistory={() => {
                app.setScreen('discover')
                openHomeEntry('history')
              }}
              onOpenCommunity={() => {
                app.setScreen('discover')
                handleTabChange('community')
              }}
              onOpenRecipe={(recipeId) => {
                app.setSelectedRecipeId(recipeId)
                app.setScreen('discover')
                openHomeEntry('detail', recipeId)
              }}
              onBackToDiscover={() => {
                app.setScreen('discover')
                openHomeEntry('default')
              }}
            />
          )}
        </>
      ) : (
        <div className="mobile-app-frame">
          <div className="mobile-app-content">
            {isImportScreenOpen ? (
              <ImportScreen
                onBack={closeImportScreen}
                recipesData={app.recipesData}
                requestedEntry={importScreenEntryRequest}
                onOpenGeneratedRecipe={(recipeId) => {
                  app.setSelectedRecipeId(recipeId)
                  app.setScreen('discover')
                  setIsImportScreenOpen(false)
                  openHomeEntry('detail', recipeId)
                }}
              />
            ) : isSearchScreenOpen ? (
              <SearchHubScreen
                recipesData={app.recipesData}
                searchQuery={app.searchQuery}
                onSearchQueryChange={app.setSearchQuery}
                recentSearches={recentSearches}
                onSaveRecentSearch={saveRecentSearch}
                onClearRecentSearches={clearRecentSearches}
                onOpenRecipe={(recipeId) => {
                  saveRecentSearch(app.searchQuery)
                  setReturnToSearchAfterDetail(true)
                  app.setSelectedRecipeId(recipeId)
                  app.setScreen('discover')
                  setIsSearchScreenOpen(false)
                  openHomeEntry('detail', recipeId)
                }}
              />
            ) : (
              <>
                {activeTab === 'home' && (
                  <HomeScreen
                    selectedRecipe={app.selectedRecipe}
                    recipesData={app.recipesData}
                    searchQuery={app.searchQuery}
                    difficulty={app.difficulty as any}
                    timeLimit={app.timeLimit}
                    isRecipesLoading={app.isRecipesLoading}
                    isHistoryLoading={app.isHistoryLoading}
                    recipesError={app.recipesError}
                    historyCount={app.history.length}
                    history={app.history}
                    currentRecipeCompletions={app.currentRecipeCompletions}
                    requestedEntry={homeEntryRequest}
                    favoriteRecipeIds={favoriteRecipeIds}
                    ongoingCookingSession={lastCookingSession}
                    onStartCooking={app.startCooking}
                    onResumeCooking={(recipeId, stepIndex) => app.resumeCooking(recipeId, stepIndex)}
                    onToggleFavorite={toggleFavoriteRecipe}
                    onRetry={app.retryLoading}
                    onSelectRecipe={(recipeId) => {
                      app.setSelectedRecipeId(recipeId)
                      app.setScreen('discover')
                    }}
                    onSearchQueryChange={app.setSearchQuery}
                    onDifficultyChange={app.setDifficulty as any}
                    onTimeLimitChange={app.setTimeLimit}
                    onSearchEntryClick={openSearchScreen}
                    onImportEntryClick={openImportScreen}
                    onDetailOpenChange={setIsHomeDetailOpen}
                    onViewChange={setHomeView}
                    onDetailBackToSearch={
                      returnToSearchAfterDetail
                        ? () => {
                            setReturnToSearchAfterDetail(false)
                            setIsSearchScreenOpen(true)
                          }
                        : undefined
                    }
                  />
                )}

                {activeTab === 'community' && (
                  <CommunityScreen
                    posts={communityPosts}
                    commentsByPostId={communityCommentsByPostId}
                    requestedPostId={communityDetailRequest}
                    likedPostIds={likedPostIds}
                    isLoggedIn={isLoggedIn}
                    currentUserLabel={currentUserLabel}
                    onToggleLikePost={handleToggleLikeCommunityPost}
                    onPublishPost={handlePublishCommunityPost}
                    onAddComment={handleAddCommunityComment}
                  />
                )}
                {activeTab === 'profile' && (
                  <ProfileScreen
                    isLoggedIn={isLoggedIn}
                    loginIdentifier={loginIdentifier}
                    loginPassword={loginPassword}
                    currentUserLabel={currentUserLabel}
                    favoriteRecipes={favoriteRecipes}
                    recentHistoryItems={recentHistoryRecipes}
                    myPosts={myCommunityPosts}
                    view={profileView}
                    onViewChange={handleProfileViewChange}
                    onLoginIdentifierChange={setLoginIdentifier}
                    onLoginPasswordChange={setLoginPassword}
                    onLoginSubmit={handleLoginSubmit}
                    onLogout={handleLogout}
                    onOpenFavoriteRecipe={(recipeId) => openHomeEntry('detail', recipeId)}
                    onOpenHistoryRecipe={(recipeId) => openHomeEntry('detail', recipeId)}
                    onOpenImportHistory={openImportHistoryEntry}
                    onOpenMyPost={(postId) => {
                      setCommunityDetailRequest(postId)
                      handleTabChange('community')
                    }}
                  />
                )}
              </>
            )}
          </div>

          {shouldShowBottomTabBar ? (
            <nav className="bottom-tab-bar bottom-tab-bar-compact" aria-label="主导航">
              {tabItems.map((item) => (
                <button
                  key={item.id}
                  className={`bottom-tab-item ${activeTab === item.id ? 'bottom-tab-item-active' : ''}`}
                  onClick={() => handleTabChange(item.id)}
                >
                  <span className="bottom-tab-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          ) : (
            <div className="bottom-tab-bar bottom-tab-bar-search-return">
              <button
                className="bottom-tab-item bottom-tab-item-active"
                onClick={isImportScreenOpen ? closeImportScreen : closeSearchScreen}
              >
                <span className="bottom-tab-icon" aria-hidden="true">
                  ←
                </span>
                <span>返回首页</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
