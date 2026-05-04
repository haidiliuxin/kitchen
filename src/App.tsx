import { useEffect, useLayoutEffect, useState } from 'react'
import './App.css'
import { CommunityScreen } from './features/kitchen/CommunityScreen.js'
import type { CommunityPost } from './features/kitchen/CommunityScreen.js'
import { CookScreen } from './features/kitchen/CookScreen.js'
import { FinishScreen } from './features/kitchen/FinishScreen.js'
import { HomeScreen } from './features/kitchen/HomeScreen.js'
import { ImportScreen } from './features/kitchen/ImportScreen.js'
import { ProfileScreen } from './features/kitchen/ProfileScreen.js'
import { SearchHubScreen } from './features/kitchen/SearchHubScreen.js'
import { useKitchenApp } from './features/kitchen/useKitchenApp.js'

type MainTab = 'home' | 'community' | 'profile'

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

function forceScrollTop() {
  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
  document.scrollingElement?.scrollTo(0, 0)
}

function App() {
  const app = useKitchenApp()
  const [activeTab, setActiveTab] = useState<MainTab>('home')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [communityPosts, setCommunityPosts] = useState<CommunityPost[]>(initialCommunityPosts)
  const [likedPostIds, setLikedPostIds] = useState<string[]>([])
  const [favoriteRecipeIds, setFavoriteRecipeIds] = useState<string[]>([])
  const [lastCookingSession, setLastCookingSession] = useState<{ recipeId: string; stepIndex: number } | null>(null)
  const [communityDetailRequest, setCommunityDetailRequest] = useState<string | null>(null)
  const [isSearchScreenOpen, setIsSearchScreenOpen] = useState(false)
  const [isImportScreenOpen, setIsImportScreenOpen] = useState(false)
  const [importScreenEntryRequest, setImportScreenEntryRequest] = useState<{ view: 'default' | 'history'; token: number }>({
    view: 'default',
    token: 0,
  })
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [returnToSearchAfterDetail, setReturnToSearchAfterDetail] = useState(false)
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

  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  }, [])

  useLayoutEffect(() => {
    forceScrollTop()

    const timer = window.setTimeout(() => {
      forceScrollTop()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [activeTab, app.screen, isSearchScreenOpen, isImportScreenOpen])

  useEffect(() => {
    if (app.screen === 'cook' && app.selectedRecipe) {
      setLastCookingSession({
        recipeId: app.selectedRecipe.id,
        stepIndex: app.currentStepIndex,
      })
    }

    if (app.screen === 'finish') {
      setLastCookingSession(null)
    }
  }, [app.currentStepIndex, app.screen, app.selectedRecipe])

  const handleTabChange = (nextTab: MainTab) => {
    setActiveTab(nextTab)
    if (nextTab !== 'community') {
      setCommunityDetailRequest(null)
    }
    setIsSearchScreenOpen(false)
    setIsImportScreenOpen(false)
    setReturnToSearchAfterDetail(false)
    forceScrollTop()
    requestAnimationFrame(() => {
      forceScrollTop()
    })
  }

  const openSearchScreen = () => {
    setIsImportScreenOpen(false)
    setIsSearchScreenOpen(true)
    setReturnToSearchAfterDetail(false)
    forceScrollTop()
    requestAnimationFrame(() => {
      forceScrollTop()
    })
  }

  const closeSearchScreen = () => {
    setIsSearchScreenOpen(false)
    setReturnToSearchAfterDetail(false)
    forceScrollTop()
    requestAnimationFrame(() => {
      forceScrollTop()
    })
  }

  const openImportScreen = () => {
    setIsSearchScreenOpen(false)
    setIsImportScreenOpen(true)
    setImportScreenEntryRequest((previous) => ({ view: 'default', token: previous.token + 1 }))
    setReturnToSearchAfterDetail(false)
    forceScrollTop()
    requestAnimationFrame(() => {
      forceScrollTop()
    })
  }

  const closeImportScreen = () => {
    setIsImportScreenOpen(false)
    setReturnToSearchAfterDetail(false)
    forceScrollTop()
    requestAnimationFrame(() => {
      forceScrollTop()
    })
  }

  const openHomeEntry = (view: 'default' | 'history' | 'detail', recipeId?: string | null) => {
    setActiveTab('home')
    setIsSearchScreenOpen(false)
    setIsImportScreenOpen(false)
    setHomeEntryRequest((previous) => ({
      view,
      recipeId: recipeId ?? null,
      token: previous.token + 1,
    }))
    forceScrollTop()
    requestAnimationFrame(() => {
      forceScrollTop()
    })
  }

  const openImportHistoryEntry = () => {
    setIsSearchScreenOpen(false)
    setIsImportScreenOpen(true)
    setImportScreenEntryRequest((previous) => ({ view: 'history', token: previous.token + 1 }))
    forceScrollTop()
    requestAnimationFrame(() => {
      forceScrollTop()
    })
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
                setLastCookingSession(null)
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
                    onDetailBackToSearch={
                      returnToSearchAfterDetail
                        ? () => {
                            setReturnToSearchAfterDetail(false)
                            setIsSearchScreenOpen(true)
                            forceScrollTop()
                            requestAnimationFrame(() => {
                              forceScrollTop()
                            })
                          }
                        : undefined
                    }
                  />
                )}

                {activeTab === 'community' && (
                  <CommunityScreen
                    posts={communityPosts}
                    requestedPostId={communityDetailRequest}
                    likedPostIds={likedPostIds}
                    onToggleLikePost={handleToggleLikeCommunityPost}
                    onPublishPost={handlePublishCommunityPost}
                  />
                )}
                {activeTab === 'profile' && (
                  <ProfileScreen
                    isLoggedIn={isLoggedIn}
                    favoriteRecipes={favoriteRecipes}
                    recentHistoryItems={recentHistoryRecipes}
                    myPosts={myCommunityPosts}
                    onLoginToggle={() => setIsLoggedIn((previous) => !previous)}
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

          {!isSearchScreenOpen && !isImportScreenOpen ? (
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
