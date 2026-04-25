import './App.css'
import { CookScreen } from './features/kitchen/CookScreen.js'
import { DiscoverScreen } from './features/kitchen/DiscoverScreen.js'
import { FinishScreen } from './features/kitchen/FinishScreen.js'
import { useKitchenApp } from './features/kitchen/useKitchenApp.js'

function App() {
  const app = useKitchenApp()

  return (
    <div className="app-shell">
      {app.notice && (
        <div className="notice-banner">
          <span>{app.notice}</span>
          <button className="ghost-button small-button" onClick={() => app.setNotice(null)}>
            收起
          </button>
        </div>
      )}

      {app.screen === 'discover' && (
        <DiscoverScreen
          selectedRecipe={app.selectedRecipe}
          recipesData={app.recipesData}
          searchQuery={app.searchQuery}
          importUrl={app.importUrl}
          difficulty={app.difficulty}
          timeLimit={app.timeLimit}
          isRecipesLoading={app.isRecipesLoading}
          isImportingRecipe={app.isImportingRecipe}
          isHistoryLoading={app.isHistoryLoading}
          recipesError={app.recipesError}
          historyCount={app.history.length}
          currentRecipeCompletions={app.currentRecipeCompletions}
          onStartCooking={app.startCooking}
          onRetry={app.retryLoading}
          onSelectRecipe={(recipeId) => {
            app.setSelectedRecipeId(recipeId)
            app.setScreen('discover')
          }}
          onSearchQueryChange={app.setSearchQuery}
          onImportUrlChange={app.setImportUrl}
          onImportRecipe={() => {
            void app.importRecipe()
          }}
          onDifficultyChange={app.setDifficulty}
          onTimeLimitChange={app.setTimeLimit}
        />
      )}

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
          wakeWords={app.wakeWords}
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
          onRestartRecipe={app.startCooking}
          onOpenRecipe={(recipeId) => {
            app.setSelectedRecipeId(recipeId)
            app.setScreen('discover')
          }}
          onBackToDiscover={() => app.setScreen('discover')}
        />
      )}
    </div>
  )
}

export default App
