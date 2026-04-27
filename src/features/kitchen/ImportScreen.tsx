import { useEffect, useMemo, useState } from 'react'
import { analyzeImportLink } from '../../lib/api.js'
import type { ImportedRecipeSummary, ImportSourceType, Recipe } from '../../types.js'

type ImportScreenProps = {
  onBack: () => void
  recipesData: Recipe[]
  requestedEntry: { view: 'default' | 'history'; token: number }
  onOpenGeneratedRecipe: (recipeId: string) => void
  onImportCompleted: () => void
}

type ImportHistoryItem = {
  id: string
  title: string
  source: string
  time: string
  recipeId?: string
}

const IMPORT_HISTORY_STORAGE_KEY = 'kitchen-helper:import-history'

function readImportHistory(): ImportHistoryItem[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(IMPORT_HISTORY_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (item): item is ImportHistoryItem =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.source === 'string' &&
        typeof item.time === 'string',
    )
  } catch {
    return []
  }
}

export function ImportScreen({
  onBack,
  recipesData,
  requestedEntry,
  onOpenGeneratedRecipe,
  onImportCompleted,
}: ImportScreenProps) {
  const [importType, setImportType] = useState<ImportSourceType>('video')
  const [linkValue, setLinkValue] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [generatedRecipes, setGeneratedRecipes] = useState<ImportedRecipeSummary[]>([])
  const [validationMessage, setValidationMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [failureDialog, setFailureDialog] = useState<{ title: string; message: string } | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [selectedPreview, setSelectedPreview] = useState<ImportedRecipeSummary | null>(null)
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>(() => readImportHistory())

  const sourceLabel = importType === 'video' ? '视频链接' : '文档链接'
  const placeholder =
    importType === 'video'
      ? '粘贴视频链接，例如教程视频、短视频或课程地址'
      : '粘贴文档链接，例如图文菜谱、云文档或网页文章地址'

  useEffect(() => {
    if (!isAnalyzing) {
      return
    }

    const timer = window.setInterval(() => {
      setAnalysisProgress((current) => {
        if (current >= 90) {
          window.clearInterval(timer)
          return 90
        }

        return Math.min(current + 18, 90)
      })
    }, 260)

    return () => window.clearInterval(timer)
  }, [isAnalyzing])

  useEffect(() => {
    if (!requestedEntry.token) {
      return
    }

    setIsHistoryOpen(requestedEntry.view === 'history')
    setSelectedPreview(null)
  }, [requestedEntry])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(IMPORT_HISTORY_STORAGE_KEY, JSON.stringify(importHistory))
    } catch {
      // Ignore storage write failures.
    }
  }, [importHistory])

  const historyItems = useMemo<ImportHistoryItem[]>(() => {
    const generatedHistory = generatedRecipes.map((item, index) => ({
      id: `generated-history-${item.id}`,
      title: item.title,
      source: item.sourceLabel,
      time: index === 0 ? '刚刚' : `${index + 1} 次识别前`,
      recipeId: item.recipeId ?? undefined,
    }))

    return [...generatedHistory, ...importHistory]
  }, [generatedRecipes, importHistory])

  const statusText = useMemo(() => {
    if (validationMessage) {
      return validationMessage
    }

    if (isAnalyzing) {
      if (analysisProgress < 40) {
        return '正在抓取链接内容...'
      }

      if (analysisProgress < 80) {
        return '正在提取食材、步骤和关键火候...'
      }

      return '正在整理成标准菜谱结果...'
    }

    if (statusMessage) {
      return statusMessage
    }

    return '先粘贴一个链接，后面这里会显示识别进度和解析结果。'
  }, [analysisProgress, isAnalyzing, statusMessage, validationMessage])

  const handleStartAnalyze = async () => {
    if (!linkValue.trim()) {
      setValidationMessage('请先粘贴一个视频或文档链接。')
      return
    }

    setFailureDialog(null)
    setValidationMessage('')
    setStatusMessage('')
    setGeneratedRecipes([])
    setSelectedPreview(null)
    setAnalysisProgress(8)
    setIsAnalyzing(true)

    try {
      const result = await analyzeImportLink(importType, linkValue.trim())
      setGeneratedRecipes(result.importedRecipes)
      setStatusMessage(result.message)
      onImportCompleted()
      setImportHistory((previous) => [
        ...result.importedRecipes.map((item, index) => ({
          id: `import-${item.id}-${Date.now()}-${index}`,
          title: item.title,
          source: item.sourceLabel,
          time: '刚刚',
          recipeId: item.recipeId ?? undefined,
        })),
        ...previous,
      ].slice(0, 20))
      setAnalysisProgress(100)
    } catch (error) {
      setGeneratedRecipes([])
      setSelectedPreview(null)
      setAnalysisProgress(0)
      setFailureDialog({
        title: '导入识别失败',
        message: error instanceof Error ? error.message : '导入识别失败，请稍后再试。',
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleReset = () => {
    setLinkValue('')
    setValidationMessage('')
    setStatusMessage('')
    setGeneratedRecipes([])
    setSelectedPreview(null)
    setFailureDialog(null)
    setIsAnalyzing(false)
    setAnalysisProgress(0)
  }

  const findPreviewRecipe = (recipeId: string | null) =>
    recipeId ? recipesData.find((recipe) => recipe.id === recipeId) ?? null : null

  const renderPreviewOverlay = () => {
    if (!selectedPreview) {
      return null
    }

    const previewRecipe = findPreviewRecipe(selectedPreview.recipeId)

    return (
      <div className="app-subpage-overlay">
        <main className="mobile-page-stack app-subpage-sheet">
          <section className="panel mobile-page-section import-hero-card ds-page-header ds-overlay-header">
            <div className="import-topbar">
              <button type="button" className="back-button ghost-button small-button" onClick={() => setSelectedPreview(null)}>
                <span className="back-button-icon" aria-hidden="true">
                  ←
                </span>
                <span>返回导入结果</span>
              </button>
            </div>

            <span className="section-kicker">生成预览</span>
            <h1>{selectedPreview.title}</h1>
            <p className="import-hero-copy">先确认解析结果是否靠谱，再决定要不要继续进入完整菜谱详情。</p>
          </section>

          <section className="panel mobile-page-section import-result-card ds-card-section">
            <div className="import-preview-stack">
              <article className="import-result-item ds-card ds-card-import">
                <span>{selectedPreview.sourceLabel}</span>
                <strong>{selectedPreview.title}</strong>
                <p>{selectedPreview.summary}</p>
                <div className="import-result-tags">
                  {selectedPreview.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </article>

              {previewRecipe ? (
                <article className="status-card ds-card ds-card-state">
                  <h3>已经生成完整菜谱</h3>
                  <p>这份导入结果已经落进菜谱库，现在可以直接进入 {previewRecipe.title} 的详情页继续跟做。</p>
                </article>
              ) : (
                <article className="status-card ds-card ds-card-state">
                  <h3>暂时还没拿到详情页映射</h3>
                  <p>当前导入只完成了摘要预览，等后端返回完整菜谱后，这里就能直接进入详情。</p>
                </article>
              )}

              <div className="finish-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (selectedPreview.recipeId) {
                      onOpenGeneratedRecipe(selectedPreview.recipeId)
                    }
                  }}
                  disabled={!selectedPreview.recipeId}
                >
                  进入菜谱详情
                </button>
                <button type="button" className="ghost-button secondary-action-button" onClick={() => setSelectedPreview(null)}>
                  返回结果列表
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    )
  }

  const renderHistoryOverlay = () => {
    if (!isHistoryOpen) {
      return null
    }

    return (
      <div className="app-subpage-overlay">
        <main className="mobile-page-stack app-subpage-sheet">
          <section className="panel mobile-page-section import-hero-card ds-page-header ds-overlay-header">
            <div className="import-topbar">
              <button type="button" className="back-button ghost-button small-button" onClick={() => setIsHistoryOpen(false)}>
                <span className="back-button-icon" aria-hidden="true">
                  ←
                </span>
                <span>返回导入页</span>
              </button>
            </div>

            <span className="section-kicker">导入历史</span>
            <h1>最近识别过的链接</h1>
            <p className="import-hero-copy">这里会保留你最近导入过的链接结果，方便回看和继续完善。</p>
          </section>

          <section className="panel mobile-page-section import-history-card ds-card-section">
            <div className="import-history-list">
              {historyItems.map((item) => (
                <article key={item.id} className="import-history-item ds-card ds-card-asset">
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.source}</p>
                    <span>{item.time}</span>
                  </div>
                  {item.recipeId ? (
                    <button className="ghost-button small-button" type="button" onClick={() => onOpenGeneratedRecipe(item.recipeId!)}>
                      查看结果
                    </button>
                  ) : (
                    <span>{item.time}</span>
                  )}
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <>
      <main className="mobile-page-stack import-screen-shell">
        <section className="panel mobile-page-section import-hero-card ds-page-header ds-task-header">
          <div className="import-topbar">
            <button className="back-button ghost-button small-button" onClick={onBack}>
              <span className="back-button-icon" aria-hidden="true">
                ←
              </span>
              <span>返回</span>
            </button>
          </div>

          <span className="section-kicker">导入</span>
          <h1>识别链接生成菜谱</h1>
          <p className="import-hero-copy">粘贴视频或图文链接，系统会自动抽取步骤、食材和关键提示，整理成可跟做的菜谱。</p>
        </section>

        <section className="panel mobile-page-section import-form-card ds-card ds-card-task">
          <div className="import-type-row">
            <button
              type="button"
              className={`toggle-button ${importType === 'video' ? 'toggle-active' : ''}`}
              onClick={() => setImportType('video')}
            >
              视频链接
            </button>
            <button
              type="button"
              className={`toggle-button ${importType === 'document' ? 'toggle-active' : ''}`}
              onClick={() => setImportType('document')}
            >
              文档链接
            </button>
          </div>

          <label className="search-field import-link-field">
            <span>粘贴{sourceLabel}</span>
            <textarea value={linkValue} onChange={(event) => setLinkValue(event.target.value)} placeholder={placeholder} />
          </label>

          <div className="import-actions">
            <button className="primary-button" onClick={() => void handleStartAnalyze()} disabled={isAnalyzing}>
              {isAnalyzing ? '识别中...' : '开始识别'}
            </button>
            <button className="ghost-button secondary-action-button" onClick={handleReset}>
              清空
            </button>
          </div>
        </section>

        <section className="panel mobile-page-section import-entry-card ds-card-section">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-kicker">更多功能</span>
              <h3>继续进入其他入口</h3>
            </div>
          </div>

          <button type="button" className="home-import-entry import-history-entry" onClick={() => setIsHistoryOpen(true)}>
            <span className="home-import-entry-icon" aria-hidden="true">
              →
            </span>
            <span>查看导入历史</span>
          </button>
        </section>

        <section className="panel mobile-page-section import-tips-card ds-card ds-card-detail-info">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-kicker">识别说明</span>
              <h3>当前支持的导入内容</h3>
            </div>
          </div>
          <ul className="info-list">
            <li>视频链接会优先提取字幕、音频转写和页面正文。</li>
            <li>图文链接会抽取标题、正文、食材和步骤信息。</li>
            <li>识别完成后会直接生成可进入详情页的菜谱结果。</li>
          </ul>
        </section>

        <section className="panel mobile-page-section import-result-card ds-card-section">
          <div className="section-heading compact-heading">
            <div>
              <span className="section-kicker">识别结果</span>
              <h3>{generatedRecipes.length > 0 ? '生成的菜谱结果' : '等待链接解析'}</h3>
            </div>
          </div>

          {generatedRecipes.length > 0 ? (
            <div className="import-result-list">
              {generatedRecipes.map((item) => (
                <article key={item.id} className="import-result-item ds-card ds-card-import">
                  <span>{item.sourceLabel}</span>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                  <div className="import-result-tags">
                    {item.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="import-result-actions">
                    <button className="primary-button small-button" type="button" onClick={() => setSelectedPreview(item)}>
                      查看预览
                    </button>
                    <button
                      className="ghost-button small-button"
                      type="button"
                      onClick={() => {
                        if (item.recipeId) {
                          onOpenGeneratedRecipe(item.recipeId)
                        }
                      }}
                      disabled={!item.recipeId}
                    >
                      进入详情
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state ds-card ds-card-state">
              <h3>还没有识别内容</h3>
              <p>先粘贴一个链接，这里会展示解析出来的菜谱结果，并能继续进入详情页。</p>
            </div>
          )}
        </section>

        {isAnalyzing ? (
          <div className="import-progress-overlay" role="status" aria-live="polite" aria-label="识别状态">
            <div className="import-progress-dialog">
              <span className="section-kicker">识别状态</span>
              <h3>正在处理导入内容</h3>
              <div className="import-progress-track import-progress-track-overlay">
                <div className="import-progress-value" style={{ width: `${analysisProgress}%` }} />
              </div>
              <strong className="import-progress-number">{`${analysisProgress}%`}</strong>
              <p className="import-progress-copy">{statusText}</p>
            </div>
          </div>
        ) : null}

        {failureDialog ? (
          <div className="import-progress-overlay" role="alertdialog" aria-modal="true" aria-label="导入失败">
            <div className="import-progress-dialog import-failure-dialog">
              <span className="section-kicker">识别失败</span>
              <h3>{failureDialog.title}</h3>
              <p className="import-progress-copy">{failureDialog.message}</p>
              <div className="import-failure-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setFailureDialog(null)
                    void handleStartAnalyze()
                  }}
                >
                  重新识别
                </button>
                <button type="button" className="ghost-button secondary-action-button" onClick={() => setFailureDialog(null)}>
                  先返回修改
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {renderHistoryOverlay()}
      {renderPreviewOverlay()}
    </>
  )
}
